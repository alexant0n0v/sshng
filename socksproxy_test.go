package main

import (
	"bytes"
	"encoding/binary"
	"io"
	"net"
	"strconv"
	"strings"
	"testing"

	"golang.org/x/net/proxy"
)

func TestParseSocksProxy(t *testing.T) {
	cases := []struct {
		in               string
		addr, user, pass string
		nilResult        bool
		wantErr          bool
	}{
		{in: "", nilResult: true},
		{in: "none", nilResult: true},
		{in: " NONE ", nilResult: true},
		{in: "proxy.lan", addr: "proxy.lan:1080"},
		{in: "proxy.lan:9050", addr: "proxy.lan:9050"},
		{in: "socks5://10.0.0.1:1081", addr: "10.0.0.1:1081"},
		{in: "socks5h://alice:s3cr:et@proxy:1080", addr: "proxy:1080", user: "alice", pass: "s3cr:et"},
		{in: "socks5://bob@proxy", addr: "proxy:1080", user: "bob"},
		{in: "[::1]:1080", addr: "[::1]:1080"},
		{in: "http://proxy:3128", wantErr: true},
		{in: "socks4://proxy:1080", wantErr: true},
		{in: "proxy:0", wantErr: true},
		{in: "proxy:99999", wantErr: true},
		{in: "-oProxy:1080", wantErr: true},
		{in: "proxy host:1080", wantErr: true},
		{in: "proxy:1080/x", wantErr: true},
		{in: "socks5://:1080", wantErr: true},
	}
	for _, c := range cases {
		got, err := parseSocksProxy(c.in)
		if c.wantErr {
			if err == nil {
				t.Errorf("%q: expected error, got %+v", c.in, got)
			}
			continue
		}
		if err != nil {
			t.Errorf("%q: unexpected error %v", c.in, err)
			continue
		}
		if c.nilResult {
			if got != nil {
				t.Errorf("%q: expected nil, got %+v", c.in, got)
			}
			continue
		}
		if got.Addr != c.addr || got.User != c.user || got.Pass != c.pass {
			t.Errorf("%q: got %+v, want addr=%s user=%s pass=%s", c.in, got, c.addr, c.user, c.pass)
		}
	}
}

func TestBuildArgsSocksProxy(t *testing.T) {
	old := selfExecutable
	selfExecutable = func() string { return `C:\Program Files\sshng\sshng.exe` }
	defer func() { selfExecutable = old }()

	p := Profile{Host: "srv", SSH: SSHOptions{SocksProxy: "socks5://u:pw@proxy:1080"}}
	args, err := buildArgs(SSHOptions{}, p)
	if err != nil {
		t.Fatal(err)
	}
	want := `ProxyCommand="C:\Program Files\sshng\sshng.exe" --socks-connect proxy:1080 %h %p`
	if got := strings.Join(args, "|"); !strings.Contains(got, "-o|"+want+"|") {
		t.Fatalf("args %q lack %q", args, want)
	}
	if strings.Contains(strings.Join(args, " "), "pw") {
		t.Fatalf("password leaked into args: %q", args)
	}
	env := sessionEnv(SSHOptions{}, p)
	if strings.Join(env, ";") != envSocksUser+"=u;"+envSocksPass+"=pw" {
		t.Fatalf("env = %q", env)
	}

	// Global default applies; "none" on the profile switches it off.
	def := SSHOptions{SocksProxy: "proxy:1080"}
	args, _ = buildArgs(def, Profile{Host: "srv"})
	if !strings.Contains(strings.Join(args, " "), "ProxyCommand=") {
		t.Fatalf("default proxy not applied: %q", args)
	}
	off := Profile{Host: "srv", SSH: SSHOptions{SocksProxy: "none"}}
	args, _ = buildArgs(def, off)
	if strings.Contains(strings.Join(args, " "), "ProxyCommand=") || sessionEnv(def, off) != nil {
		t.Fatalf("none did not disable proxy: %q", args)
	}

	// Jump host and SOCKS proxy together are rejected.
	if _, err := buildArgs(def, Profile{Host: "srv", SSH: SSHOptions{ProxyJump: "bastion"}}); err == nil {
		t.Fatal("expected error for ProxyJump + SOCKS proxy")
	}
	if _, err := buildArgs(SSHOptions{SocksProxy: "ftp://x"}, Profile{Host: "srv"}); err == nil {
		t.Fatal("expected error for bad proxy")
	}
}

// fakeSocks5 is a minimal SOCKS5 server (RFC 1928/1929) for tests. It
// records the requested target and connects it to an echo handler.
type fakeSocks5 struct {
	ln         net.Listener
	user, pass string
	target     chan string
}

func newFakeSocks5(t *testing.T, user, pass string) *fakeSocks5 {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	s := &fakeSocks5{ln: ln, user: user, pass: pass, target: make(chan string, 1)}
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go s.serve(c)
		}
	}()
	t.Cleanup(func() { ln.Close() })
	return s
}

func (s *fakeSocks5) serve(c net.Conn) {
	defer c.Close()
	buf := make([]byte, 512)
	if _, err := io.ReadFull(c, buf[:2]); err != nil {
		return
	}
	if _, err := io.ReadFull(c, buf[:buf[1]]); err != nil {
		return
	}
	if s.user != "" {
		c.Write([]byte{5, 2})
		io.ReadFull(c, buf[:2])
		u := make([]byte, buf[1])
		io.ReadFull(c, u)
		io.ReadFull(c, buf[:1])
		p := make([]byte, buf[0])
		io.ReadFull(c, p)
		if string(u) != s.user || string(p) != s.pass {
			c.Write([]byte{1, 1})
			return
		}
		c.Write([]byte{1, 0})
	} else {
		c.Write([]byte{5, 0})
	}
	io.ReadFull(c, buf[:4]) // ver cmd rsv atyp
	var host string
	switch buf[3] {
	case 1:
		io.ReadFull(c, buf[:4])
		host = net.IP(buf[:4]).String()
	case 3:
		io.ReadFull(c, buf[:1])
		n := int(buf[0])
		io.ReadFull(c, buf[:n])
		host = string(buf[:n])
	default:
		return
	}
	io.ReadFull(c, buf[:2])
	port := binary.BigEndian.Uint16(buf[:2])
	s.target <- net.JoinHostPort(host, strconv.Itoa(int(port)))
	c.Write([]byte{5, 0, 0, 1, 0, 0, 0, 0, 0, 0})
	// Echo with a prefix, standing in for the SSH server.
	data, _ := io.ReadAll(c)
	c.Write(append([]byte("echo:"), data...))
}

func TestSocksRelay(t *testing.T) {
	for _, tc := range []struct {
		name       string
		user, pass string
		auth       *proxy.Auth
		wantErr    bool
	}{
		{name: "no auth"},
		{name: "auth", user: "alice", pass: "pw", auth: &proxy.Auth{User: "alice", Password: "pw"}},
		{name: "bad auth", user: "alice", pass: "pw", auth: &proxy.Auth{User: "alice", Password: "nope"}, wantErr: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := newFakeSocks5(t, tc.user, tc.pass)
			var out bytes.Buffer
			err := socksRelay(s.ln.Addr().String(), tc.auth, "ssh.example.internal:22", strings.NewReader("hello"), &out)
			if tc.wantErr {
				if err == nil {
					t.Fatal("expected error")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if got := <-s.target; got != "ssh.example.internal:22" {
				t.Errorf("proxy got target %q (hostname must reach the proxy unresolved)", got)
			}
			if out.String() != "echo:hello" {
				t.Errorf("relayed %q", out.String())
			}
		})
	}
}
