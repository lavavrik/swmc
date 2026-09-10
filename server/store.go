package handler

import (
	"encoding/xml"
	"errors"
	"html"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

const maxXMLBytes = 2 << 20

var (
	errNotFound = errors.New("not found")
	errBadID    = errors.New("bad id")
	errBadXML   = errors.New("not a microcontroller")
	errTooLarge = errors.New("too large")

	// Same slug the editor derives from a name: lowercase, hyphenated, no dots.
	idRe = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
)

// Summary is what the open dialog lists. The document itself is the XML file.
type Summary struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	Description    string `json:"description,omitempty"`
	UpdatedAt      int64  `json:"updatedAt"`
	ComponentCount int    `json:"componentCount"`
}

// Store keeps one .xml file per microcontroller under dir.
//
// The files live in a subdirectory of the functions volume (/data/library),
// not in /data itself: the functions runner watches /data and rebuilds on
// every change there. Nested writes do not fire that watcher.
type Store struct {
	dir string
}

func Open(dir string) (*Store, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	return &Store{dir: dir}, nil
}

func validID(id string) bool {
	return len(id) > 0 && len(id) <= 64 && idRe.MatchString(id)
}

func (s *Store) path(id string) string {
	return filepath.Join(s.dir, id+".xml")
}

func (s *Store) List() ([]Summary, error) {
	entries, err := os.ReadDir(s.dir)
	if err != nil {
		return nil, err
	}
	out := make([]Summary, 0, len(entries))
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasSuffix(name, ".xml") {
			continue
		}
		id := strings.TrimSuffix(name, ".xml")
		if !validID(id) {
			continue
		}
		sum, err := s.stat(id)
		if err != nil {
			continue
		}
		out = append(out, sum)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].UpdatedAt > out[j].UpdatedAt })
	return out, nil
}

func (s *Store) Get(id string) (string, Summary, error) {
	if !validID(id) {
		return "", Summary{}, errBadID
	}
	data, err := os.ReadFile(s.path(id))
	if errors.Is(err, os.ErrNotExist) {
		return "", Summary{}, errNotFound
	}
	if err != nil {
		return "", Summary{}, err
	}
	info, err := os.Stat(s.path(id))
	if err != nil {
		return "", Summary{}, err
	}
	return string(data), summarize(id, data, info.ModTime()), nil
}

func (s *Store) Put(id, xml string) (Summary, error) {
	if !validID(id) {
		return Summary{}, errBadID
	}
	if len(xml) > maxXMLBytes {
		return Summary{}, errTooLarge
	}
	if !looksLikeMC(xml) {
		return Summary{}, errBadXML
	}
	tmp, err := os.CreateTemp(s.dir, id+".*.tmp")
	if err != nil {
		return Summary{}, err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	if _, err := tmp.WriteString(xml); err != nil {
		tmp.Close()
		return Summary{}, err
	}
	if err := tmp.Close(); err != nil {
		return Summary{}, err
	}
	if err := os.Rename(tmpName, s.path(id)); err != nil {
		return Summary{}, err
	}
	return s.stat(id)
}

func (s *Store) Delete(id string) error {
	if !validID(id) {
		return errBadID
	}
	err := os.Remove(s.path(id))
	if errors.Is(err, os.ErrNotExist) {
		return errNotFound
	}
	return err
}

func (s *Store) stat(id string) (Summary, error) {
	path := s.path(id)
	data, err := os.ReadFile(path)
	if err != nil {
		return Summary{}, err
	}
	info, err := os.Stat(path)
	if err != nil {
		return Summary{}, err
	}
	return summarize(id, data, info.ModTime()), nil
}

func summarize(id string, data []byte, mtime time.Time) Summary {
	name, description, count := xmlMeta(data)
	if name == "" {
		name = id
	}
	return Summary{
		ID:             id,
		Name:           name,
		Description:    description,
		UpdatedAt:      mtime.UnixMilli(),
		ComponentCount: count,
	}
}

func looksLikeMC(doc string) bool {
	return strings.Contains(doc, "<microprocessor")
}

// xmlMeta reads the root name attribute and counts component elements. It is
// deliberately not a full parse — the editor is the codec; we only need enough
// to fill the open-dialog list.
func xmlMeta(data []byte) (name, description string, components int) {
	var root struct {
		Name        string `xml:"name,attr"`
		Description string `xml:"description,attr"`
	}
	_ = xml.Unmarshal(data, &root)
	return html.UnescapeString(root.Name), html.UnescapeString(root.Description), strings.Count(string(data), `<c type="`)
}
