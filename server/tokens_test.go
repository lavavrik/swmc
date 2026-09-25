package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func doBearer(app *App, method, path, body, token, contentType string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	rec := httptest.NewRecorder()
	app.ServeHTTP(rec, req)
	return rec
}

func TestTokensAndRecipes(t *testing.T) {
	a := testApp(t)
	rec := do(a, http.MethodPost, "/auth/register", `{"email":"agent@example.com","password":"password1"}`, nil, "application/json")
	if rec.Code != 201 {
		t.Fatalf("register: %d", rec.Code)
	}
	cookies := sessionOf(rec)

	rec = do(a, http.MethodPost, "/tokens", `{"name":"Claude Code"}`, cookies, "application/json")
	if rec.Code != 201 {
		t.Fatalf("create token: %d %s", rec.Code, rec.Body.String())
	}
	var created struct {
		APIToken
		Token string `json:"token"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&created); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(created.Token, "swmc_") || created.Name != "Claude Code" {
		t.Fatalf("token: %+v", created)
	}
	if !strings.HasPrefix(created.Token, created.Prefix) || len(created.Prefix) >= len(created.Token) {
		t.Fatalf("prefix %q of %q", created.Prefix, created.Token)
	}
	tok := created.Token

	rec = doBearer(a, http.MethodGet, "/auth/me", "", tok, "")
	if rec.Code != 200 {
		t.Fatalf("me via token: %d", rec.Code)
	}

	// A token cannot manage tokens.
	rec = doBearer(a, http.MethodPost, "/tokens", `{}`, tok, "application/json")
	if rec.Code != 403 {
		t.Fatalf("token minting token: %d", rec.Code)
	}

	body, _ := json.Marshal(map[string]string{"xml": sampleXML, "recipe": "name: Test Rig\n"})
	rec = doBearer(a, http.MethodPut, "/microcontrollers/test-rig", string(body), tok, "application/json")
	if rec.Code != 200 {
		t.Fatalf("PUT json: %d %s", rec.Code, rec.Body.String())
	}
	var sum Summary
	_ = json.NewDecoder(rec.Body).Decode(&sum)
	if !sum.HasRecipe || sum.RecipeStale {
		t.Fatalf("after agent save: %+v", sum)
	}

	rec = doBearer(a, http.MethodGet, "/microcontrollers/test-rig/recipe", "", tok, "")
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"recipe":"name: Test Rig\n"`) {
		t.Fatalf("recipe: %d %s", rec.Code, rec.Body.String())
	}

	// The editor saves XML only: the recipe survives, marked stale.
	rec = do(a, http.MethodPut, "/microcontrollers/test-rig", sampleXML, cookies, "application/xml")
	if rec.Code != 200 {
		t.Fatalf("PUT xml: %d", rec.Code)
	}
	_ = json.NewDecoder(rec.Body).Decode(&sum)
	if !sum.HasRecipe || !sum.RecipeStale {
		t.Fatalf("after editor save: %+v", sum)
	}

	rec = doBearer(a, http.MethodGet, "/microcontrollers/nope/recipe", "", tok, "")
	if rec.Code != 404 {
		t.Fatalf("missing recipe: %d", rec.Code)
	}

	rec = do(a, http.MethodGet, "/tokens", "", cookies, "")
	var list []APIToken
	_ = json.NewDecoder(rec.Body).Decode(&list)
	if len(list) != 1 || list[0].LastUsedAt == 0 {
		t.Fatalf("list: %+v", list)
	}

	rec = do(a, http.MethodDelete, "/tokens/"+created.ID, "", cookies, "")
	if rec.Code != 204 {
		t.Fatalf("revoke: %d", rec.Code)
	}
	rec = doBearer(a, http.MethodGet, "/microcontrollers", "", tok, "")
	if rec.Code != 401 {
		t.Fatalf("revoked token: %d", rec.Code)
	}
	rec = doBearer(a, http.MethodGet, "/microcontrollers", "", "swmc_nope", "")
	if rec.Code != 401 {
		t.Fatalf("unknown token: %d", rec.Code)
	}
}
