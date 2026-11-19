package main

import (
	"errors"
	"strconv"
	"strings"
	"unicode"
)

// effectiveOptions overlays profile overrides on top of the global defaults.
func effectiveOptions(def, p SSHOptions) SSHOptions {
	e := def
	if p.User != "" {
		e.User = p.User
	}
	if p.Port != 0 {
		e.Port = p.Port
	}
	if p.IdentityFile != "" {
		e.IdentityFile = p.IdentityFile
	}
	if p.ProxyJump != "" {
		e.ProxyJump = p.ProxyJump
	}
	if p.ServerAliveInterval != nil {
		e.ServerAliveInterval = p.ServerAliveInterval
	}
	if p.ServerAliveCountMax != nil {
		e.ServerAliveCountMax = p.ServerAliveCountMax
	}
	if p.ConnectTimeout != nil {
		e.ConnectTimeout = p.ConnectTimeout
	}
	if p.StrictHostKeyChecking != "" {
		e.StrictHostKeyChecking = p.StrictHostKeyChecking
	}
	if p.Compression != nil {
		e.Compression = p.Compression
	}
	if p.ForwardAgent != nil {
		e.ForwardAgent = p.ForwardAgent
	}
	if p.IdentitiesOnly != nil {
		e.IdentitiesOnly = p.IdentitiesOnly
	}
	e.LocalForwards = concat(def.LocalForwards, p.LocalForwards)
	e.RemoteForwards = concat(def.RemoteForwards, p.RemoteForwards)
	e.DynamicForwards = concat(def.DynamicForwards, p.DynamicForwards)
	e.Options = concat(def.Options, p.Options)
	e.ExtraArgs = strings.TrimSpace(def.ExtraArgs + " " + p.ExtraArgs)
	return e
}

func concat(a, b []string) []string {
	out := make([]string, 0, len(a)+len(b))
	for _, s := range append(append([]string{}, a...), b...) {
		if s = strings.TrimSpace(s); s != "" {
			out = append(out, s)
		}
	}
	return out
}

func yesNo(b bool) string {
	if b {
		return "yes"
	}
	return "no"
}

// buildArgs returns the ssh.exe argument list (without argv[0]) for a profile.
func buildArgs(defaults SSHOptions, p Profile) ([]string, error) {
	host := strings.TrimSpace(p.Host)
	if host == "" {
		return nil, errors.New("host is empty")
	}
	if strings.HasPrefix(host, "-") {
		return nil, errors.New("host must not start with '-'")
	}
	e := effectiveOptions(defaults, p.SSH)

	var args []string
	if e.Port != 0 && e.Port != 22 {
		args = append(args, "-p", strconv.Itoa(e.Port))
	}
	if e.User != "" && !strings.Contains(host, "@") {
		args = append(args, "-l", e.User)
	}
	if e.IdentityFile != "" {
		args = append(args, "-i", e.IdentityFile)
	}
	if e.ProxyJump != "" {
		args = append(args, "-J", e.ProxyJump)
	}
	if e.Compression != nil {
		if *e.Compression {
			args = append(args, "-C")
		} else {
			args = append(args, "-o", "Compression=no")
		}
	}
	if e.ForwardAgent != nil {
		if *e.ForwardAgent {
			args = append(args, "-A")
		} else {
			args = append(args, "-a")
		}
	}
	if e.ServerAliveInterval != nil {
		args = append(args, "-o", "ServerAliveInterval="+strconv.Itoa(*e.ServerAliveInterval))
	}
	if e.ServerAliveCountMax != nil {
		args = append(args, "-o", "ServerAliveCountMax="+strconv.Itoa(*e.ServerAliveCountMax))
	}
	if e.ConnectTimeout != nil {
		args = append(args, "-o", "ConnectTimeout="+strconv.Itoa(*e.ConnectTimeout))
	}
	if e.StrictHostKeyChecking != "" {
		args = append(args, "-o", "StrictHostKeyChecking="+e.StrictHostKeyChecking)
	}
	if e.IdentitiesOnly != nil {
		args = append(args, "-o", "IdentitiesOnly="+yesNo(*e.IdentitiesOnly))
	}
	for _, f := range e.LocalForwards {
		args = append(args, "-L", f)
	}
	for _, f := range e.RemoteForwards {
		args = append(args, "-R", f)
	}
	for _, f := range e.DynamicForwards {
		args = append(args, "-D", f)
	}
	for _, o := range e.Options {
		args = append(args, "-o", o)
	}
	if e.ExtraArgs != "" {
		extra, err := splitArgs(e.ExtraArgs)
		if err != nil {
			return nil, err
		}
		args = append(args, extra...)
	}
	if rc := strings.TrimSpace(p.RemoteCommand); rc != "" {
		// Force a TTY so interactive remote commands (htop, tmux attach) work.
		args = append(args, "-t", "--", host, rc)
	} else {
		args = append(args, host)
	}
	return args, nil
}

// splitArgs splits a command line into words, honouring single and double
// quotes and backslash escapes inside double quotes.
func splitArgs(s string) ([]string, error) {
	var (
		out     []string
		cur     strings.Builder
		inWord  bool
		quote   rune
		escaped bool
	)
	for _, r := range s {
		switch {
		case escaped:
			cur.WriteRune(r)
			escaped = false
		case quote == '\'':
			if r == '\'' {
				quote = 0
			} else {
				cur.WriteRune(r)
			}
		case quote == '"':
			if r == '"' {
				quote = 0
			} else if r == '\\' {
				escaped = true
			} else {
				cur.WriteRune(r)
			}
		case r == '\'' || r == '"':
			quote = r
			inWord = true
		case unicode.IsSpace(r):
			if inWord {
				out = append(out, cur.String())
				cur.Reset()
				inWord = false
			}
		default:
			cur.WriteRune(r)
			inWord = true
		}
	}
	if quote != 0 {
		return nil, errors.New("unterminated quote in extra arguments")
	}
	if escaped {
		cur.WriteRune('\\')
	}
	if inWord {
		out = append(out, cur.String())
	}
	return out, nil
}

// quoteForDisplay renders args as a copy-pasteable command line.
func quoteForDisplay(bin string, args []string) string {
	parts := []string{quoteWord(bin)}
	for _, a := range args {
		parts = append(parts, quoteWord(a))
	}
	return strings.Join(parts, " ")
}

func quoteWord(s string) string {
	if s == "" {
		return `""`
	}
	if strings.ContainsAny(s, " \t\"'") {
		return `"` + strings.ReplaceAll(s, `"`, `\"`) + `"`
	}
	return s
}

// parseQuickConnect turns "user@host:port" (or "host", "user@host",
// "[ipv6]:port") into a transient profile.
func parseQuickConnect(target string) (Profile, error) {
	t := strings.TrimSpace(target)
	if strings.HasPrefix(t, "ssh ") {
		t = strings.TrimSpace(t[4:])
	}
	if t == "" {
		return Profile{}, errors.New("enter a host, e.g. user@example.com:22")
	}
	if strings.ContainsAny(t, " \t") {
		return Profile{}, errors.New("quick connect accepts user@host[:port] only")
	}
	p := Profile{Name: t}
	if i := strings.LastIndex(t, "@"); i >= 0 {
		p.SSH.User = t[:i]
		t = t[i+1:]
	}
	host, port := t, ""
	if strings.HasPrefix(t, "[") {
		if j := strings.Index(t, "]"); j > 0 {
			host = t[1:j]
			if rest := t[j+1:]; strings.HasPrefix(rest, ":") {
				port = rest[1:]
			}
		}
	} else if strings.Count(t, ":") == 1 {
		k := strings.Index(t, ":")
		host, port = t[:k], t[k+1:]
	}
	if port != "" {
		n, err := strconv.Atoi(port)
		if err != nil || n < 1 || n > 65535 {
			return Profile{}, errors.New("invalid port: " + port)
		}
		p.SSH.Port = n
	}
	p.Host = host
	return p, nil
}
