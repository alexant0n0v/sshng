package main

import (
	"reflect"
	"strings"
	"testing"
)

func ip(n int) *int   { return &n }
func bp(b bool) *bool { return &b }

func TestBuildArgsInheritsDefaults(t *testing.T) {
	def := SSHOptions{User: "admin", Port: 2222, IdentityFile: `C:\keys\id`, ServerAliveInterval: ip(30), Compression: bp(true)}
	got, err := buildArgs(def, Profile{Host: "example.com"})
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"-p", "2222", "-l", "admin", "-i", `C:\keys\id`, "-C", "-o", "ServerAliveInterval=30", "example.com"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %q\nwant %q", got, want)
	}
}

func TestBuildArgsProfileOverrides(t *testing.T) {
	def := SSHOptions{User: "admin", Port: 2222, Compression: bp(true), Options: []string{"A=1"}, LocalForwards: []string{"1:a:1"}}
	p := Profile{Host: "h", SSH: SSHOptions{User: "root", Port: 22, Compression: bp(false), ForwardAgent: bp(true),
		Options: []string{"B=2"}, DynamicForwards: []string{"1080"}, ExtraArgs: `-v -o "LogLevel=DEBUG 1"`}}
	got, err := buildArgs(def, p)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"-l", "root", "-o", "Compression=no", "-A", "-L", "1:a:1", "-D", "1080", "-o", "A=1", "-o", "B=2", "-v", "-o", "LogLevel=DEBUG 1", "h"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %q\nwant %q", got, want)
	}
}

func TestBuildArgsUserInHostAndRemoteCommand(t *testing.T) {
	got, err := buildArgs(SSHOptions{User: "admin"}, Profile{Host: "bob@h", RemoteCommand: "tmux attach"})
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"-t", "--", "bob@h", "tmux attach"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestBuildArgsRejectsOptionInjection(t *testing.T) {
	if _, err := buildArgs(SSHOptions{}, Profile{Host: "-oProxyCommand=calc"}); err == nil {
		t.Fatal("expected error for host starting with '-'")
	}
}

func TestSplitArgs(t *testing.T) {
	got, err := splitArgs(`-o 'A B' "C \"D\"" E\F`)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"-o", "A B", `C "D"`, `E\F`}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %q want %q", got, want)
	}
	if _, err := splitArgs(`"open`); err == nil {
		t.Fatal("expected unterminated quote error")
	}
}

func TestParseQuickConnect(t *testing.T) {
	cases := map[string]Profile{
		"host":           {Name: "host", Host: "host"},
		"u@host:2200":    {Name: "u@host:2200", Host: "host", SSH: SSHOptions{User: "u", Port: 2200}},
		"ssh u@[::1]:22": {Name: "u@[::1]:22", Host: "::1", SSH: SSHOptions{User: "u", Port: 22}},
		"fe80::1":        {Name: "fe80::1", Host: "fe80::1"},
	}
	for in, want := range cases {
		got, err := parseQuickConnect(in)
		if err != nil {
			t.Fatalf("%s: %v", in, err)
		}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("%s: got %+v want %+v", in, got, want)
		}
	}
	for _, bad := range []string{"", "h:99999", "a b"} {
		if _, err := parseQuickConnect(bad); err == nil {
			t.Fatalf("%q: expected error", bad)
		}
	}
}

func TestParseSSHConfig(t *testing.T) {
	cfg := `
Host *
  User everyone
Host web1 web2
  HostName 10.0.0.%h
  User deploy
  Port 2200
  IdentityFile ~/.ssh/deploy
Match host foo
  User nobody
Host db
  ProxyJump=bastion
`
	got := parseSSHConfig(strings.NewReader(cfg))
	if len(got) != 3 {
		t.Fatalf("want 3 profiles, got %d: %+v", len(got), got)
	}
	if got[1].Host != "web2" || got[1].SSH.User != "deploy" || got[1].SSH.Port != 2200 || got[1].SSH.IdentityFile != "~/.ssh/deploy" {
		t.Fatalf("web2 parsed wrong: %+v", got[1])
	}
	if got[2].SSH.ProxyJump != "bastion" || got[2].SSH.User != "" {
		t.Fatalf("db parsed wrong: %+v", got[2])
	}
}
