#!/usr/bin/env node
// Plain-Node entry of the published package (no tsx, no build-time tooling at runtime).
// `hook` runs on every Claude Code hook, so it goes through a dependency-free bundle.
const args = process.argv.slice(2);

if (args[0] === 'hook') {
  const { runHook } = await import('../dist/hook.mjs');
  await runHook({ stdin: process.stdin, env: process.env, argv: args.slice(1) });
  process.exit(0);
} else {
  await import('../dist/cli.mjs');
}
