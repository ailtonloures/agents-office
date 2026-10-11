// Throwaway Electron main: loads node-pty inside Electron and runs a pty command.
// Copy to a throwaway dir as main.js with `electron`, `@electron/rebuild`, `node-pty` installed.
const { app } = require('electron');
app.whenReady().then(() => {
  try {
    const pty = require('node-pty');
    const p = pty.spawn('/bin/sh', ['-c', 'echo PTY_OK_$AGENTS_OFFICE_TERMINAL_ID; stty size'], {
      name: 'xterm', cols: 100, rows: 30,
      env: Object.assign({}, process.env, { AGENTS_OFFICE_TERMINAL_ID: 'T1' }),
    });
    let out = '';
    p.onData((d) => (out += d));
    p.onExit(({ exitCode }) => {
      console.log('RESULT', JSON.stringify(out), 'exit', exitCode, 'electron', process.versions.electron, 'node', process.versions.node, 'modules', process.versions.modules);
      app.quit();
    });
  } catch (e) { console.log('LOAD_FAIL', e.message); app.quit(); }
});
