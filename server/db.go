package handler

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

//go:embed migrate.sql
var migrateSQL embed.FS

const (
	sessionTTL    = 30 * 24 * time.Hour
	bcryptCost    = 12
	minPassword   = 8
	maxEmailBytes = 254
)

var (
	errEmailTaken  = errors.New("email taken")
	errBadLogin    = errors.New("bad login")
	errBadPassword = errors.New("password too short")
	errBadEmail    = errors.New("bad email")
	errNoSession   = errors.New("no session")
)

// User is the signed-in account. Id is a UUID string.
type User struct {
	ID    string `json:"id"`
	Email string `json:"email"`
}

func Open(ctx context.Context, url string) (*Store, error) {
	if !strings.Contains(url, "sslmode=") {
		if strings.Contains(url, "?") {
			url += "&sslmode=disable"
		} else {
			url += "?sslmode=disable"
		}
	}
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	sql, err := migrateSQL.ReadFile("migrate.sql")
	if err != nil {
		pool.Close()
		return nil, err
	}
	if _, err := pool.Exec(ctx, string(sql)); err != nil {
		pool.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return &Store{pool: pool}, nil
}

func (s *Store) Close() {
	s.pool.Close()
}

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func validEmail(email string) bool {
	if len(email) < 3 || len(email) > maxEmailBytes {
		return false
	}
	at := strings.LastIndexByte(email, '@')
	return at > 0 && at < len(email)-1 && !strings.Contains(email, " ")
}

func (s *Store) CreateUser(ctx context.Context, email, password string) (User, string, error) {
	email = normalizeEmail(email)
	if !validEmail(email) {
		return User{}, "", errBadEmail
	}
	if len(password) < minPassword {
		return User{}, "", errBadPassword
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return User{}, "", err
	}
	var id string
	err = s.pool.QueryRow(ctx,
		`INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id::text`,
		email, string(hash),
	).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "users_email_lower") || strings.Contains(err.Error(), "unique") {
			return User{}, "", errEmailTaken
		}
		return User{}, "", err
	}
	token, err := s.createSession(ctx, id)
	if err != nil {
		return User{}, "", err
	}
	return User{ID: id, Email: email}, token, nil
}

func (s *Store) Authenticate(ctx context.Context, email, password string) (User, string, error) {
	email = normalizeEmail(email)
	var id string
	var hash *string
	err := s.pool.QueryRow(ctx,
		`SELECT id::text, password_hash FROM users WHERE lower(email) = $1`,
		email,
	).Scan(&id, &hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, "", errBadLogin
	}
	if err != nil {
		return User{}, "", err
	}
	if hash == nil || bcrypt.CompareHashAndPassword([]byte(*hash), []byte(password)) != nil {
		return User{}, "", errBadLogin
	}
	token, err := s.createSession(ctx, id)
	if err != nil {
		return User{}, "", err
	}
	return User{ID: id, Email: email}, token, nil
}

func (s *Store) createSession(ctx context.Context, userID string) (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	token := hex.EncodeToString(raw)
	sum := sha256.Sum256([]byte(token))
	_, err := s.pool.Exec(ctx,
		`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`,
		sum[:], userID, time.Now().Add(sessionTTL),
	)
	if err != nil {
		return "", err
	}
	return token, nil
}

func (s *Store) UserForSession(ctx context.Context, token string) (User, error) {
	if token == "" {
		return User{}, errNoSession
	}
	sum := sha256.Sum256([]byte(token))
	var u User
	err := s.pool.QueryRow(ctx, `
		SELECT u.id::text, u.email
		FROM sessions s
		JOIN users u ON u.id = s.user_id
		WHERE s.token_hash = $1 AND s.expires_at > now()`,
		sum[:],
	).Scan(&u.ID, &u.Email)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, errNoSession
	}
	if err != nil {
		return User{}, err
	}
	return u, nil
}

func (s *Store) DeleteSession(ctx context.Context, token string) error {
	if token == "" {
		return nil
	}
	sum := sha256.Sum256([]byte(token))
	_, err := s.pool.Exec(ctx, `DELETE FROM sessions WHERE token_hash = $1`, sum[:])
	return err
}

func uniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "users_email_lower") ||
		strings.Contains(msg, "users_oidc_sub") ||
		strings.Contains(msg, "unique")
}

// UpsertOIDCUser finds or creates the library account for an OIDC user.
// sub is the OIDC `sub`; it is stable across logins.
func (s *Store) UpsertOIDCUser(ctx context.Context, sub, email string) (User, error) {
	if strings.TrimSpace(sub) == "" {
		return User{}, errBadEmail
	}
	email = oidcEmail(sub, email)
	var u User
	err := s.pool.QueryRow(ctx, `
		SELECT id::text, email FROM users WHERE oidc_sub = $1`,
		sub,
	).Scan(&u.ID, &u.Email)
	if err == nil {
		if shouldReplaceEmail(u.Email, email) {
			_, _ = s.pool.Exec(ctx, `UPDATE users SET email = $2 WHERE id = $1::uuid`, u.ID, email)
			u.Email = email
		}
		return u, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return User{}, err
	}
	err = s.pool.QueryRow(ctx, `
		INSERT INTO users (email, oidc_sub) VALUES ($1, $2)
		RETURNING id::text, email`,
		email, sub,
	).Scan(&u.ID, &u.Email)
	if err == nil {
		return u, nil
	}
	if uniqueViolation(err) {
		err = s.pool.QueryRow(ctx, `
			SELECT id::text, email FROM users WHERE oidc_sub = $1`,
			sub,
		).Scan(&u.ID, &u.Email)
		if err == nil {
			return u, nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return User{}, err
		}
	} else {
		return User{}, err
	}
	err = s.pool.QueryRow(ctx, `
		UPDATE users SET oidc_sub = $2
		WHERE lower(email) = $1 AND oidc_sub IS NULL
		RETURNING id::text, email`,
		email, sub,
	).Scan(&u.ID, &u.Email)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, errEmailTaken
	}
	return u, err
}
