// Hook sleeps (mode sleep:N). We answer the TERMINAL prompt after ~5s. Question: is the hook process killed / does its stdout pipe close?
// usage: run-scenario.sh scenario-term-first.cjs sleep:60:allow g3.txt   (answer: ANSWER=yes|no, default yes)
const { start } = require('./ptylib.cjs');
const fs = require('fs');
(async () => {
  const { SPIKE_DIR, PROJ } = process.env;
  const mode = process.argv[2];
  fs.writeFileSync(`${SPIKE_DIR}/mode`, mode);
  const c = start({ cwd: PROJ, args: ['--permission-mode', 'default'], vars: { AGENTS_OFFICE_TERMINAL_ID: 'term-XYZ-123' }, log: `${SPIKE_DIR}/pty-tf.log` });
  await c.sleep(3500);
  if (/trust/i.test(c.text)) { c.send('\x1b[B'); await c.sleep(300); c.send('\r'); await c.sleep(2500); }
  c.mark();
  c.send(`Run this exact command with Bash: echo hi > ${PROJ}/${process.argv[3] || 'g3.txt'} . Then say FINISHED_MARKER.`);
  await c.sleep(300); c.send('\r');
  const tPrompt = await c.waitFor(/Do you want|1\. Yes/i, 40000);
  console.log('prompt seen', tPrompt, 'epoch', Date.now() / 1000);
  await c.sleep(5000);
  const answer = process.env.ANSWER === 'no' ? '4' : '1';
  c.send(answer);
  console.log('answered terminal with', answer, 'epoch', Date.now() / 1000);
  if (answer === '1') c.send('\r');
  await c.sleep(12000);
  console.log('hook pid alive after answer?', (() => { try { const pid = Number(fs.readFileSync(`${SPIKE_DIR}/sleeper.pid`, 'utf8')); process.kill(pid, 0); return 'ALIVE ' + pid; } catch (e) { return 'dead/absent'; } })());
  console.log(c.text.slice(-700));
  c.kill();
  process.exit(0);
})();
