// Generic: usage run-scenario.sh scenario-gen.cjs <mode> <outfile>
// params (env): KILL_AFTER=<s> kills the sleeping hook pid; ANSWER_AFTER=<s> answers terminal prompt with ANSWER (1=yes, 4=no);
// OBSERVE=<s> total observation time. Samples every 2s whether the permission prompt is on screen.
const { start } = require('./ptylib.cjs');
const fs = require('fs');
(async () => {
  const { SPIKE_DIR, PROJ } = process.env;
  const mode = process.argv[2];
  fs.writeFileSync(`${SPIKE_DIR}/mode`, mode);
  const c = start({ cwd: PROJ, args: ['--permission-mode', 'default'], vars: { AGENTS_OFFICE_TERMINAL_ID: 'term-XYZ-123' }, log: `${SPIKE_DIR}/pty-gen.log` });
  await c.sleep(3500);
  if (/trust/i.test(c.screen())) { c.send('\x1b[B'); await c.sleep(300); c.send('\r'); await c.sleep(2500); }
  c.send(`Run this exact command with Bash: echo hi > ${PROJ}/${process.argv[3] || 'g9.txt'} . Then say FINISHED_MARKER and nothing else.`);
  await c.sleep(300); c.send('\r');
  const t0 = Date.now(); const el = () => ((Date.now() - t0) / 1000).toFixed(1);
  console.log('typed prompt, epoch', t0 / 1000);
  let killed = false, answered = false;
  const obs = Number(process.env.OBSERVE || 30);
  while ((Date.now() - t0) / 1000 < obs) {
    await c.sleep(2000);
    let alive = 'n/a'; try { const pid = Number(fs.readFileSync(`${SPIKE_DIR}/sleeper.pid`, 'utf8')); process.kill(pid, 0); alive = 'ALIVE'; } catch { alive = 'dead/none'; }
    console.log(`t=${el()}s prompt-on-screen=${c.hasPrompt()} hook-process=${alive}`);
    if (process.env.KILL_AFTER && !killed && el() >= Number(process.env.KILL_AFTER)) {
      killed = true;
      try { const pid = Number(fs.readFileSync(`${SPIKE_DIR}/sleeper.pid`, 'utf8')); process.kill(pid, 'SIGKILL'); console.log('>> SIGKILL sleeper', pid, 'at', el()); } catch (e) { console.log('kill failed', e.message); }
      // also kill the parent bash wrapper(s)
      try { require('child_process').execSync(`pkill -KILL -f 'spike-scripts/perm-hoo[k]'`); } catch {}
    }
    if (process.env.ANSWER_AFTER && !answered && el() >= Number(process.env.ANSWER_AFTER)) {
      answered = true; c.send(process.env.ANSWER || '1'); if ((process.env.ANSWER || '1') === '1') c.send('\r'); console.log('>> answered terminal at', el());
    }
  }
  console.log('--- final screen (tail)\n' + c.screen().split('\n').slice(-22).join('\n'));
  c.kill(); process.exit(0);
})();
