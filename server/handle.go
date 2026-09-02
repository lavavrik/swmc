package handler

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

var app *App

// Init is called by the cloudhost runner after each successful build.
func Init() error {
	dataDir := os.Getenv("DATA_DIR")
	if dataDir == "" {
		dataDir = "/data"
	}
	store, err := Open(filepath.Join(dataDir, "library"))
	if err != nil {
		return err
	}
	app = newApp(store, os.Getenv("API_TOKEN"), os.Getenv("ALLOWED_ORIGIN"))
	slog.Info("swmc library ready", "dir", store.dir)
	return nil
}

// Handle is the required cloudhost entry point.
func Handle(w http.ResponseWriter, r *http.Request) {
	if app == nil {
		http.Error(w, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	app.ServeHTTP(w, r)
}

type App struct {
	store         *Store
	token         string
	allowedOrigin string
	mux           *http.ServeMux
}

func newApp(store *Store, token, allowedOrigin string) *App {
	a := &App{store: store, token: token, allowedOrigin: allowedOrigin}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /{$}", a.root)
	mux.HandleFunc("GET /microcontrollers", a.list)
	mux.HandleFunc("GET /microcontrollers/{id}", a.get)
	mux.HandleFunc("PUT /microcontrollers/{id}", a.put)
	mux.HandleFunc("DELETE /microcontrollers/{id}", a.del)
	a.mux = mux
	return a
}

func (a *App) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	a.setCORS(w, r)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if !a.authorized(r) {
		writeErr(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	a.mux.ServeHTTP(w, r)
}

func (a *App) setCORS(w http.ResponseWriter, r *http.Request) {
	allow := strings.TrimSpace(a.allowedOrigin)
	if allow == "" || allow == "*" {
		w.Header().Set("Access-Control-Allow-Origin", "*")
	} else {
		origin := r.Header.Get("Origin")
		for _, o := range strings.Split(allow, ",") {
			if strings.TrimSpace(o) == origin {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				break
			}
		}
		w.Header().Set("Vary", "Origin")
	}
	w.Header().Set("Access-Control-Allow-Methods", "GET, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
}

// Reads are public so the open dialog works for anyone using the SPA.
// Writes need API_TOKEN when it is set — bake the same value into the SPA as
// VITE_API_TOKEN. An empty token means the instance is open (local dev).
func (a *App) authorized(r *http.Request) bool {
	if r.Method == http.MethodGet || r.Method == http.MethodHead {
		return true
	}
	if a.token == "" {
		return true
	}
	got, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok || len(got) != len(a.token) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(got), []byte(a.token)) == 1
}

func (a *App) root(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"service": "swmc-library"})
}

func (a *App) list(w http.ResponseWriter, _ *http.Request) {
	all, err := a.store.List()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "list failed")
		return
	}
	writeJSON(w, http.StatusOK, all)
}

func (a *App) get(w http.ResponseWriter, r *http.Request) {
	xml, _, err := a.store.Get(r.PathValue("id"))
	if errors.Is(err, errBadID) {
		writeErr(w, http.StatusBadRequest, "bad id")
		return
	}
	if errors.Is(err, errNotFound) {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "load failed")
		return
	}
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = io.WriteString(w, xml)
}

func (a *App) put(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxXMLBytes+1))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "bad body")
		return
	}
	sum, err := a.store.Put(r.PathValue("id"), string(body))
	switch {
	case errors.Is(err, errBadID):
		writeErr(w, http.StatusBadRequest, "bad id")
	case errors.Is(err, errTooLarge):
		writeErr(w, http.StatusRequestEntityTooLarge, "too large")
	case errors.Is(err, errBadXML):
		writeErr(w, http.StatusBadRequest, "not a microcontroller")
	case err != nil:
		writeErr(w, http.StatusInternalServerError, "save failed")
	default:
		writeJSON(w, http.StatusOK, sum)
	}
}

func (a *App) del(w http.ResponseWriter, r *http.Request) {
	err := a.store.Delete(r.PathValue("id"))
	switch {
	case errors.Is(err, errBadID):
		writeErr(w, http.StatusBadRequest, "bad id")
	case errors.Is(err, errNotFound):
		writeErr(w, http.StatusNotFound, "not found")
	case err != nil:
		writeErr(w, http.StatusInternalServerError, "delete failed")
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
