package main

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"sync"
	"time"

	gopty "github.com/aymanbagabas/go-pty"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// Events emitted to the frontend:
//
//	pty:data  (sessionID string, base64 bytes string)
//	pty:exit  (sessionID string, exitCode int, errorMessage string)
const (
	evData = "pty:data"
	evExit = "pty:exit"
)

type session struct {
	id   string
	pty  gopty.Pty
	cmd  *gopty.Cmd
	once sync.Once
}

func (s *session) close() {
	s.once.Do(func() {
		if s.cmd != nil && s.cmd.Process != nil {
			_ = s.cmd.Process.Kill()
		}
		_ = s.pty.Close()
	})
}

type SessionManager struct {
	mu       sync.Mutex
	sessions map[string]*session
	emit     func(name string, data ...interface{})
}

func NewSessionManager() *SessionManager {
	return &SessionManager{sessions: map[string]*session{}}
}

func (m *SessionManager) bind(ctx context.Context) {
	m.emit = func(name string, data ...interface{}) { runtime.EventsEmit(ctx, name, data...) }
}

func (m *SessionManager) Count() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.sessions)
}

func (m *SessionManager) Start(bin string, args, env []string, cols, rows int) (string, error) {
	if cols <= 0 || rows <= 0 {
		cols, rows = 80, 24
	}
	p, err := gopty.New()
	if err != nil {
		return "", fmt.Errorf("cannot create pseudo console: %w", err)
	}
	if err := p.Resize(cols, rows); err != nil {
		_ = p.Close()
		return "", err
	}
	cmd := p.Command(bin, args...)
	cmd.Env = append(append(os.Environ(), "TERM=xterm-256color"), env...)
	if err := cmd.Start(); err != nil {
		_ = p.Close()
		return "", fmt.Errorf("cannot start %s: %w", bin, err)
	}

	s := &session{id: newID(), pty: p, cmd: cmd}
	m.mu.Lock()
	m.sessions[s.id] = s
	m.mu.Unlock()

	readerDone := make(chan struct{})
	go func() {
		defer close(readerDone)
		buf := make([]byte, 32*1024)
		for {
			n, err := p.Read(buf)
			if n > 0 && m.emit != nil {
				m.emit(evData, s.id, base64.StdEncoding.EncodeToString(buf[:n]))
			}
			if err != nil {
				return
			}
		}
	}()

	go func() {
		waitErr := cmd.Wait()
		code := 0
		if cmd.ProcessState != nil {
			code = cmd.ProcessState.ExitCode()
		}
		msg := ""
		var exitErr interface{ ExitCode() int }
		if waitErr != nil && !errors.As(waitErr, &exitErr) {
			msg = waitErr.Error()
		}
		// Let the reader drain trailing output. ConPTY never reports EOF
		// until the pseudo console is closed, so cap the wait.
		select {
		case <-readerDone:
		case <-time.After(250 * time.Millisecond):
		}
		s.close()
		<-readerDone
		m.mu.Lock()
		delete(m.sessions, s.id)
		m.mu.Unlock()
		if m.emit != nil {
			m.emit(evExit, s.id, code, msg)
		}
	}()
	return s.id, nil
}

func (m *SessionManager) get(id string) (*session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.sessions[id]
	if !ok {
		return nil, errors.New("session not found")
	}
	return s, nil
}

func (m *SessionManager) Write(id string, data []byte) error {
	s, err := m.get(id)
	if err != nil {
		return err
	}
	_, err = s.pty.Write(data)
	return err
}

func (m *SessionManager) Resize(id string, cols, rows int) error {
	if cols <= 0 || rows <= 0 {
		return nil
	}
	s, err := m.get(id)
	if err != nil {
		return err
	}
	return s.pty.Resize(cols, rows)
}

// Close kills the ssh process; the wait goroutine then emits pty:exit.
func (m *SessionManager) Close(id string) {
	if s, err := m.get(id); err == nil {
		s.close()
	}
}

func (m *SessionManager) CloseAll() {
	m.mu.Lock()
	all := make([]*session, 0, len(m.sessions))
	for _, s := range m.sessions {
		all = append(all, s)
	}
	m.mu.Unlock()
	for _, s := range all {
		s.close()
	}
}
