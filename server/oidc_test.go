package handler

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestVerifierAcceptsAccessToken(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	jwks := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"keys": []map[string]string{{
				"kty": "RSA",
				"kid": "test",
				"n":   base64.RawURLEncoding.EncodeToString(key.N.Bytes()),
				"e":   base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.PublicKey.E)).Bytes()),
			}},
		})
	}))
	t.Cleanup(jwks.Close)

	v, err := NewVerifier("https://id.example.com", "client-1")
	if err != nil {
		t.Fatal(err)
	}
	v.jwksURL = jwks.URL
	v.userinfoURL = ""
	v.client = jwks.Client()

	tok := mint(t, key, "test", map[string]any{
		"iss":       "https://id.example.com",
		"sub":       "user-1",
		"aud":       "client-1",
		"email":     "a@example.com",
		"token_use": "access",
		"iat":       time.Now().Unix(),
		"nbf":       time.Now().Unix(),
		"exp":       time.Now().Add(time.Minute).Unix(),
	})
	got, err := v.Verify(context.Background(), tok)
	if err != nil {
		t.Fatal(err)
	}
	if got.Sub != "user-1" || got.Email != "a@example.com" {
		t.Fatalf("claims: %+v", got)
	}
}

func TestVerifierRejectsWrongAudAlgAndExpired(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	jwks := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"keys": []map[string]string{{
				"kty": "RSA",
				"kid": "test",
				"n":   base64.RawURLEncoding.EncodeToString(key.N.Bytes()),
				"e":   base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.PublicKey.E)).Bytes()),
			}},
		})
	}))
	t.Cleanup(jwks.Close)
	v, err := NewVerifier("https://id.example.com", "client-1")
	if err != nil {
		t.Fatal(err)
	}
	v.jwksURL = jwks.URL
	v.userinfoURL = ""
	v.client = jwks.Client()

	claims := map[string]any{
		"iss":       "https://id.example.com",
		"sub":       "user-1",
		"aud":       "other",
		"token_use": "access",
		"exp":       time.Now().Add(time.Minute).Unix(),
	}
	if _, err := v.Verify(context.Background(), mint(t, key, "test", claims)); err == nil {
		t.Fatal("wrong aud")
	}
	claims["aud"] = "client-1"
	claims["token_use"] = "id"
	if _, err := v.Verify(context.Background(), mint(t, key, "test", claims)); err == nil {
		t.Fatal("id token as access")
	}
	claims["token_use"] = "access"
	claims["exp"] = time.Now().Add(-2 * time.Minute).Unix()
	if _, err := v.Verify(context.Background(), mint(t, key, "test", claims)); err == nil {
		t.Fatal("expired")
	}
}

func TestVerifierFillsEmailWhenAccessTokenOmitsIt(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/jwks", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"keys": []map[string]string{{
				"kty": "RSA",
				"kid": "test",
				"n":   base64.RawURLEncoding.EncodeToString(key.N.Bytes()),
				"e":   base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.PublicKey.E)).Bytes()),
			}},
		})
	})
	mux.HandleFunc("/userinfo", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]string{"email": "from-info@example.com"})
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	v, err := NewVerifier("https://id.example.com", "client-1")
	if err != nil {
		t.Fatal(err)
	}
	v.jwksURL = srv.URL + "/jwks"
	v.userinfoURL = srv.URL + "/userinfo"
	v.client = srv.Client()

	claims := map[string]any{
		"iss":       "https://id.example.com",
		"sub":       "user-1",
		"aud":       "client-1",
		"token_use": "access",
		"exp":       time.Now().Add(time.Minute).Unix(),
	}
	got, err := v.Verify(context.Background(), mint(t, key, "test", claims))
	if err != nil {
		t.Fatal(err)
	}
	if got.Email != "from-info@example.com" {
		t.Fatalf("userinfo email: %s", got.Email)
	}

	v.userinfoURL = ""
	got, err = v.Verify(context.Background(), mint(t, key, "test", claims))
	if err != nil {
		t.Fatal(err)
	}
	if got.Email != "user-1@oidc.invalid" {
		t.Fatalf("synthetic email: %s", got.Email)
	}
}

func mint(t *testing.T, key *rsa.PrivateKey, kid string, claims map[string]any) string {
	t.Helper()
	header, err := json.Marshal(map[string]string{"alg": "RS256", "kid": kid, "typ": "JWT"})
	if err != nil {
		t.Fatal(err)
	}
	payload, err := json.Marshal(claims)
	if err != nil {
		t.Fatal(err)
	}
	h := base64.RawURLEncoding.EncodeToString(header)
	p := base64.RawURLEncoding.EncodeToString(payload)
	sum := sha256.Sum256([]byte(h + "." + p))
	sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, sum[:])
	if err != nil {
		t.Fatal(err)
	}
	return h + "." + p + "." + base64.RawURLEncoding.EncodeToString(sig)
}

func TestEmailDomainFollowsTheIssuer(t *testing.T) {
	cases := []struct{ issuer, override, want string }{
		{"https://id.example.com", "", "oidc.id.example.com"},
		{"https://ID.Example.com/realms/x/", "", "oidc.id.example.com"},
		{"https://id.example.com", "Accounts.Example", "accounts.example"},
		{"", "", "oidc.invalid"},
	}
	for _, c := range cases {
		if got := emailDomainFor(c.issuer, c.override); got != c.want {
			t.Errorf("emailDomainFor(%q, %q) = %q, want %q", c.issuer, c.override, got, c.want)
		}
	}
}
