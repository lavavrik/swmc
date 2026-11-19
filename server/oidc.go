package handler

import (
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// AccessVerifier checks an OIDC access token. The live verifier talks to
// the issuer's JWKS; tests inject a stub.
type AccessVerifier interface {
	Verify(ctx context.Context, token string) (OIDCClaims, error)
}

// OIDCClaims are the fields the library needs after a successful verify.
type OIDCClaims struct {
	Sub   string
	Email string
}

var (
	errBadToken   = errors.New("bad token")
	errBadAlg     = errors.New("token alg must be RS256")
	errBadSig     = errors.New("bad token signature")
	errBadClaims  = errors.New("token claims rejected")
	errUnknownKey = errors.New("unknown signing key")
)

const jwksTTL = time.Hour
const jwtSkew = 60 * time.Second

// Verifier fetches the issuer's JWKS and checks RS256 access tokens.
//
// The hosted SPA and API can live on different hosts, so a session cookie
// would be cross-site. The SPA sends Authorization: Bearer instead, and we
// verify locally against JWKS without sharing any secret with the issuer.
type Verifier struct {
	issuer      string
	audience    string
	jwksURL     string
	userinfoURL string
	client      *http.Client

	mu      sync.Mutex
	keys    map[string]*rsa.PublicKey
	fetched time.Time
}

// NewVerifier builds a verifier for one public client. issuer is the OIDC
// issuer URL; audience is that client's id.
func NewVerifier(issuer, audience string) (*Verifier, error) {
	issuer = strings.TrimRight(strings.TrimSpace(issuer), "/")
	audience = strings.TrimSpace(audience)
	if issuer == "" || audience == "" {
		return nil, errors.New("OIDC_ISSUER and OIDC_CLIENT_ID are required together")
	}
	return &Verifier{
		issuer:      issuer,
		audience:    audience,
		jwksURL:     issuer + "/oidc/jwks",
		userinfoURL: issuer + "/oidc/userinfo",
		client:      &http.Client{Timeout: 10 * time.Second},
		keys:        map[string]*rsa.PublicKey{},
	}, nil
}

func (v *Verifier) Verify(ctx context.Context, token string) (OIDCClaims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return OIDCClaims{}, errBadToken
	}
	headerJSON, err := b64(parts[0])
	if err != nil {
		return OIDCClaims{}, errBadToken
	}
	var header struct {
		Alg string `json:"alg"`
		Kid string `json:"kid"`
	}
	if json.Unmarshal(headerJSON, &header) != nil {
		return OIDCClaims{}, errBadToken
	}
	if header.Alg != "RS256" {
		return OIDCClaims{}, errBadAlg
	}
	key, err := v.key(ctx, header.Kid)
	if err != nil {
		return OIDCClaims{}, err
	}
	sig, err := b64(parts[2])
	if err != nil {
		return OIDCClaims{}, errBadToken
	}
	sum := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	if rsa.VerifyPKCS1v15(key, crypto.SHA256, sum[:], sig) != nil {
		return OIDCClaims{}, errBadSig
	}
	payload, err := b64(parts[1])
	if err != nil {
		return OIDCClaims{}, errBadToken
	}
	var c struct {
		Iss      string   `json:"iss"`
		Sub      string   `json:"sub"`
		Aud      audience `json:"aud"`
		Exp      int64    `json:"exp"`
		Nbf      int64    `json:"nbf"`
		Email    string   `json:"email"`
		Username string   `json:"preferred_username"`
		TokenUse string   `json:"token_use"`
	}
	if json.Unmarshal(payload, &c) != nil {
		return OIDCClaims{}, errBadToken
	}
	now := time.Now()
	if c.Iss != v.issuer || c.Sub == "" || !c.Aud.includes(v.audience) {
		return OIDCClaims{}, errBadClaims
	}
	if c.TokenUse != "" && c.TokenUse != "access" {
		return OIDCClaims{}, errBadClaims
	}
	if c.Exp == 0 || now.After(time.Unix(c.Exp, 0).Add(jwtSkew)) {
		return OIDCClaims{}, errBadClaims
	}
	if c.Nbf != 0 && now.Before(time.Unix(c.Nbf, 0).Add(-jwtSkew)) {
		return OIDCClaims{}, errBadClaims
	}
	// Access tokens often omit email (it sits on the id token /
	// userinfo). The library still needs a unique address.
	email := oidcEmail(c.Sub, c.Email)
	if !validEmail(c.Email) && validEmail(c.Username) {
		email = oidcEmail(c.Sub, c.Username)
	}
	if !validEmail(c.Email) && !validEmail(c.Username) && v.userinfoURL != "" {
		if got := v.lookupEmail(ctx, token); validEmail(got) {
			email = normalizeEmail(got)
		}
	}
	return OIDCClaims{Sub: c.Sub, Email: email}, nil
}

// syntheticEmailDomain names accounts whose issuer gives no email:
// <sub>@<domain>. oidcFromEnv sets it from the issuer.
var syntheticEmailDomain = "oidc.invalid"

// emailDomainFor is OIDC_EMAIL_DOMAIN when set, else "oidc." + the issuer's
// host, so the synthetic addresses stay the same for as long as the issuer does.
func emailDomainFor(issuer, override string) string {
	if d := strings.TrimSpace(override); d != "" {
		return strings.ToLower(d)
	}
	if u, err := url.Parse(strings.TrimSpace(issuer)); err == nil && u.Hostname() != "" {
		return "oidc." + strings.ToLower(u.Hostname())
	}
	return "oidc.invalid"
}

func oidcEmail(sub, email string) string {
	email = normalizeEmail(email)
	if validEmail(email) {
		return email
	}
	return strings.ToLower(strings.TrimSpace(sub)) + "@" + syntheticEmailDomain
}

func shouldReplaceEmail(have, want string) bool {
	if have == want || !validEmail(want) {
		return false
	}
	if strings.HasSuffix(want, "@"+syntheticEmailDomain) {
		return false
	}
	return true
}

func (v *Verifier) lookupEmail(ctx context.Context, token string) string {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, v.userinfoURL, nil)
	if err != nil {
		return ""
	}
	req.Header.Set("Authorization", "Bearer "+token)
	res, err := v.client.Do(req)
	if err != nil {
		return ""
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return ""
	}
	var body struct {
		Email string `json:"email"`
	}
	if json.NewDecoder(io.LimitReader(res.Body, 1<<16)).Decode(&body) != nil {
		return ""
	}
	return body.Email
}

func (v *Verifier) key(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	v.mu.Lock()
	defer v.mu.Unlock()
	if k, ok := v.keys[kid]; ok && time.Since(v.fetched) < jwksTTL {
		return k, nil
	}
	if err := v.refreshLocked(ctx); err != nil {
		if k, ok := v.keys[kid]; ok {
			return k, nil
		}
		if kid == "" && len(v.keys) == 1 {
			for _, k := range v.keys {
				return k, nil
			}
		}
		return nil, err
	}
	if k, ok := v.keys[kid]; ok {
		return k, nil
	}
	if kid == "" && len(v.keys) == 1 {
		for _, k := range v.keys {
			return k, nil
		}
	}
	return nil, errUnknownKey
}

func (v *Verifier) refreshLocked(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, v.jwksURL, nil)
	if err != nil {
		return err
	}
	res, err := v.client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("jwks: %s", res.Status)
	}
	body, err := io.ReadAll(io.LimitReader(res.Body, 1<<16))
	if err != nil {
		return err
	}
	var doc struct {
		Keys []struct {
			Kid string `json:"kid"`
			Kty string `json:"kty"`
			N   string `json:"n"`
			E   string `json:"e"`
		} `json:"keys"`
	}
	if json.Unmarshal(body, &doc) != nil {
		return errBadToken
	}
	next := map[string]*rsa.PublicKey{}
	for _, k := range doc.Keys {
		if k.Kty != "RSA" || k.N == "" || k.E == "" {
			continue
		}
		pub, err := rsaFromNE(k.N, k.E)
		if err != nil {
			continue
		}
		next[k.Kid] = pub
	}
	if len(next) == 0 {
		return errUnknownKey
	}
	v.keys = next
	v.fetched = time.Now()
	return nil
}

type audience []string

func (a *audience) UnmarshalJSON(b []byte) error {
	var s string
	if json.Unmarshal(b, &s) == nil {
		*a = []string{s}
		return nil
	}
	var ss []string
	if err := json.Unmarshal(b, &ss); err != nil {
		return err
	}
	*a = ss
	return nil
}

func (a audience) includes(want string) bool {
	for _, x := range a {
		if x == want {
			return true
		}
	}
	return false
}

func rsaFromNE(nB64, eB64 string) (*rsa.PublicKey, error) {
	nBytes, err := b64(nB64)
	if err != nil {
		return nil, err
	}
	eBytes, err := b64(eB64)
	if err != nil {
		return nil, err
	}
	e := new(big.Int).SetBytes(eBytes)
	if !e.IsInt64() || e.Int64() < 2 {
		return nil, errUnknownKey
	}
	return &rsa.PublicKey{N: new(big.Int).SetBytes(nBytes), E: int(e.Int64())}, nil
}

func b64(s string) ([]byte, error) {
	return base64.RawURLEncoding.DecodeString(s)
}

func bearer(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if !strings.HasPrefix(h, "Bearer ") {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
}
