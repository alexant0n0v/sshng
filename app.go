package main

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App is bound to the frontend; every exported method becomes a JS function
// in frontend/wailsjs/go/main/App.
type App struct {
	ctx      context.Context
	store    *Store
	sessions *SessionManager
}

func NewApp(store *Store) *App {
	return &App{store: store, sessions: NewSessionManager()}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.sessions.bind(ctx)
}

func (a *App) beforeClose(ctx context.Context) bool {
	n := a.sessions.Count()
	if n == 0 || !a.store.Get().Settings.ConfirmCloseActive {
		return false
	}
	res, err := runtime.MessageDialog(ctx, runtime.MessageDialogOptions{
		Type:          runtime.QuestionDialog,
		Title:         "Quit sshng?",
		Message:       fmt.Sprintf("%d SSH session(s) are still running. Quit and disconnect them?", n),
		Buttons:       []string{"Quit", "Cancel"},
		DefaultButton: "Cancel",
		CancelButton:  "Cancel",
	})
	if err != nil {
		return false
	}
	return res != "Quit" && res != "Yes" && res != "Ok"
}

func (a *App) shutdown(ctx context.Context) {
	a.sessions.CloseAll()
}

// ---- data ----

func (a *App) GetData() AppData { return a.store.Get() }

func (a *App) SaveData(d AppData) error { return a.store.Set(d) }

type EnvInfo struct {
	OS              string `json:"os"`
	SSHPath         string `json:"sshPath"`         // what will be used
	DetectedSSHPath string `json:"detectedSshPath"` // auto-detected
	SSHVersion      string `json:"sshVersion"`
	DataPath        string `json:"dataPath"`
	SSHConfigPath   string `json:"sshConfigPath"`
}

func (a *App) GetEnvironment() EnvInfo {
	bin := resolveSSHPath(a.store.Get().Settings.SSHPath)
	home, _ := os.UserHomeDir()
	return EnvInfo{
		OS:              goruntime.GOOS,
		SSHPath:         bin,
		DetectedSSHPath: detectSSH(),
		SSHVersion:      sshVersion(bin),
		DataPath:        a.store.path,
		SSHConfigPath:   filepath.Join(home, ".ssh", "config"),
	}
}

// CheckSSH reports the version string of the given ssh binary ("" = auto).
func (a *App) CheckSSH(path string) (string, error) {
	bin := resolveSSHPath(path)
	if bin == "" {
		return "", errors.New("ssh.exe not found. Install the Windows \"OpenSSH Client\" optional feature or set the path manually")
	}
	v := sshVersion(bin)
	if v == "" {
		return "", fmt.Errorf("could not run %s", bin)
	}
	return v, nil
}

// CommandPreview shows the exact command a profile will run.
func (a *App) CommandPreview(p Profile) string {
	s := a.store.Get().Settings
	args, err := buildArgs(s.SSH, p)
	if err != nil {
		return "# " + err.Error()
	}
	bin := resolveSSHPath(s.SSHPath)
	if bin == "" {
		bin = "ssh"
	}
	return quoteForDisplay(bin, args)
}

// ---- sessions ----

type ConnectResult struct {
	SessionID  string `json:"sessionId"`
	Command    string `json:"command"`
	LastUsedAt int64  `json:"lastUsedAt"`
}

func (a *App) start(p Profile, cols, rows int) (ConnectResult, error) {
	s := a.store.Get().Settings
	bin := resolveSSHPath(s.SSHPath)
	if bin == "" {
		return ConnectResult{}, errors.New("ssh.exe not found. Install the Windows \"OpenSSH Client\" optional feature or set its path in Settings → General")
	}
	args, err := buildArgs(s.SSH, p)
	if err != nil {
		return ConnectResult{}, err
	}
	id, err := a.sessions.Start(bin, args, sessionEnv(s.SSH, p), cols, rows)
	if err != nil {
		return ConnectResult{}, err
	}
	return ConnectResult{SessionID: id, Command: quoteForDisplay(bin, args)}, nil
}

// Connect opens a new session for a saved profile.
func (a *App) Connect(profileID string, cols, rows int) (ConnectResult, error) {
	p, ok := a.store.Profile(profileID)
	if !ok {
		return ConnectResult{}, errors.New("profile not found")
	}
	res, err := a.start(p, cols, rows)
	if err != nil {
		return res, err
	}
	res.LastUsedAt = time.Now().UnixMilli()
	_, _ = a.store.Update(func(d *AppData) {
		for i := range d.Profiles {
			if d.Profiles[i].ID == profileID {
				d.Profiles[i].LastUsedAt = res.LastUsedAt
			}
		}
	})
	return res, nil
}

// QuickConnect opens a session for "user@host[:port]" without saving it.
func (a *App) QuickConnect(target string, cols, rows int) (ConnectResult, error) {
	p, err := parseQuickConnect(target)
	if err != nil {
		return ConnectResult{}, err
	}
	return a.start(p, cols, rows)
}

// ParseQuickConnect lets the UI turn a quick-connect target into a profile
// draft ("Save as profile").
func (a *App) ParseQuickConnect(target string) (Profile, error) {
	return parseQuickConnect(target)
}

func (a *App) Write(id, data string) error { return a.sessions.Write(id, []byte(data)) }

func (a *App) WriteBase64(id, b64 string) error {
	b, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return err
	}
	return a.sessions.Write(id, b)
}

func (a *App) Resize(id string, cols, rows int) error { return a.sessions.Resize(id, cols, rows) }

func (a *App) CloseSession(id string) { a.sessions.Close(id) }

// ---- files ----

var jsonFilter = []runtime.FileFilter{{DisplayName: "sshng profiles (*.json)", Pattern: "*.json"}}

// ExportProfiles writes all folders and profiles to a user-chosen file.
// Returns "" if the user cancelled.
func (a *App) ExportProfiles() (string, error) {
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Export profiles",
		DefaultFilename: "sshng-profiles-" + time.Now().Format("2006-01-02") + ".json",
		Filters:         jsonFilter,
	})
	if err != nil || path == "" {
		return "", err
	}
	if filepath.Ext(path) == "" {
		path += ".json"
	}
	d := a.store.Get()
	b, err := encodeExport(d.Folders, d.Profiles)
	if err != nil {
		return "", err
	}
	return path, os.WriteFile(path, b, 0o600)
}

type ImportResult struct {
	Path  string  `json:"path"`
	Count int     `json:"count"`
	Data  AppData `json:"data"`
}

// ImportProfiles reads an export file. With replace=true existing profiles
// and folders are discarded; otherwise they are merged by ID.
func (a *App) ImportProfiles(replace bool) (ImportResult, error) {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title:   "Import profiles",
		Filters: jsonFilter,
	})
	if err != nil || path == "" {
		return ImportResult{}, err
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return ImportResult{}, err
	}
	f, err := decodeExport(b)
	if err != nil {
		return ImportResult{}, err
	}
	var n int
	d, err := a.store.Update(func(d *AppData) {
		*d, n = mergeImport(*d, f, replace)
	})
	return ImportResult{Path: path, Count: n, Data: d}, err
}

// ImportSSHConfig adds Host entries from ~/.ssh/config that are not already
// saved, into a folder named "ssh_config".
func (a *App) ImportSSHConfig() (ImportResult, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return ImportResult{}, err
	}
	path := filepath.Join(home, ".ssh", "config")
	fh, err := os.Open(path)
	if err != nil {
		return ImportResult{}, fmt.Errorf("cannot read %s: %w", path, err)
	}
	defer fh.Close()
	found := parseSSHConfig(fh)

	added := 0
	d, err := a.store.Update(func(d *AppData) {
		existing := map[string]bool{}
		for _, p := range d.Profiles {
			existing[strings.ToLower(p.Host)] = true
		}
		folderID := ""
		for _, f := range d.Folders {
			if f.Name == "ssh_config" && f.ParentID == "" {
				folderID = f.ID
			}
		}
		now := time.Now().UnixMilli()
		for _, p := range found {
			if existing[strings.ToLower(p.Host)] {
				continue
			}
			if folderID == "" {
				folderID = newID()
				d.Folders = append(d.Folders, Folder{ID: folderID, Name: "ssh_config", CreatedAt: now})
			}
			p.ID = newID()
			p.FolderID = folderID
			p.CreatedAt = now
			d.Profiles = append(d.Profiles, p)
			existing[strings.ToLower(p.Host)] = true
			added++
		}
	})
	return ImportResult{Path: path, Count: added, Data: d}, err
}

// BrowseFile opens a file picker (e.g. for an identity file).
func (a *App) BrowseFile(title string) (string, error) {
	home, _ := os.UserHomeDir()
	dir := filepath.Join(home, ".ssh")
	if _, err := os.Stat(dir); err != nil {
		dir = home
	}
	return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title:            title,
		DefaultDirectory: dir,
		ShowHiddenFiles:  true,
	})
}
