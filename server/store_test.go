package handler

import (
	"context"
	"os"
	"testing"
)

func testStore(t *testing.T) *Store {
	t.Helper()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		url = "postgres://swmc:swmc@127.0.0.1:5432/swmc?sslmode=disable"
	}
	ctx := context.Background()
	s, err := Open(ctx, url)
	if err != nil {
		t.Skipf("postgres not available: %v", err)
	}
	t.Cleanup(func() {
		_, _ = s.pool.Exec(ctx, `TRUNCATE users CASCADE`)
		s.Close()
	})
	return s
}

func testUser(t *testing.T, s *Store, email string) User {
	t.Helper()
	u, _, err := s.CreateUser(context.Background(), email, "password1")
	if err != nil {
		t.Fatal(err)
	}
	return u
}

const sampleXML = `<?xml version="1.0" encoding="UTF-8"?>
<microprocessor name="Test Rig" description="A test microcontroller" width="1" length="1">
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

func TestUpsertOIDCUser(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	first, err := s.UpsertOIDCUser(ctx, "sub-1", "Orb@Example.com")
	if err != nil {
		t.Fatal(err)
	}
	again, err := s.UpsertOIDCUser(ctx, "sub-1", "orb@example.com")
	if err != nil {
		t.Fatal(err)
	}
	if first.ID != again.ID {
		t.Fatalf("id changed: %s vs %s", first.ID, again.ID)
	}
	if again.Email != "orb@example.com" {
		t.Fatalf("email: %s", again.Email)
	}

	other, err := s.UpsertOIDCUser(ctx, "sub-2", "other@example.com")
	if err != nil {
		t.Fatal(err)
	}
	if other.ID == first.ID {
		t.Fatal("distinct OIDC users must not share a library account")
	}

	existing := testUser(t, s, "legacy@example.com")
	linked, err := s.UpsertOIDCUser(ctx, "sub-legacy", "legacy@example.com")
	if err != nil {
		t.Fatal(err)
	}
	if linked.ID != existing.ID {
		t.Fatalf("email match should attach oidc_sub, got %s want %s", linked.ID, existing.ID)
	}

	anon, err := s.UpsertOIDCUser(ctx, "sub-no-mail", "")
	if err != nil {
		t.Fatal(err)
	}
	if anon.Email != "sub-no-mail@oidc.invalid" {
		t.Fatalf("synthetic email: %s", anon.Email)
	}
}

func TestPutGetListDelete(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := testUser(t, s, "a@example.com")

	sum, err := s.Put(ctx, u.ID, "test-rig", sampleXML)
	if err != nil {
		t.Fatal(err)
	}
	if sum.Name != "Test Rig" {
		t.Fatalf("name: %q", sum.Name)
	}
	if sum.Description != "A test microcontroller" {
		t.Fatalf("description: %q", sum.Description)
	}
	if sum.ComponentCount != 2 {
		t.Fatalf("components: %d", sum.ComponentCount)
	}

	xml, got, err := s.Get(ctx, u.ID, "test-rig")
	if err != nil {
		t.Fatal(err)
	}
	if xml != sampleXML {
		t.Fatal("xml mismatch")
	}
	if got.Name != "Test Rig" {
		t.Fatalf("get name: %q", got.Name)
	}

	list, err := s.List(ctx, u.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].ID != "test-rig" {
		t.Fatalf("list: %+v", list)
	}

	other := testUser(t, s, "b@example.com")
	theirs, err := s.List(ctx, other.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(theirs) != 0 {
		t.Fatalf("other user saw %d projects", len(theirs))
	}

	if err := s.Delete(ctx, u.ID, "test-rig"); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.Get(ctx, u.ID, "test-rig"); err != errNotFound {
		t.Fatalf("want not found, got %v", err)
	}
}

func TestPutRejectsBadIDAndXML(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := testUser(t, s, "c@example.com")
	if _, err := s.Put(ctx, u.ID, "Nope", sampleXML); err != errBadID {
		t.Fatalf("bad id: %v", err)
	}
	if _, err := s.Put(ctx, u.ID, "ok", "<nope/>"); err != errBadXML {
		t.Fatalf("bad xml: %v", err)
	}
}

func TestRegisterLoginSession(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u, token, err := s.CreateUser(ctx, "D@Example.COM", "password1")
	if err != nil {
		t.Fatal(err)
	}
	if u.Email != "d@example.com" {
		t.Fatalf("email: %q", u.Email)
	}
	got, err := s.UserForSession(ctx, token)
	if err != nil || got.ID != u.ID {
		t.Fatalf("session: %+v %v", got, err)
	}
	if _, _, err := s.CreateUser(ctx, "d@example.com", "password1"); err != errEmailTaken {
		t.Fatalf("dup: %v", err)
	}
	if _, _, err := s.Authenticate(ctx, "d@example.com", "wrongwrong"); err != errBadLogin {
		t.Fatalf("bad login: %v", err)
	}
	u2, token2, err := s.Authenticate(ctx, "d@example.com", "password1")
	if err != nil || u2.ID != u.ID || token2 == "" {
		t.Fatalf("login: %+v %v", u2, err)
	}
	if err := s.DeleteSession(ctx, token); err != nil {
		t.Fatal(err)
	}
	if _, err := s.UserForSession(ctx, token); err != errNoSession {
		t.Fatalf("deleted session: %v", err)
	}
}
