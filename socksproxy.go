package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"golang.org/x/net/proxy"
)

// SOCKS5 proxy support.
//
// OpenSSH has no SOCKS client of its own, so a profile with a SOCKS proxy
// runs ssh with ProxyCommand pointing back at this executable in helper mode:
//
//	ssh -o ProxyCommand="<sshng.exe>" --socks-connect proxy:1080 %h %p ...
//
// The helper dials %h:%p through the proxy and relays the connection over
// stdin/stdout. Proxy credentials travel in environment variables (inherited
// by ssh and then by the helper) so they never appear in the command line,
// the command preview or the process list.

const (
	socksConnectFlag = "--socks-connect"
	envSocksUser     = "SSHNG_SOCKS_USER"
	envSocksPass     = "SSHNG_SOCKS_PASS"
	defaultSocksPort = "1080"
)

// socksProxy is a parsed SOCKS5 proxy setting.
type socksProxy struct {
	Addr string // host:port
	User string
	Pass string
}

// proxyDisabled reports whether a profile value explicitly switches off the
// global default proxy.
func proxyDisabled(s string) bool {
	return strings.EqualFold(strings.TrimSpace(s), "none")
}

// parseSocksProxy accepts "host:port", "host" (port 1080), or a
// socks5:// / socks5h:// URL with optional user:password@. Empty and "none"
// return nil.
func parseSocksProxy(s string) (*socksProxy, error) {
	s = strings.TrimSpace(s)
	if s == "" || proxyDisabled(s) {
		return nil, nil
	}
	if strings.ContainsAny(s, " \t\"'%") {
		return nil, errors.New("SOCKS proxy must not contain spaces, quotes or '%'")
	}
	if !strings.Contains(s, "://") {
		s = "socks5://" + s
	}
	u, err := url.Parse(s)
	if err != nil {
		return nil, fmt.Errorf("invalid SOCKS proxy: %w", err)
	}
	switch strings.ToLower(u.Scheme) {
	case "socks5", "socks5h", "socks":
	default:
		return nil, fmt.Errorf("unsupported proxy type %q: only SOCKS5 is supported", u.Scheme)
	}
	host, port := u.Hostname(), u.Port()
	if host == "" {
		return nil, errors.New("SOCKS proxy has no host")
	}
	if strings.HasPrefix(host, "-") {
		return nil, errors.New("SOCKS proxy host must not start with '-'")
	}
	if port == "" {
		port = defaultSocksPort
	}
	if n, err := strconv.Atoi(port); err != nil || n < 1 || n > 65535 {
		return nil, errors.New("invalid SOCKS proxy port: " + port)
	}
	if u.Path != "" && u.Path != "/" {
		return nil, errors.New("SOCKS proxy must be host:port, without a path")
	}
	p := &socksProxy{Addr: net.JoinHostPort(host, port)}
	if u.User != nil {
		p.User = u.User.Username()
		p.Pass, _ = u.User.Password()
	}
	return p, nil
}

// selfExecutable is the path ProxyCommand runs. A variable so tests can pin it.
var selfExecutable = func() string {
	exe, err := os.Executable()
	if err != nil {
		return "sshng"
	}
	return exe
}

// proxyCommand builds the ProxyCommand value for ssh. Only the executable is
// quoted: Windows ssh may run the command through cmd.exe, which keeps a
// leading quoted path intact only when it is the sole quoted part.
func proxyCommand(p *socksProxy) string {
	return `"` + selfExecutable() + `" ` + socksConnectFlag + " " + p.Addr + " %h %p"
}

// sessionEnv returns extra environment variables the ssh process needs.
func sessionEnv(defaults SSHOptions, p Profile) []string {
	sp, err := parseSocksProxy(effectiveOptions(defaults, p.SSH).SocksProxy)
	if err != nil || sp == nil {
		return nil
	}
	env := []string{envSocksUser + "=" + sp.User, envSocksPass + "=" + sp.Pass}
	return env
}

// runSocksConnect is the helper mode entry point: args are proxyAddr host port.
func runSocksConnect(args []string) int {
	if len(args) != 3 {
		fmt.Fprintln(os.Stderr, "usage: sshng --socks-connect proxyhost:port host port")
		return 2
	}
	var auth *proxy.Auth
	if u := os.Getenv(envSocksUser); u != "" {
		auth = &proxy.Auth{User: u, Password: os.Getenv(envSocksPass)}
	}
	if err := socksRelay(args[0], auth, net.JoinHostPort(args[1], args[2]), os.Stdin, os.Stdout); err != nil {
		fmt.Fprintf(os.Stderr, "sshng: SOCKS proxy %s: %v\r\n", args[0], err)
		return 1
	}
	return 0
}

// socksRelay connects to target through the SOCKS5 proxy and copies data
// between the connection and in/out until the remote side closes.
func socksRelay(proxyAddr string, auth *proxy.Auth, target string, in io.Reader, out io.Writer) error {
	fwd := &tcpCapture{}
	d, err := proxy.SOCKS5("tcp", proxyAddr, auth, fwd)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	// Hostnames are passed to the proxy unresolved, so DNS happens on the
	// proxy side (socks5h behaviour).
	conn, err := d.(proxy.ContextDialer).DialContext(ctx, "tcp", target)
	if err != nil {
		return err
	}
	defer conn.Close()

	go func() {
		_, _ = io.Copy(conn, in)
		// Half-close so the server sees EOF. The SOCKS wrapper hides
		// CloseWrite, so use the underlying TCP connection.
		if fwd.conn != nil {
			_ = fwd.conn.CloseWrite()
		} else {
			_ = conn.Close()
		}
	}()
	_, err = io.Copy(out, conn)
	if errors.Is(err, net.ErrClosed) {
		err = nil
	}
	return err
}

// tcpCapture dials the proxy and remembers the raw TCP connection.
type tcpCapture struct {
	conn *net.TCPConn
}

func (c *tcpCapture) Dial(network, addr string) (net.Conn, error) {
	return c.DialContext(context.Background(), network, addr)
}

func (c *tcpCapture) DialContext(ctx context.Context, network, addr string) (net.Conn, error) {
	d := net.Dialer{Timeout: 30 * time.Second}
	conn, err := d.DialContext(ctx, network, addr)
	if err != nil {
		return nil, err
	}
	if tc, ok := conn.(*net.TCPConn); ok {
		c.conn = tc
	}
	return conn, nil
}
