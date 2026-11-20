# sshng

A modern Windows 10/11 GUI for the built-in OpenSSH client (`ssh.exe`): saved server profiles in a sidebar, tabbed terminal sessions, and iTerm2-style terminal appearance settings.

## Features

- **Sidebar**: profiles grouped in nested folders. You can drag and drop them, use right-click menus, search, and sort by name, host, recently used or recently added.
- **Tabs**: one tab per SSH session (you can open several per profile). Tabs can be reordered by dragging and closed with a middle click. Press Enter after a session ends to reconnect.
- **Settings**: global SSH defaults (user, port, key, ProxyJump, keep-alive, host key checking, compression, agent forwarding, extra `-o` options and arguments). Any profile can override any of them, and the profile editor shows the exact command it will run.
- **Port forwarding**: `-L`, `-R` and `-D` (a local SOCKS4/5 proxy) per profile or globally.
- **Outbound SOCKS5 proxy**: reach SSH servers through an existing SOCKS5 proxy (`[user:pass@]host:port`), globally or per profile; type `none` in a profile to bypass the default. No extra tools are needed: ssh runs sshng itself as its `ProxyCommand`. Host names are resolved by the proxy. It can't be combined with a jump host. The proxy password is stored in the profiles file like other settings, but never appears in the command line.
- **Appearance**: color presets (iTerm2 Dark/Light Background, Solarized, Dracula, Nord, …), an editable ANSI color grid, font, cursor and minimum contrast, with a live preview. Each profile can have its own color scheme, for example red-tinted for production.
- **Import/export**: export profiles to JSON, import with merge or replace, and import hosts from `~/.ssh/config`.
- **Quick connect**: `user@host:port` from the welcome screen or the Ctrl+Shift+T launcher.

## Requirements (end users)

- Windows 10 1809+ or Windows 11 (uses ConPTY)
- The **OpenSSH Client** optional feature (`C:\Windows\System32\OpenSSH\ssh.exe`), which is installed by default on current Windows. Another `ssh.exe` can be chosen in Settings → General.
- The WebView2 runtime (preinstalled on Windows 11 and on up-to-date Windows 10)

## Development

Prerequisites: Go 1.26+, Node 20+, and the Wails CLI (`go install github.com/wailsapp/wails/v2/cmd/wails@latest`).

```sh
wails dev                                   # run with hot reload (works on macOS/Linux too, using the local ssh)
go test ./...                               # backend tests
cd frontend && npx tsc --noEmit             # frontend type-check
wails build -platform windows/amd64,windows/arm64 -trimpath -ldflags "-s -w"
                                            # -> build/bin/sshng-amd64.exe, sshng-arm64.exe
wails build -platform windows/amd64 -nsis   # also builds an installer (needs makensis)
```

Windows builds cross-compile from macOS or Linux (no cgo on Windows).

Set `SSHNG_DATA=/path/to/profiles.json` to use a separate data file, for testing or a portable setup. By default, data is stored in `%APPDATA%\sshng\profiles.json`.

## Keyboard shortcuts

| Action | Keys |
|---|---|
| New connection (launcher) | Ctrl+Shift+T |
| Close tab | Ctrl+Shift+W |
| Next / previous tab | Ctrl+Tab / Ctrl+Shift+Tab |
| Go to tab N | Ctrl+Shift+1…9 |
| Duplicate tab / Reconnect | Ctrl+Shift+D / Ctrl+Shift+R |
| Copy / Paste | Ctrl+Shift+C / Ctrl+Shift+V (and Ctrl+C with a selection, Ctrl+V; both configurable) |
| Find in scrollback | Ctrl+Shift+F |
| Clear scrollback | Ctrl+Shift+K |
| Font size | Ctrl+= / Ctrl+- / Ctrl+0 |
| New profile | Ctrl+Shift+N |
| Toggle sidebar | Ctrl+Shift+B |
| Settings | Ctrl+, |
