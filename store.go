package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const dataVersion = 1

// SSHOptions is used both for the global defaults (Settings.SSH) and for
// per-profile overrides (Profile.SSH). In a profile, an empty string, zero
// port or nil pointer means "inherit the global default". In the defaults,
// it means "don't pass anything; let ssh.exe / ssh_config decide".
// List fields (forwards, Options) are additive: defaults + profile.
type SSHOptions struct {
	User                  string   `json:"user,omitempty"`
	Port                  int      `json:"port,omitempty"`
	IdentityFile          string   `json:"identityFile,omitempty"`
	ProxyJump             string   `json:"proxyJump,omitempty"`
	SocksProxy            string   `json:"socksProxy,omitempty"` // [socks5://][user:pass@]host[:port]; "none" disables the default
	ServerAliveInterval   *int     `json:"serverAliveInterval,omitempty"`
	ServerAliveCountMax   *int     `json:"serverAliveCountMax,omitempty"`
	ConnectTimeout        *int     `json:"connectTimeout,omitempty"`
	StrictHostKeyChecking string   `json:"strictHostKeyChecking,omitempty"`
	Compression           *bool    `json:"compression,omitempty"`
	ForwardAgent          *bool    `json:"forwardAgent,omitempty"`
	IdentitiesOnly        *bool    `json:"identitiesOnly,omitempty"`
	LocalForwards         []string `json:"localForwards,omitempty"`
	RemoteForwards        []string `json:"remoteForwards,omitempty"`
	DynamicForwards       []string `json:"dynamicForwards,omitempty"`
	Options               []string `json:"options,omitempty"`   // "Key=Value", passed as -o
	ExtraArgs             string   `json:"extraArgs,omitempty"` // raw, shell-split
}

type Profile struct {
	ID            string     `json:"id"`
	Name          string     `json:"name"`
	FolderID      string     `json:"folderId,omitempty"`
	Host          string     `json:"host"`
	Color         string     `json:"color,omitempty"`
	Notes         string     `json:"notes,omitempty"`
	Theme         string     `json:"theme,omitempty"` // terminal theme override; "" = inherit
	RemoteCommand string     `json:"remoteCommand,omitempty"`
	SSH           SSHOptions `json:"ssh"`
	CreatedAt     int64      `json:"createdAt"`
	LastUsedAt    int64      `json:"lastUsedAt,omitempty"`
}

type Folder struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	ParentID  string `json:"parentId,omitempty"`
	CreatedAt int64  `json:"createdAt"`
}

type Settings struct {
	SSHPath            string     `json:"sshPath,omitempty"` // "" = auto-detect
	ConfirmCloseActive bool       `json:"confirmCloseActive"`
	CloseOnCleanExit   bool       `json:"closeOnCleanExit"`
	SSH                SSHOptions `json:"ssh"`
	// Terminal and UI settings are owned by the frontend; the backend only
	// persists them.
	Terminal json.RawMessage `json:"terminal,omitempty" ts_type:"any"`
	UI       json.RawMessage `json:"ui,omitempty" ts_type:"any"`
}

type AppData struct {
	Version  int       `json:"version"`
	Settings Settings  `json:"settings"`
	Folders  []Folder  `json:"folders"`
	Profiles []Profile `json:"profiles"`
}

// ExportFile is the on-disk format for profile import/export.
type ExportFile struct {
	Format     string    `json:"format"`
	Version    int       `json:"version"`
	ExportedAt string    `json:"exportedAt"`
	Folders    []Folder  `json:"folders"`
	Profiles   []Profile `json:"profiles"`
}

const exportFormat = "sshng-profiles"

func defaultData() AppData {
	return AppData{
		Version: dataVersion,
		Settings: Settings{
			ConfirmCloseActive: true,
			SSH:                SSHOptions{Port: 22},
		},
		Folders:  []Folder{},
		Profiles: []Profile{},
	}
}

type Store struct {
	mu   sync.Mutex
	path string
	data AppData
}

func defaultStorePath() (string, error) {
	if p := os.Getenv("SSHNG_DATA"); p != "" { // for testing / portable installs
		return p, nil
	}
	dir, err := os.UserConfigDir() // %APPDATA% on Windows
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "sshng", "profiles.json"), nil
}

func NewStore(path string) (*Store, error) {
	s := &Store{path: path, data: defaultData()}
	b, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return s, nil
	}
	if err != nil {
		return nil, err
	}
	var d AppData
	if err := json.Unmarshal(b, &d); err != nil {
		// Keep the broken file around rather than silently overwriting it.
		_ = os.Rename(path, path+".corrupt-"+time.Now().Format("20060102-150405"))
		return s, nil
	}
	s.data = normalize(d)
	return s, nil
}

func normalize(d AppData) AppData {
	if d.Folders == nil {
		d.Folders = []Folder{}
	}
	if d.Profiles == nil {
		d.Profiles = []Profile{}
	}
	d.Version = dataVersion
	breakFolderCycles(d.Folders)
	return d
}

// breakFolderCycles detaches any folder whose parent chain loops back on
// itself, so the sidebar tree is always finite.
func breakFolderCycles(folders []Folder) {
	parent := map[string]string{}
	for _, f := range folders {
		parent[f.ID] = f.ParentID
	}
	for i := range folders {
		seen := map[string]bool{folders[i].ID: true}
		for cur := folders[i].ParentID; cur != ""; cur = parent[cur] {
			if seen[cur] {
				folders[i].ParentID = ""
				parent[folders[i].ID] = ""
				break
			}
			seen[cur] = true
		}
	}
}

func (s *Store) Get() AppData {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.data
}

func (s *Store) Set(d AppData) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data = normalize(d)
	return s.saveLocked()
}

func (s *Store) Update(fn func(d *AppData)) (AppData, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	fn(&s.data)
	s.data = normalize(s.data)
	return s.data, s.saveLocked()
}

func (s *Store) saveLocked() error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o700); err != nil {
		return err
	}
	b, err := json.MarshalIndent(s.data, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

func (s *Store) Profile(id string) (Profile, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, p := range s.data.Profiles {
		if p.ID == id {
			return p, true
		}
	}
	return Profile{}, false
}

func newID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func encodeExport(folders []Folder, profiles []Profile) ([]byte, error) {
	return json.MarshalIndent(ExportFile{
		Format:     exportFormat,
		Version:    dataVersion,
		ExportedAt: time.Now().UTC().Format(time.RFC3339),
		Folders:    folders,
		Profiles:   profiles,
	}, "", "  ")
}

func decodeExport(b []byte) (ExportFile, error) {
	var f ExportFile
	if err := json.Unmarshal(b, &f); err != nil {
		return f, fmt.Errorf("not a valid JSON file: %w", err)
	}
	if f.Format != exportFormat {
		return f, fmt.Errorf("unrecognized file format %q (expected %q)", f.Format, exportFormat)
	}
	for i := range f.Profiles {
		if f.Profiles[i].ID == "" {
			f.Profiles[i].ID = newID()
		}
		if f.Profiles[i].Host == "" {
			return f, fmt.Errorf("profile %q has no host", f.Profiles[i].Name)
		}
	}
	for i := range f.Folders {
		if f.Folders[i].ID == "" {
			f.Folders[i].ID = newID()
		}
	}
	return f, nil
}

// mergeImport adds imported folders/profiles to d. Items whose ID already
// exists are replaced (re-importing the same export is idempotent). With
// replace=true, existing folders and profiles are discarded first.
// References to folders that don't exist are cleared.
func mergeImport(d AppData, f ExportFile, replace bool) (AppData, int) {
	if replace {
		d.Folders = []Folder{}
		d.Profiles = []Profile{}
	}
	fIdx := map[string]int{}
	for i, x := range d.Folders {
		fIdx[x.ID] = i
	}
	for _, x := range f.Folders {
		if i, ok := fIdx[x.ID]; ok {
			d.Folders[i] = x
		} else {
			fIdx[x.ID] = len(d.Folders)
			d.Folders = append(d.Folders, x)
		}
	}
	pIdx := map[string]int{}
	for i, x := range d.Profiles {
		pIdx[x.ID] = i
	}
	for _, x := range f.Profiles {
		if i, ok := pIdx[x.ID]; ok {
			d.Profiles[i] = x
		} else {
			pIdx[x.ID] = len(d.Profiles)
			d.Profiles = append(d.Profiles, x)
		}
	}
	for i := range d.Folders {
		if _, ok := fIdx[d.Folders[i].ParentID]; !ok || d.Folders[i].ParentID == d.Folders[i].ID {
			d.Folders[i].ParentID = ""
		}
	}
	for i := range d.Profiles {
		if _, ok := fIdx[d.Profiles[i].FolderID]; !ok {
			d.Profiles[i].FolderID = ""
		}
	}
	return d, len(f.Profiles)
}
