package handler

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"
)

var (
	app     *App
	initErr error
)

const cookieName = "swmc_session"

// Init is called by the cloudhost runner after each successful build.
func Init() error {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		initErr = errors.New("DATABASE_URL is required")
		return initErr
	}
	var store *Store
	var err error
	for i := 0; i < 12; i++ {
		store, err = Open(context.Background(), url)
		if err == nil {
			break
		}
		slog.Error("postgres not ready", "attempt", i+1, "err", err)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		initErr = err
		return err
	}
	app = newApp(store, os.Getenv("ALLOWED_ORIGIN"))
	slog.Info("swmc library ready")
	return nil
}

// Handle is the required cloudhost entry point.
func Handle(w http.ResponseWriter, r *http.Request) {
	if app == nil {
		msg := "service unavailable"
		if initErr != nil {
			msg = initErr.Error()
		}
		http.Error(w, msg, http.StatusServiceUnavailable)
		return
	}
	app.ServeHTTP(w, r)
}

type App struct {
	store         *Store
	allowedOrigin string
	mux           *http.ServeMux
}

func newApp(store *Store, allowedOrigin string) *App {
	a := &App{store: store, allowedOrigin: allowedOrigin}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /{$}", a.root)
	mux.HandleFunc("POST /auth/register", a.register)
	mux.HandleFunc("POST /auth/login", a.login)
	mux.HandleFunc("POST /auth/logout", a.logout)
	mux.HandleFunc("GET /auth/me", a.me)
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
	a.mux.ServeHTTP(w, r)
}

func (a *App) setCORS(w http.ResponseWriter, r *http.Request) {
	allow := strings.TrimSpace(a.allowedOrigin)
	origin := r.Header.Get("Origin")
	if allow == "*" {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	} else if allow != "" {
		for _, o := range strings.Split(allow, ",") {
			if strings.TrimSpace(o) == origin {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				break
			}
		}
		w.Header().Set("Vary", "Origin")
	}
	w.Header().Set("Access-Control-Allow-Credentials", "true")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
}

func (a *App) currentUser(r *http.Request) (User, bool) {
	c, err := r.Cookie(cookieName)
	if err != nil || c.Value == "" {
		return User{}, false
	}
	u, err := a.store.UserForSession(r.Context(), c.Value)
	if err != nil {
		return User{}, false
	}
	return u, true
}

func (a *App) requireUser(w http.ResponseWriter, r *http.Request) (User, bool) {
	u, ok := a.currentUser(r)
	if !ok {
		writeErr(w, http.StatusUnauthorized, "unauthorized")
		return User{}, false
	}
	return u, true
}

func (a *App) setSession(w http.ResponseWriter, r *http.Request, token string) {
	secure := r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https"
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Now().Add(sessionTTL),
	})
}

func (a *App) clearSession(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})
}

type authBody struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (a *App) register(w http.ResponseWriter, r *http.Request) {
	var body authBody
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<12)).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "bad body")
		return
	}
	u, token, err := a.store.CreateUser(r.Context(), body.Email, body.Password)
	switch {
	case errors.Is(err, errBadEmail):
		writeErr(w, http.StatusBadRequest, "bad email")
	case errors.Is(err, errBadPassword):
		writeErr(w, http.StatusBadRequest, "password must be at least 8 characters")
	case errors.Is(err, errEmailTaken):
		writeErr(w, http.StatusConflict, "email taken")
	case err != nil:
		writeErr(w, http.StatusInternalServerError, "register failed")
	default:
		a.setSession(w, r, token)
		writeJSON(w, http.StatusCreated, u)
	}
}

func (a *App) login(w http.ResponseWriter, r *http.Request) {
	var body authBody
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<12)).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "bad body")
		return
	}
	u, token, err := a.store.Authenticate(r.Context(), body.Email, body.Password)
	switch {
	case errors.Is(err, errBadLogin):
		writeErr(w, http.StatusUnauthorized, "bad login")
	case err != nil:
		writeErr(w, http.StatusInternalServerError, "login failed")
	default:
		a.setSession(w, r, token)
		writeJSON(w, http.StatusOK, u)
	}
}

func (a *App) logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(cookieName); err == nil {
		_ = a.store.DeleteSession(r.Context(), c.Value)
	}
	a.clearSession(w)
	w.WriteHeader(http.StatusNoContent)
}

func (a *App) me(w http.ResponseWriter, r *http.Request) {
	u, ok := a.requireUser(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, u)
}

func (a *App) root(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"service": "swmc-library"})
}

func (a *App) list(w http.ResponseWriter, r *http.Request) {
	u, ok := a.requireUser(w, r)
	if !ok {
		return
	}
	all, err := a.store.List(r.Context(), u.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "list failed")
		return
	}
	writeJSON(w, http.StatusOK, all)
}

func (a *App) get(w http.ResponseWriter, r *http.Request) {
	u, ok := a.requireUser(w, r)
	if !ok {
		return
	}
	xml, _, err := a.store.Get(r.Context(), u.ID, r.PathValue("id"))
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
	u, ok := a.requireUser(w, r)
	if !ok {
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxXMLBytes+1))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "bad body")
		return
	}
	sum, err := a.store.Put(r.Context(), u.ID, r.PathValue("id"), string(body))
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
	u, ok := a.requireUser(w, r)
	if !ok {
		return
	}
	err := a.store.Delete(r.Context(), u.ID, r.PathValue("id"))
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
