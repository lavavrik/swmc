package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func testApp(t *testing.T, token, origin string) *App {
	t.Helper()
	s, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return newApp(s, token, origin)
}

func do(app *App, method, path, body, token string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if body != "" {
		req.Header.Set("Content-Type", "application/xml")
	}
	rec := httptest.NewRecorder()
	app.ServeHTTP(rec, req)
	return rec
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
	a := testApp(t, "", "")
	rec := do(a, http.MethodGet, "/", "", "")
	if rec.Code != 200 {
		t.Fatalf("GET /: %d", rec.Code)
	}
	rec = do(a, http.MethodGet, "/nope", "", "")
	if rec.Code != 404 {
		t.Fatalf("GET /nope: %d", rec.Code)
	}
}

func TestSaveOpenDelete(t *testing.T) {
	a := testApp(t, "secret", "*")

	rec := do(a, http.MethodPut, "/microcontrollers/test-rig", sampleXML, "secret")
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

	rec = do(a, http.MethodGet, "/microcontrollers/test-rig", "", "")
	if rec.Code != 200 {
		t.Fatalf("GET: %d", rec.Code)
	}
	if rec.Header().Get("Content-Type") != "application/xml; charset=utf-8" {
		t.Fatalf("content-type: %s", rec.Header().Get("Content-Type"))
	}
	if rec.Body.String() != sampleXML {
		t.Fatal("xml mismatch")
	}

	rec = do(a, http.MethodGet, "/microcontrollers", "", "")
	if rec.Code != 200 {
		t.Fatalf("LIST: %d", rec.Code)
	}
	var all []Summary
	if err := json.NewDecoder(rec.Body).Decode(&all); err != nil {
		t.Fatal(err)
	}
	if len(all) != 1 || all[0].ID != "test-rig" {
		t.Fatalf("list: %+v", all)
	}

	rec = do(a, http.MethodDelete, "/microcontrollers/test-rig", "", "secret")
	if rec.Code != 204 {
		t.Fatalf("DELETE: %d", rec.Code)
	}
	rec = do(a, http.MethodGet, "/microcontrollers/test-rig", "", "")
	if rec.Code != 404 {
		t.Fatalf("GET after delete: %d", rec.Code)
	}
}

func TestWritesNeedTokenReadsDoNot(t *testing.T) {
	a := testApp(t, "secret", "")
	if rec := do(a, http.MethodPut, "/microcontrollers/test-rig", sampleXML, ""); rec.Code != 401 {
		t.Fatalf("PUT without token: %d", rec.Code)
	}
	if rec := do(a, http.MethodPut, "/microcontrollers/test-rig", sampleXML, "wrong"); rec.Code != 401 {
		t.Fatalf("PUT wrong token: %d", rec.Code)
	}
	if rec := do(a, http.MethodPut, "/microcontrollers/test-rig", sampleXML, "secret"); rec.Code != 200 {
		t.Fatalf("PUT good token: %d %s", rec.Code, rec.Body.String())
	}
	if rec := do(a, http.MethodGet, "/microcontrollers", "", ""); rec.Code != 200 {
		t.Fatalf("public list: %d", rec.Code)
	}
	if rec := do(a, http.MethodDelete, "/microcontrollers/test-rig", "", ""); rec.Code != 401 {
		t.Fatalf("DELETE without token: %d", rec.Code)
	}
}

func TestOpenWritesWhenNoTokenConfigured(t *testing.T) {
	a := testApp(t, "", "")
	if rec := do(a, http.MethodPut, "/microcontrollers/test-rig", sampleXML, ""); rec.Code != 200 {
		t.Fatalf("open PUT: %d", rec.Code)
	}
}

func TestPutRejectsGarbage(t *testing.T) {
	a := testApp(t, "", "")
	if rec := do(a, http.MethodPut, "/microcontrollers/test-rig", "<html/>", ""); rec.Code != 400 {
		t.Fatalf("garbage: %d", rec.Code)
	}
	if rec := do(a, http.MethodPut, "/microcontrollers/Not_Valid", sampleXML, ""); rec.Code != 400 {
		t.Fatalf("bad id: %d", rec.Code)
	}
}

func TestCorsPreflight(t *testing.T) {
	a := testApp(t, "secret", "https://swmc-ui.example")
	req := httptest.NewRequest(http.MethodOptions, "/microcontrollers/x", nil)
	req.Header.Set("Origin", "https://swmc-ui.example")
	rec := httptest.NewRecorder()
	a.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("preflight: %d", rec.Code)
	}
	if rec.Header().Get("Access-Control-Allow-Origin") != "https://swmc-ui.example" {
		t.Fatalf("allow-origin: %q", rec.Header().Get("Access-Control-Allow-Origin"))
	}
	if !strings.Contains(rec.Header().Get("Access-Control-Allow-Headers"), "Authorization") {
		t.Fatalf("allow-headers: %q", rec.Header().Get("Access-Control-Allow-Headers"))
	}
}

func TestCorsStar(t *testing.T) {
	a := testApp(t, "", "*")
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	rec := httptest.NewRecorder()
	a.ServeHTTP(rec, req)
	if rec.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Fatalf("allow-origin: %q", rec.Header().Get("Access-Control-Allow-Origin"))
	}
}

func TestInitUsesDataDir(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("DATA_DIR", dir)
	t.Setenv("API_TOKEN", "t")
	t.Setenv("ALLOWED_ORIGIN", "*")
	if err := Init(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { app = nil })
	rec := httptest.NewRecorder()
	Handle(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != 200 {
		t.Fatalf("after Init: %d", rec.Code)
	}
	body, _ := io.ReadAll(rec.Body)
	if !strings.Contains(string(body), "swmc-library") {
		t.Fatalf("body: %s", body)
	}
}
