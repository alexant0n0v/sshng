//go:build windows

package main

import (
	"os/exec"
	"syscall"
)

// hideConsole prevents a console window from flashing when the GUI app runs
// a console program (e.g. `ssh -V`).
func hideConsole(cmd *exec.Cmd) {
	const createNoWindow = 0x08000000
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
}
