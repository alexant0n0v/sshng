# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

sshng is a Windows 10/11 desktop GUI wrapping the system OpenSSH client (`ssh.exe`). It is built with **Wails v2**: a Go backend (package `main`, repo root) and a React + TypeScript frontend (`frontend/`), rendered in WebView2. Terminals are xterm.js, connected to `ssh.exe` running inside a ConPTY through `github.com/aymanbagabas/go-pty`. The same code runs on macOS/Linux with a Unix PTY, which is how development and UI testing happen off-Windows.

## Commands

```sh
wails dev                                   # app with hot reload; also serves http://localhost:34115 for a browser
go test ./...                               # all backend tests
go test -run TestBuildArgs ./...            # a single test
go test -race ./...                         # session_test.go exercises a real PTY (Unix only)
GOOS=windows go vet ./...                   # check Windows-only files compile
cd frontend && npx tsc --noEmit             # frontend type-check (there is no frontend test suite or linter)
wails generate module                       # regenerate frontend/wailsjs after changing exported App methods
wails build -platform windows/amd64,windows/arm64 -trimpath -ldflags "-s -w"   # cross-compiles from macOS
```

`SSHNG_DATA=/path/profiles.json` points the app at a throwaway data file. Use it when running the app for testing so the real `%APPDATA%\sshng\profiles.json` (or `~/Library/Application Support/sshng/` on macOS) isn't touched.

## Architecture

**Backend (Go, repo root)**
- `app.go`: `App` is the only struct bound to the frontend; every exported method becomes `frontend/wailsjs/go/main/App.*`. It handles window lifecycle (a quit confirmation when sessions are running), connect/quick-connect, PTY I/O, native file dialogs and import/export.
- `store.go`: the persisted model (`AppData` → `Settings`, `Folder[]`, `Profile[]`), with an atomic JSON write and the import/export format (`format: "sshng-profiles"`, merged by ID). `Settings.Terminal` and `Settings.UI` are `json.RawMessage`: the backend stores them without reading them, and the frontend defines their schema (`frontend/src/types.ts`, defaults in `defaults.ts`).
- `sshargs.go`: the key logic. `SSHOptions` is used both for the global defaults and for per-profile overrides. Empty, zero or nil means *inherit*; list fields (forwards, `-o` options, extra args) are *additive*. `buildArgs` produces the `ssh.exe` argv. The command preview in the UI comes from this same function, so it always matches what runs. Hosts starting with `-` are rejected to block option injection.
- `session.go`: `SessionManager` runs one goroutine per PTY to read output, emitting the `pty:data` event (sessionID, base64 bytes), and another to wait for exit, emitting `pty:exit` (sessionID, code, msg). ConPTY never sends EOF until the pseudo console is closed, so the wait goroutine drains output for up to 250 ms and then closes the PTY.
- `sshconfig.go` parses `~/.ssh/config` for import. `sshpath.go` and `hide_*.go` locate `ssh.exe` and stop console windows flashing when it is run.

**Frontend (`frontend/src`)**
- `store.ts`: a single zustand store holding data, tabs, modals, the context menu and toasts, plus every mutating action. Data changes are saved to Go with a 250 ms debounce (`SaveData` replaces the whole `AppData`). **Call `flushSave()` before any backend call that reads stored data** (Connect, import/export); `terminals.connect` already does.
- `terminals.ts`: `TerminalManager` keeps xterm instances outside React, one per tab id. React's `TerminalView` only supplies a container (`terminals.mount`). It maps backend session ids to tabs and buffers `pty:data`/`pty:exit` events that arrive before the `Connect` promise resolves. It also handles reconnect on Enter after exit, clipboard, search, WebGL and theme application.
- `App.tsx`: all keyboard shortcuts go through one window-level **capture-phase** keydown handler, so they run before xterm sees the key. Use Ctrl+Shift combinations; plain Ctrl and Alt keys belong to the remote shell (and AltGr = Ctrl+Alt on many layouts).
- `api.ts` wraps the generated bindings with hand-written types from `types.ts`. Use those types, not the generated `wailsjs/go/models.ts` classes. Keep `types.ts` in sync with the Go JSON tags.
- `themes.ts` holds the color presets. A profile's `theme` overrides the global theme for its tabs.

## Notes

- `frontend/wailsjs/` is generated. Don't edit it by hand.
- Visual QA without Windows: run `SSHNG_DATA=... wails dev`, then drive `http://localhost:34115` with headless Chrome (puppeteer-core). In browser mode, Wails' `ipc.js` throws a harmless `reading 'nodes'` page error.
