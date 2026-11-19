// Owns the xterm.js instances (one per tab) outside React, and wires them to
// backend sessions. React only provides the container element.
import { Terminal, type ITerminalOptions, type IDisposable } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { SearchAddon } from '@xterm/addon-search';
import { api, errMsg } from './api';
import { DEFAULT_TERMINAL } from './defaults';
import { resolveTheme } from './themes';
import type { TerminalSettings, ThemeColors } from './types';
import { closeTab, flushSave, toast, updateTab, useStore } from './store';

interface Entry {
  tabId: string;
  term: Terminal;
  fit: FitAddon;
  search: SearchAddon;
  webgl?: WebglAddon;
  outer: HTMLDivElement; // padding + background
  inner: HTMLDivElement; // xterm mounts here
  sessionId?: string;
  exited: boolean;
  connecting: boolean;
  disposables: IDisposable[];
  ro: ResizeObserver;
  resizeTimer?: number;
}

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(s: string): string {
  // xterm's onBinary delivers a "binary string" (one char per byte).
  return btoa(s);
}

const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

export function xtermOptions(s: TerminalSettings, theme: ThemeColors): ITerminalOptions {
  return {
    theme,
    fontFamily: s.fontFamily,
    fontSize: s.fontSize,
    lineHeight: s.lineHeight,
    letterSpacing: s.letterSpacing,
    fontWeight: 'normal',
    fontWeightBold: s.boldFonts ? 'bold' : 'normal',
    drawBoldTextInBrightColors: s.boldIsBright,
    minimumContrastRatio: s.minimumContrastRatio,
    cursorStyle: s.cursorStyle,
    cursorBlink: s.cursorBlink,
    cursorInactiveStyle: 'outline',
    scrollback: s.scrollback,
  };
}

class TerminalManager {
  private entries = new Map<string, Entry>();
  private sidToTab = new Map<string, string>();
  private pending = new Map<string, { data: Uint8Array[]; exit?: [number, string] }>();
  private settings: TerminalSettings = DEFAULT_TERMINAL;
  private initialized = false;

  init() {
    if (this.initialized) return;
    this.initialized = true;
    api.on('pty:data', (sid: string, b64: string) => {
      const tabId = this.sidToTab.get(sid);
      const bytes = b64ToBytes(b64);
      if (tabId) this.entries.get(tabId)?.term.write(bytes);
      else this.pendingFor(sid).data.push(bytes);
    });
    api.on('pty:exit', (sid: string, code: number, msg: string) => {
      const tabId = this.sidToTab.get(sid);
      if (tabId) this.onExit(tabId, code, msg);
      else this.pendingFor(sid).exit = [code, msg];
    });
  }

  private pendingFor(sid: string) {
    let p = this.pending.get(sid);
    if (!p) {
      p = { data: [] };
      this.pending.set(sid, p);
    }
    return p;
  }

  private themeFor(tabId: string): ThemeColors {
    const st = useStore.getState();
    const tab = st.tabs.find((t) => t.id === tabId);
    const profile = tab?.profileId ? st.data?.profiles.find((p) => p.id === tab.profileId) : undefined;
    const id = profile?.theme || this.settings.theme;
    return resolveTheme(id, this.settings.customTheme);
  }

  /** Called by <TerminalView>; creates the terminal on first mount. */
  mount(tabId: string, container: HTMLElement) {
    let e = this.entries.get(tabId);
    if (!e) {
      e = this.create(tabId);
      container.appendChild(e.outer);
      e.term.open(e.inner);
      this.loadWebgl(e);
      requestAnimationFrame(() => {
        this.fit(tabId);
        void this.connect(tabId);
      });
    } else if (e.outer.parentElement !== container) {
      container.appendChild(e.outer);
    }
  }

  private create(tabId: string): Entry {
    const outer = document.createElement('div');
    outer.className = 'term-outer';
    const inner = document.createElement('div');
    inner.className = 'term-inner';
    outer.appendChild(inner);

    const theme = this.themeFor(tabId);
    const isWin = useStore.getState().env?.os === 'windows';
    const term = new Terminal({
      ...xtermOptions(this.settings, theme),
      allowProposedApi: true,
      rightClickSelectsWord: false,
      windowsPty: isWin ? { backend: 'conpty' } : undefined,
    });
    const fit = new FitAddon();
    const search = new SearchAddon();
    term.loadAddon(fit);
    term.loadAddon(search);
    term.loadAddon(new WebLinksAddon((ev, uri) => {
      if (ev.ctrlKey || ev.metaKey) api.openURL(uri);
    }));

    const e: Entry = {
      tabId, term, fit, search, outer, inner, exited: false, connecting: false, disposables: [],
      ro: new ResizeObserver(() => this.fit(tabId)),
    };
    this.styleOuter(e, theme);
    e.ro.observe(outer);

    e.disposables.push(
      term.onData((data) => this.onInput(e, data)),
      term.onBinary((data) => {
        if (e.sessionId) api.writeB64(e.sessionId, bytesToB64(data)).catch(() => {});
      }),
      term.onResize(({ cols, rows }) => {
        window.clearTimeout(e.resizeTimer);
        e.resizeTimer = window.setTimeout(() => {
          if (e.sessionId) api.resize(e.sessionId, cols, rows).catch(() => {});
        }, 60);
      }),
      term.onTitleChange((title) => updateTab(tabId, { remoteTitle: title })),
      term.onBell(() => {
        if (this.settings.bell !== 'visual') return;
        outer.classList.remove('bell');
        void outer.offsetWidth; // restart animation
        outer.classList.add('bell');
      }),
      term.onSelectionChange(() => {
        if (this.settings.copyOnSelect && term.hasSelection()) void api.clipboardSet(term.getSelection());
      }),
    );
    this.entries.set(tabId, e);
    return e;
  }

  private styleOuter(e: Entry, theme: ThemeColors) {
    e.outer.style.background = theme.background;
    e.outer.style.padding = `${this.settings.padding}px`;
  }

  private loadWebgl(e: Entry) {
    if (!this.settings.gpu || e.webgl) return;
    try {
      const gl = new WebglAddon();
      gl.onContextLoss(() => {
        gl.dispose();
        e.webgl = undefined;
      });
      e.term.loadAddon(gl);
      e.webgl = gl;
    } catch {
      // Fall back to the DOM renderer.
    }
  }

  private onInput(e: Entry, data: string) {
    if (e.exited) {
      if (data === '\r' && !e.connecting) void this.connect(e.tabId);
      return;
    }
    if (e.sessionId) api.write(e.sessionId, data).catch(() => {});
  }

  async connect(tabId: string) {
    const e = this.entries.get(tabId);
    const tab = useStore.getState().tabs.find((t) => t.id === tabId);
    if (!e || !tab || e.connecting) return;
    e.connecting = true;
    e.exited = false;
    updateTab(tabId, { status: 'connecting', exitCode: undefined });
    this.fit(tabId);
    const { cols, rows } = e.term;
    try {
      await flushSave();
      const res = tab.profileId
        ? await api.connect(tab.profileId, cols, rows)
        : await api.quickConnect(tab.quickTarget ?? '', cols, rows);
      if (!this.entries.has(tabId)) {
        api.close(res.sessionId); // tab was closed while connecting
        return;
      }
      e.sessionId = res.sessionId;
      this.sidToTab.set(res.sessionId, tabId);
      e.term.write(`${DIM}${res.command}${RESET}\r\n`);
      updateTab(tabId, { sessionId: res.sessionId, status: 'running', command: res.command });
      if (res.lastUsedAt && tab.profileId) {
        // The backend already persisted it; mirror it locally.
        useStore.setState((s) => (s.data ? {
          data: { ...s.data, profiles: s.data.profiles.map((p) => (p.id === tab.profileId ? { ...p, lastUsedAt: res.lastUsedAt } : p)) },
        } : {}));
      }
      const p = this.pending.get(res.sessionId);
      if (p) {
        this.pending.delete(res.sessionId);
        p.data.forEach((b) => e.term.write(b));
        if (p.exit) this.onExit(tabId, ...p.exit);
      }
      if (useStore.getState().activeTabId === tabId) e.term.focus();
    } catch (err) {
      e.exited = true;
      e.term.write(`\r\n${RED}✖ ${errMsg(err)}${RESET}\r\n${DIM}Press Enter to retry.${RESET}\r\n`);
      updateTab(tabId, { status: 'error' });
    } finally {
      e.connecting = false;
    }
  }

  private onExit(tabId: string, code: number, msg: string) {
    const e = this.entries.get(tabId);
    if (!e) return;
    if (e.sessionId) this.sidToTab.delete(e.sessionId);
    e.sessionId = undefined;
    e.exited = true;
    updateTab(tabId, { status: code === 0 ? 'exited' : 'error', exitCode: code, sessionId: undefined });
    if (code === 0 && useStore.getState().data?.settings.closeOnCleanExit) {
      void closeTab(tabId, true);
      return;
    }
    const detail = msg ? ` — ${msg}` : '';
    e.term.write(`\r\n${DIM}[Session ended with exit code ${code}${detail}. Press Enter to reconnect.]${RESET}\r\n`);
  }

  reconnect(tabId: string) {
    const e = this.entries.get(tabId);
    if (!e) return;
    if (e.sessionId) {
      // Kill the current session first; reconnect once it has exited.
      const sid = e.sessionId;
      api.close(sid);
      const wait = window.setInterval(() => {
        if (!this.sidToTab.has(sid)) {
          window.clearInterval(wait);
          void this.connect(tabId);
        }
      }, 50);
      return;
    }
    void this.connect(tabId);
  }

  disconnect(tabId: string) {
    const e = this.entries.get(tabId);
    if (e?.sessionId) api.close(e.sessionId);
  }

  dispose(tabId: string) {
    const e = this.entries.get(tabId);
    if (!e) return;
    this.entries.delete(tabId);
    if (e.sessionId) {
      this.sidToTab.delete(e.sessionId);
      api.close(e.sessionId);
    }
    e.ro.disconnect();
    e.disposables.forEach((d) => d.dispose());
    e.term.dispose();
    e.outer.remove();
  }

  fit(tabId: string) {
    const e = this.entries.get(tabId);
    if (!e || e.outer.offsetWidth === 0 || e.outer.offsetHeight === 0) return;
    try {
      e.fit.fit();
    } catch {
      /* not yet rendered */
    }
  }

  focus(tabId: string) {
    const e = this.entries.get(tabId);
    if (!e) return;
    this.fit(tabId);
    e.term.focus();
  }

  applySettings(s: TerminalSettings) {
    const gpuChanged = s.gpu !== this.settings.gpu;
    this.settings = s;
    for (const e of this.entries.values()) {
      const theme = this.themeFor(e.tabId);
      e.term.options = xtermOptions(s, theme);
      this.styleOuter(e, theme);
      if (gpuChanged) {
        if (s.gpu) this.loadWebgl(e);
        else {
          e.webgl?.dispose();
          e.webgl = undefined;
        }
      }
      this.fit(e.tabId);
    }
  }

  applyProfileTheme(profileId: string) {
    const tabs = useStore.getState().tabs.filter((t) => t.profileId === profileId);
    for (const t of tabs) {
      const e = this.entries.get(t.id);
      if (!e) continue;
      const theme = this.themeFor(t.id);
      e.term.options.theme = theme;
      this.styleOuter(e, theme);
    }
  }

  // ---- clipboard / misc actions ----

  hasSelection(tabId?: string) {
    return !!(tabId && this.entries.get(tabId)?.term.hasSelection());
  }

  async copy(tabId?: string) {
    const e = tabId ? this.entries.get(tabId) : undefined;
    if (!e || !e.term.hasSelection()) return false;
    await api.clipboardSet(e.term.getSelection());
    e.term.clearSelection();
    return true;
  }

  async paste(tabId?: string) {
    const e = tabId ? this.entries.get(tabId) : undefined;
    if (!e) return;
    try {
      const text = await api.clipboardGet();
      if (text) e.term.paste(text);
    } catch (err) {
      toast('Clipboard unavailable: ' + errMsg(err), 'error');
    }
  }

  clear(tabId?: string) {
    const e = tabId ? this.entries.get(tabId) : undefined;
    e?.term.clear();
  }

  selectAll(tabId?: string) {
    const e = tabId ? this.entries.get(tabId) : undefined;
    e?.term.selectAll();
  }

  find(tabId: string | undefined, query: string, dir: 'next' | 'prev', opts: { caseSensitive: boolean; regex: boolean }) {
    const e = tabId ? this.entries.get(tabId) : undefined;
    if (!e || !query) return false;
    const o = {
      caseSensitive: opts.caseSensitive, regex: opts.regex,
      decorations: { matchOverviewRuler: '#888', activeMatchColorOverviewRuler: '#ffd33d', matchBackground: '#5a4a00', activeMatchBackground: '#b08800' },
    };
    return dir === 'next' ? e.search.findNext(query, o) : e.search.findPrevious(query, o);
  }

  clearFind(tabId?: string) {
    const e = tabId ? this.entries.get(tabId) : undefined;
    e?.search.clearDecorations();
    e?.term.clearSelection();
  }
}

export const terminals = new TerminalManager();
