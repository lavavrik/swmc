package handler

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

const sampleXML = `<?xml version="1.0" encoding="UTF-8"?>
<microprocessor name="Test Rig" width="1" length="1">
	<nodes/>
	<group>
		<data><inputs/><outputs/></data>
		<components>
			<c type="15"><object id="1"><pos x="1" y="-1"/></object></c>
		</components>
		<components_bridge>
			<c type="2"><object id="2"><pos x="0" y="0"/></object></c>
		</components_bridge>
		<groups/>
	</group>
</microprocessor>
`

func TestPutGetListDelete(t *testing.T) {
	s, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}

	sum, err := s.Put("test-rig", sampleXML)
	if err != nil {
		t.Fatal(err)
	}
	if sum.Name != "Test Rig" {
		t.Fatalf("name: %q", sum.Name)
	}
	if sum.ComponentCount != 2 {
		t.Fatalf("components: %d", sum.ComponentCount)
	}

	xml, got, err := s.Get("test-rig")
	if err != nil {
		t.Fatal(err)
	}
	if xml != sampleXML {
		t.Fatalf("xml round-trip mismatch")
	}
	if got.Name != "Test Rig" {
		t.Fatalf("get name: %q", got.Name)
	}

	all, err := s.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 1 || all[0].ID != "test-rig" {
		t.Fatalf("list: %+v", all)
	}

	if err := s.Delete("test-rig"); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.Get("test-rig"); !errors.Is(err, errNotFound) {
		t.Fatalf("want not found, got %v", err)
	}
}

func TestPutReplaces(t *testing.T) {
	s, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Put("rig", sampleXML); err != nil {
		t.Fatal(err)
	}
	updated := `<microprocessor name="Other"><c type="1"/><c type="2"/><c type="3"/></microprocessor>`
	sum, err := s.Put("rig", updated)
	if err != nil {
		t.Fatal(err)
	}
	if sum.Name != "Other" || sum.ComponentCount != 3 {
		t.Fatalf("replaced: %+v", sum)
	}
	all, _ := s.List()
	if len(all) != 1 {
		t.Fatalf("still one file, got %d", len(all))
	}
}

func TestListNewestFirst(t *testing.T) {
	dir := t.TempDir()
	s, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	older := `<microprocessor name="Older"><c type="1"/></microprocessor>`
	newer := `<microprocessor name="Newer"><c type="1"/></microprocessor>`
	if _, err := s.Put("older", older); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Put("newer", newer); err != nil {
		t.Fatal(err)
	}
	past := time.Now().Add(-time.Hour)
	if err := os.Chtimes(filepath.Join(dir, "older.xml"), past, past); err != nil {
		t.Fatal(err)
	}
	all, err := s.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 2 || all[0].Name != "Newer" || all[1].Name != "Older" {
		t.Fatalf("order: %+v", all)
	}
}

func TestRejectsBadInput(t *testing.T) {
	s, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		id, xml string
		want    error
	}{
		{"../escape", sampleXML, errBadID},
		{"Has Caps", sampleXML, errBadID},
		{"ok", "<html/>", errBadXML},
		{"ok", "", errBadXML},
	}
	for _, tc := range cases {
		if _, err := s.Put(tc.id, tc.xml); !errors.Is(err, tc.want) {
			t.Errorf("Put(%q): got %v want %v", tc.id, err, tc.want)
		}
	}
	if _, _, err := s.Get("../escape"); !errors.Is(err, errBadID) {
		t.Errorf("Get traversal: %v", err)
	}
}

func TestIgnoresStrayFiles(t *testing.T) {
	dir := t.TempDir()
	s, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, ".keep"), nil, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "skip_me.xml"), []byte(sampleXML), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Put("ok", sampleXML); err != nil {
		t.Fatal(err)
	}
	all, err := s.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 1 || all[0].ID != "ok" {
		t.Fatalf("list: %+v", all)
	}
}

func TestNameEntities(t *testing.T) {
	s, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	sum, err := s.Put("amp", `<microprocessor name="A &amp; B"/>`)
	if err != nil {
		t.Fatal(err)
	}
	if sum.Name != "A & B" {
		t.Fatalf("unescaped name: %q", sum.Name)
	}
}
