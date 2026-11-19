package main

import (
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"strings"
)

// detectSSH finds the system OpenSSH client. On Windows this is the
// "OpenSSH Client" optional feature in System32\OpenSSH.
func detectSSH() string {
	if goruntime.GOOS == "windows" {
		root := os.Getenv("SystemRoot")
		if root == "" {
			root = `C:\Windows`
		}
		p := filepath.Join(root, "System32", "OpenSSH", "ssh.exe")
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	if p, err := exec.LookPath("ssh"); err == nil {
		return p
	}
	return ""
}

func resolveSSHPath(configured string) string {
	if c := strings.TrimSpace(configured); c != "" {
		return c
	}
	return detectSSH()
}

// sshVersion runs `ssh -V` (which prints to stderr).
func sshVersion(bin string) string {
	if bin == "" {
		return ""
	}
	cmd := exec.Command(bin, "-V")
	hideConsole(cmd)
	out, err := cmd.CombinedOutput()
	if err != nil && len(out) == 0 {
		return ""
	}
	return strings.TrimSpace(string(out))
}
