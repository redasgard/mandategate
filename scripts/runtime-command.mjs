import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimeProfile } from './runtime-profile.mjs';

const require = createRequire(import.meta.url);
const scripts = { migrate: 'scripts/migrate.ts', seed: 'scripts/seed.ts', start: 'scripts/render-start.ts' };
export async function runRuntimeCommand(command, env = process.env) {
  if (!Object.hasOwn(scripts, command)) throw Error('RUNTIME_COMMAND_INVALID');
  const profile = runtimeProfile(env);
  if (profile.isolated && command !== 'start') {
    console.log(`SKIP ${command}: ${profile.mode}; no database client loaded`);
    return;
  }
  const argv = profile.isolated
    ? [require.resolve('next/dist/bin/next'), 'start', '--hostname', profile.childEnv.PREVIEW_HOST, '--port', profile.childEnv.PORT]
    : ['--import', 'tsx', resolve(scripts[command])];
  const child = spawn(process.execPath, argv, { env: profile.isolated ? profile.childEnv : env, stdio: 'inherit' });
  let signalRequested;
  let forced = false;
  let timer;
  const stop = (signal) => {
    if (signalRequested || child.exitCode !== null || child.signalCode !== null) return;
    signalRequested = signal;
    child.kill(signal);
    timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) { forced = true; child.kill('SIGKILL'); }
    }, 8000);
    timer.unref();
  };
  const term = () => stop('SIGTERM');
  const interrupt = () => stop('SIGINT');
  process.once('SIGTERM', term);
  process.once('SIGINT', interrupt);
  child.once('spawn', () => {
    if (process.connected) process.send?.({ type: 'runtime-child', pid: child.pid, mode: profile.mode });
  });
  try {
    await new Promise((resolveExit, reject) => {
      child.once('error', () => reject(Error('RUNTIME_CHILD_SPAWN_FAILED')));
      child.once('close', (code, signal) => {
        const expected = signalRequested && (signal === signalRequested ||
          (signalRequested === 'SIGTERM' && code === 143) || (signalRequested === 'SIGINT' && code === 130));
        if (!forced && (code === 0 || expected)) resolveExit();
        else reject(Error('RUNTIME_CHILD_FAILED'));
      });
    });
  } finally {
    clearTimeout(timer);
    process.removeListener('SIGTERM', term);
    process.removeListener('SIGINT', interrupt);
    if (process.connected) process.disconnect();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runRuntimeCommand(process.argv[2]).catch((e) => {
    const code = /^[A-Z_]+$/.test(e.message ?? '') ? e.message : 'RUNTIME_COMMAND_FAILED';
    console.error(code);
    process.exitCode = 1;
  });
}
