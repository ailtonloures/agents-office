// Helper for spike scenarios: drives `claude` in a pty (node-pty must be resolvable: set NODE_PATH to a throwaway node_modules).
const pty = require('node-pty');
const fs = require('fs');
const { Terminal } = require('@xterm/headless');
const strip = (s) => s.replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]/g, '').replace(/\x1b\][^\x07]*\x07/g, '').replace(/[\x00-\x08\x0b-\x1f]/g, '');
// When this spike runs inside a Claude Code session the parent leaks CLAUDECODE / CLAUDE_CODE_* markers (e.g.
// CLAUDE_CODE_CHILD_SESSION turns transcript saving OFF in the child). The real app must scrub them too.
const cleanEnv = (e) => Object.fromEntries(Object.entries(e).filter(([k]) => !/^(CLAUDECODE|CLAUDE_CODE_(?!USE_BEDROCK)|CLAUDE_EFFORT|CLAUDE_PID)/.test(k)));
exports.cleanEnv = cleanEnv;
exports.start = function start({ cwd, vars = {}, args = [], cols = 120, rows = 40, log }) {
  const t0 = Date.now();
  const p = pty.spawn(process.env.CLAUDE_BIN || 'claude', args, { name: 'xterm-256color', cols, rows, cwd, env: { ...(process.env.NOSCRUB ? process.env : cleanEnv(process.env)), ...vars } });
  let buf = '';
  const term = new Terminal({ cols, rows, allowProposedApi: true });
  const out = fs.createWriteStream(log);
  p.onData((d) => { buf += d; term.write(d); out.write(`[+${((Date.now() - t0) / 1000).toFixed(2)}s] ${JSON.stringify(strip(d))}\n`); });
  const api = {
    // current rendered screen (what a user would see right now)
    screen() { const b = term.buffer.active; const L = []; for (let i = b.baseY; i < b.baseY + rows; i++) L.push(b.getLine(i).translateToString(true)); return L.join('\n').trimEnd(); },
    hasPrompt() { return /Do you want to proceed|Do you want to (make|create)/.test(api.screen()); },
    p, t0, get text() { return strip(buf); },
    now: () => ((Date.now() - t0) / 1000).toFixed(2),
    mark: () => (buf = ''),
    send: (s) => p.write(s),
    async waitFor(re, ms = 30000) {
      const end = Date.now() + ms;
      while (Date.now() < end) { if (re.test(strip(buf))) return api.now(); await new Promise((r) => setTimeout(r, 100)); }
      return null;
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    kill: () => { try { p.kill(); } catch {} },
  };
  return api;
};
