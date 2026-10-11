// usage: SPIKE_DIR=... PROJ=... NODE_PATH=<throwaway node_modules> node scenario-basic.cjs <mode> [outfile]
// Starts interactive claude in a pty with AGENTS_OFFICE_TERMINAL_ID, types a prompt, and reports when the
// terminal permission prompt appears relative to the hook events (SPIKE_DIR/events.log has epoch timestamps).
const { start } = require('./ptylib.cjs');
const fs = require('fs');
(async () => {
  const { SPIKE_DIR, PROJ } = process.env;
  const mode = process.argv[2] || 'allow';
  fs.writeFileSync(`${SPIKE_DIR}/mode`, mode);
  const c = start({ cwd: PROJ, args: ['--permission-mode', 'default'], vars: { AGENTS_OFFICE_TERMINAL_ID: 'term-XYZ-123' }, log: `${SPIKE_DIR}/pty-${mode.replace(/:/g, '_')}.log` });
  console.log('start epoch', Date.now() / 1000);
  await c.sleep(3500);
  if (/trust/i.test(c.text)) { c.send('\x1b[B'); await c.sleep(300); c.send('\r'); await c.sleep(2500); } // folder-trust dialog
  console.log('after trust handling:', c.text.slice(-200));
  c.mark();
  c.send(`Run this exact command with Bash: echo hi > ${PROJ}/${process.argv[3] || 'g1.txt'} . Then say FINISHED_MARKER.`);
  await c.sleep(300); c.send('\r');
  console.log('prompt typed epoch', Date.now() / 1000);
  const tPrompt = await c.waitFor(/Do you want|Yes, and|1\. Yes/i, Number(process.env.PROMPT_MS || 40000));
  console.log(`terminal permission prompt first seen at +${tPrompt}s (epoch ${Date.now() / 1000})`);
  if (process.env.AUTO_ENTER && tPrompt) { c.send('\r'); }
  const tDone = await c.waitFor(/FINISHED_MARKER[^"]*$|Worked for/i, Number(process.env.WAIT_MS || 30000));
  console.log('done-ish at', tDone);
  console.log(c.text.slice(-1200));
  c.kill();
  process.exit(0);
})();
