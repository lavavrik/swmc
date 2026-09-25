package handler

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// Personal access tokens let an agent (the MCP server) use the library
// without a browser. They never expire; the owner revokes them.
const (
	tokenPrefix    = "swmc_"
	maxTokens      = 20
	maxTokenName   = 80
	tokenShownHead = len(tokenPrefix) + 6
)

var (
	errNoToken       = errors.New("no token")
	errTooManyTokens = errors.New("too many tokens")
)

// APIToken is what the token list shows. The secret is only returned once,
// by CreateToken.
type APIToken struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Prefix     string `json:"prefix"`
	CreatedAt  int64  `json:"createdAt"`
	LastUsedAt int64  `json:"lastUsedAt,omitempty"`
}

func isAPIToken(raw string) bool {
	return strings.HasPrefix(raw, tokenPrefix)
}

func hashToken(raw string) []byte {
	sum := sha256.Sum256([]byte(raw))
	return sum[:]
}

func cleanTokenName(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		name = "Agent"
	}
	if len(name) > maxTokenName {
		name = name[:maxTokenName]
	}
	return name
}

func (s *Store) CreateToken(ctx context.Context, userID, name string) (APIToken, string, error) {
	var count int
	if err := s.pool.QueryRow(ctx,
		`SELECT count(*) FROM api_tokens WHERE user_id = $1::uuid`, userID,
	).Scan(&count); err != nil {
		return APIToken{}, "", err
	}
	if count >= maxTokens {
		return APIToken{}, "", errTooManyTokens
	}
	buf := make([]byte, 24)
	if _, err := rand.Read(buf); err != nil {
		return APIToken{}, "", err
	}
	raw := tokenPrefix + hex.EncodeToString(buf)
	t := APIToken{Name: cleanTokenName(name), Prefix: raw[:tokenShownHead]}
	var created time.Time
	err := s.pool.QueryRow(ctx, `
		INSERT INTO api_tokens (user_id, name, prefix, token_hash)
		VALUES ($1::uuid, $2, $3, $4)
		RETURNING id::text, created_at`,
		userID, t.Name, t.Prefix, hashToken(raw),
	).Scan(&t.ID, &created)
	if err != nil {
		return APIToken{}, "", err
	}
	t.CreatedAt = created.UnixMilli()
	return t, raw, nil
}

func (s *Store) ListTokens(ctx context.Context, userID string) ([]APIToken, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id::text, name, prefix, created_at, last_used_at
		FROM api_tokens WHERE user_id = $1::uuid
		ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]APIToken, 0)
	for rows.Next() {
		var t APIToken
		var created time.Time
		var used *time.Time
		if err := rows.Scan(&t.ID, &t.Name, &t.Prefix, &created, &used); err != nil {
			return nil, err
		}
		t.CreatedAt = created.UnixMilli()
		if used != nil {
			t.LastUsedAt = used.UnixMilli()
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *Store) DeleteToken(ctx context.Context, userID, id string) error {
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM api_tokens WHERE user_id = $1::uuid AND id::text = $2`,
		userID, id,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errNotFound
	}
	return nil
}

// UserForToken resolves a personal access token and records its use.
func (s *Store) UserForToken(ctx context.Context, raw string) (User, error) {
	if !isAPIToken(raw) {
		return User{}, errNoToken
	}
	var u User
	err := s.pool.QueryRow(ctx, `
		UPDATE api_tokens t SET last_used_at = now()
		FROM users u
		WHERE t.token_hash = $1 AND u.id = t.user_id
		RETURNING u.id::text, u.email`,
		hashToken(raw),
	).Scan(&u.ID, &u.Email)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, errNoToken
	}
	if err != nil {
		return User{}, err
	}
	return u, nil
}
