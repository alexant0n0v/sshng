package main

import (
	"bufio"
	"io"
	"strconv"
	"strings"
)

// parseSSHConfig extracts concrete Host entries from an OpenSSH client config
// (~/.ssh/config). Wildcard patterns, negations and Match blocks are skipped.
// Profiles use the alias as Host, so ssh.exe still applies the rest of the
// config file; HostName/User/Port/etc. are copied for display and editing.
func parseSSHConfig(r io.Reader) []Profile {
	var (
		out     []Profile
		current []int // indexes into out for the active Host block
	)
	sc := bufio.NewScanner(r)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, val := splitConfigLine(line)
		if key == "" {
			continue
		}
		switch strings.ToLower(key) {
		case "host":
			current = nil
			for _, alias := range strings.Fields(val) {
				if strings.ContainsAny(alias, "*?!") {
					continue
				}
				out = append(out, Profile{Name: alias, Host: alias})
				current = append(current, len(out)-1)
			}
		case "match":
			current = nil
		default:
			for _, i := range current {
				applyConfigKey(&out[i], strings.ToLower(key), val)
			}
		}
	}
	return out
}

func splitConfigLine(line string) (string, string) {
	i := strings.IndexFunc(line, func(r rune) bool { return r == ' ' || r == '\t' || r == '=' })
	if i < 0 {
		return line, ""
	}
	key := line[:i]
	val := strings.TrimLeft(line[i:], " \t=")
	val = strings.Trim(val, `"`)
	return key, val
}

func applyConfigKey(p *Profile, key, val string) {
	switch key {
	case "hostname":
		if p.Notes == "" {
			p.Notes = "HostName " + val
		}
	case "user":
		p.SSH.User = val
	case "port":
		if n, err := strconv.Atoi(val); err == nil {
			p.SSH.Port = n
		}
	case "identityfile":
		if p.SSH.IdentityFile == "" {
			p.SSH.IdentityFile = val
		}
	case "proxyjump":
		p.SSH.ProxyJump = val
	}
}
