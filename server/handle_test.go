package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func testApp(t *testing.T) *App {
	t.Helper()
	return newApp(testStore(t), "http://localhost:5173")
}

func do(app *App, method, path, body string, cookies []*http.Cookie, contentType string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	for _, c := range cookies {
		req.AddCookie(c)
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	req.Header.Set("Origin", "http://localhost:5173")
	rec := httptest.NewRecorder()
	app.ServeHTTP(rec, req)
	return rec
}

func sessionOf(rec *httptest.ResponseRecorder) []*http.Cookie {
	var out []*http.Cookie
	for _, c := range rec.Result().Cookies() {
		if c.Name == cookieName && c.Value != "" {
			out = append(out, c)
		}
	}
	return out
}

func TestHandleBeforeInitReturns503(t *testing.T) {
	saved := app
	app = nil
	t.Cleanup(func() { app = saved })
	rec := httptest.NewRecorder()
	Handle(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("want 503, got %d", rec.Code)
	}
}

func TestRootAndUnknown(t *testing.T) {
	a := testApp(t)
	rec := do(a, http.MethodGet, "/", "", nil, "")
	if rec.Code != 200 {
		t.Fatalf("GET /: %d", rec.Code)
	}
	rec = do(a, http.MethodGet, "/nope", "", nil, "")
	if rec.Code != 404 {
		t.Fatalf("GET /nope: %d", rec.Code)
	}
}

func TestAuthAndPrivateLibrary(t *testing.T) {
	a := testApp(t)

	rec := do(a, http.MethodGet, "/microcontrollers", "", nil, "")
	if rec.Code != 401 {
		t.Fatalf("list anon: %d", rec.Code)
	}

	rec = do(a, http.MethodPost, "/auth/register", `{"email":"u@example.com","password":"password1"}`, nil, "application/json")
	if rec.Code != 201 {
		t.Fatalf("register: %d %s", rec.Code, rec.Body.String())
	}
	cookies := sessionOf(rec)
	if len(cookies) != 1 {
		t.Fatalf("cookies: %+v", rec.Result().Cookies())
	}

	rec = do(a, http.MethodGet, "/auth/me", "", cookies, "")
	if rec.Code != 200 {
		t.Fatalf("me: %d", rec.Code)
	}

	rec = do(a, http.MethodPut, "/microcontrollers/test-rig", sampleXML, cookies, "application/xml")
	if rec.Code != 200 {
		t.Fatalf("PUT: %d %s", rec.Code, rec.Body.String())
	}
	var sum Summary
	if err := json.NewDecoder(rec.Body).Decode(&sum); err != nil {
		t.Fatal(err)
	}
	if sum.Name != "Test Rig" || sum.ComponentCount != 2 {
		t.Fatalf("summary: %+v", sum)
	}

	rec = do(a, http.MethodGet, "/microcontrollers/test-rig", "", cookies, "")
	if rec.Code != 200 {
		t.Fatalf("GET: %d", rec.Code)
	}
	if rec.Body.String() != sampleXML {
		t.Fatal("xml mismatch")
	}

	rec = do(a, http.MethodGet, "/microcontrollers", "", cookies, "")
	if rec.Code != 200 {
		t.Fatalf("list: %d", rec.Code)
	}

	rec = do(a, http.MethodPost, "/auth/logout", "", cookies, "")
	if rec.Code != 204 {
		t.Fatalf("logout: %d", rec.Code)
	}
	rec = do(a, http.MethodGet, "/microcontrollers", "", cookies, "")
	if rec.Code != 401 {
		t.Fatalf("list after logout: %d", rec.Code)
	}
}

func TestRegisterValidation(t *testing.T) {
	a := testApp(t)
	rec := do(a, http.MethodPost, "/auth/register", `{"email":"nope","password":"password1"}`, nil, "application/json")
	if rec.Code != 400 {
		t.Fatalf("bad email: %d", rec.Code)
	}
	rec = do(a, http.MethodPost, "/auth/register", `{"email":"ok@example.com","password":"short"}`, nil, "application/json")
	if rec.Code != 400 {
		t.Fatalf("short password: %d", rec.Code)
	}
}

func TestCORSCredentials(t *testing.T) {
	a := testApp(t)
	req := httptest.NewRequest(http.MethodOptions, "/microcontrollers", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	rec := httptest.NewRecorder()
	a.ServeHTTP(rec, req)
	if rec.Code != 204 {
		t.Fatalf("options: %d", rec.Code)
	}
	if rec.Header().Get("Access-Control-Allow-Origin") != "http://localhost:5173" {
		t.Fatalf("origin: %s", rec.Header().Get("Access-Control-Allow-Origin"))
	}
	if rec.Header().Get("Access-Control-Allow-Credentials") != "true" {
		t.Fatal("credentials")
	}
}
