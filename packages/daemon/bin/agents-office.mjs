#!/usr/bin/env node
// `hook` runs on every Claude Code hook: it goes through a dependency-free module that Node
// executes natively (no tsx, no daemon deps). Everything else runs the TypeScript CLI via tsx
// (no build step yet).
const args = process.argv.slice(2);

if (args[0] === 'hook') {
  let runHook;
  try {
    ({ runHook } = await import('../src/cli/hook.ts'));
  } catch {
    // Node without native TypeScript support: fall back to tsx.
    const { register } = await import('tsx/esm/api');
    register();
    ({ runHook } = await import('../src/cli/hook.ts'));
  }
  await runHook({ stdin: process.stdin, env: process.env, argv: args.slice(1) });
  process.exit(0);
} else {
  const { register } = await import('tsx/esm/api');
  register();
  await import('../src/cli/index.ts');
}
