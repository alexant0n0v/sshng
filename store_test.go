package main

import (
	"path/filepath"
	"testing"
)

func TestStoreRoundTrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sub", "profiles.json")
	s, err := NewStore(path)
	if err != nil {
		t.Fatal(err)
	}
	if s.Get().Settings.SSH.Port != 22 {
		t.Fatal("expected default port 22")
	}
	d := s.Get()
	d.Profiles = append(d.Profiles, Profile{ID: "p1", Name: "one", Host: "h"})
	if err := s.Set(d); err != nil {
		t.Fatal(err)
	}
	s2, err := NewStore(path)
	if err != nil {
		t.Fatal(err)
	}
	if p, ok := s2.Profile("p1"); !ok || p.Host != "h" {
		t.Fatalf("profile not persisted: %+v", s2.Get())
	}
}

func TestExportImportMerge(t *testing.T) {
	b, err := encodeExport(
		[]Folder{{ID: "f1", Name: "Prod"}, {ID: "f2", Name: "Orphan", ParentID: "missing"}},
		[]Profile{{ID: "p1", Name: "web", Host: "web", FolderID: "f1"}, {ID: "p2", Name: "x", Host: "x", FolderID: "nope"}},
	)
	if err != nil {
		t.Fatal(err)
	}
	f, err := decodeExport(b)
	if err != nil {
		t.Fatal(err)
	}
	d := defaultData()
	d.Profiles = []Profile{{ID: "p1", Name: "old", Host: "old"}, {ID: "keep", Host: "k"}}
	d, n := mergeImport(d, f, false)
	if n != 2 || len(d.Profiles) != 3 {
		t.Fatalf("merge: n=%d profiles=%+v", n, d.Profiles)
	}
	if d.Profiles[0].Name != "web" {
		t.Fatal("same-ID profile should be replaced")
	}
	if d.Profiles[2].FolderID != "" || d.Folders[1].ParentID != "" {
		t.Fatal("dangling folder references should be cleared")
	}

	d, _ = mergeImport(d, f, true)
	if len(d.Profiles) != 2 {
		t.Fatalf("replace should drop existing profiles, got %d", len(d.Profiles))
	}
}

func TestDecodeExportRejectsForeignFiles(t *testing.T) {
	if _, err := decodeExport([]byte(`{"profiles":[]}`)); err == nil {
		t.Fatal("expected format error")
	}
}

func TestBreakFolderCycles(t *testing.T) {
	fs := []Folder{{ID: "a", ParentID: "b"}, {ID: "b", ParentID: "a"}, {ID: "c", ParentID: "a"}}
	breakFolderCycles(fs)
	if fs[0].ParentID != "" || fs[1].ParentID != "a" || fs[2].ParentID != "a" {
		t.Fatalf("got %+v", fs)
	}
}
