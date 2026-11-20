//go:build !windows

package main

import (
	"encoding/base64"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestSessionOutputAndExit(t *testing.T) {
	m := NewSessionManager()
	var (
		mu   sync.Mutex
		out  strings.Builder
		code = -1
		done = make(chan struct{})
	)
	m.emit = func(name string, data ...interface{}) {
		mu.Lock()
		defer mu.Unlock()
		switch name {
		case evData:
			b, _ := base64.StdEncoding.DecodeString(data[1].(string))
			out.Write(b)
		case evExit:
			code = data[1].(int)
			close(done)
		}
	}
	id, err := m.Start("/bin/sh", []string{"-c", "read x; echo got-$x; exit 3"}, nil, 80, 24)
	if err != nil {
		t.Fatal(err)
	}
	if err := m.Write(id, []byte("ping\n")); err != nil {
		t.Fatal(err)
	}
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("session did not exit")
	}
	mu.Lock()
	defer mu.Unlock()
	if code != 3 || !strings.Contains(out.String(), "got-ping") {
		t.Fatalf("code=%d out=%q", code, out.String())
	}
	if m.Count() != 0 {
		t.Fatal("session not removed")
	}
}
