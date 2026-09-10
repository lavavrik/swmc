package handler

import (
	"context"
	"encoding/xml"
	"errors"
	"html"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const maxXMLBytes = 2 << 20

var (
	errNotFound = errors.New("not found")
	errBadID    = errors.New("bad id")
	errBadXML   = errors.New("not a microcontroller")
	errTooLarge = errors.New("too large")
)

// Summary is what the open dialog lists. The document itself is the XML.
type Summary struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	Description    string `json:"description,omitempty"`
	UpdatedAt      int64  `json:"updatedAt"`
	ComponentCount int    `json:"componentCount"`
}

// Store is the per-user microcontroller library in Postgres.
type Store struct {
	pool *pgxpool.Pool
}

func validID(id string) bool {
	if len(id) == 0 || len(id) > 64 {
		return false
	}
	for i, c := range id {
		if c >= 'a' && c <= 'z' || c >= '0' && c <= '9' {
			continue
		}
		if c == '-' && i > 0 && i < len(id)-1 {
			continue
		}
		return false
	}
	return true
}

func (s *Store) List(ctx context.Context, userID string) ([]Summary, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT slug, name, description, component_count, updated_at
		FROM projects WHERE user_id = $1::uuid
		ORDER BY updated_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]Summary, 0)
	for rows.Next() {
		var sum Summary
		var updated time.Time
		if err := rows.Scan(&sum.ID, &sum.Name, &sum.Description, &sum.ComponentCount, &updated); err != nil {
			return nil, err
		}
		sum.UpdatedAt = updated.UnixMilli()
		out = append(out, sum)
	}
	return out, rows.Err()
}

func (s *Store) Get(ctx context.Context, userID, slug string) (string, Summary, error) {
	if !validID(slug) {
		return "", Summary{}, errBadID
	}
	var xml string
	var sum Summary
	var updated time.Time
	err := s.pool.QueryRow(ctx, `
		SELECT slug, name, description, xml, component_count, updated_at
		FROM projects WHERE user_id = $1::uuid AND slug = $2`,
		userID, slug,
	).Scan(&sum.ID, &sum.Name, &sum.Description, &xml, &sum.ComponentCount, &updated)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", Summary{}, errNotFound
	}
	if err != nil {
		return "", Summary{}, err
	}
	sum.UpdatedAt = updated.UnixMilli()
	return xml, sum, nil
}

func (s *Store) Put(ctx context.Context, userID, slug, doc string) (Summary, error) {
	if !validID(slug) {
		return Summary{}, errBadID
	}
	if len(doc) > maxXMLBytes {
		return Summary{}, errTooLarge
	}
	if !looksLikeMC(doc) {
		return Summary{}, errBadXML
	}
	name, description, count := xmlMeta([]byte(doc))
	if name == "" {
		name = slug
	}
	var updated time.Time
	err := s.pool.QueryRow(ctx, `
		INSERT INTO projects (user_id, slug, name, description, xml, component_count, updated_at)
		VALUES ($1::uuid, $2, $3, $4, $5, $6, now())
		ON CONFLICT (user_id, slug) DO UPDATE SET
			name = excluded.name,
			description = excluded.description,
			xml = excluded.xml,
			component_count = excluded.component_count,
			updated_at = now()
		RETURNING updated_at`,
		userID, slug, name, description, doc, count,
	).Scan(&updated)
	if err != nil {
		return Summary{}, err
	}
	return Summary{
		ID:             slug,
		Name:           name,
		Description:    description,
		UpdatedAt:      updated.UnixMilli(),
		ComponentCount: count,
	}, nil
}

func (s *Store) Delete(ctx context.Context, userID, slug string) error {
	if !validID(slug) {
		return errBadID
	}
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM projects WHERE user_id = $1::uuid AND slug = $2`,
		userID, slug,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errNotFound
	}
	return nil
}

func looksLikeMC(doc string) bool {
	return strings.Contains(doc, "<microprocessor")
}

func xmlMeta(data []byte) (name, description string, components int) {
	var root struct {
		Name        string `xml:"name,attr"`
		Description string `xml:"description,attr"`
	}
	_ = xml.Unmarshal(data, &root)
	return html.UnescapeString(root.Name), html.UnescapeString(root.Description), strings.Count(string(data), `<c type="`)
}
