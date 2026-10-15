import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import { exerciseRecovery, portOpen } from '../scripts/verify-neon-preview-recovery.mjs';

test('supervisor denies unsafe env and proves distinct stopped servers', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'mg-recovery-'));
  try {
    await mkdir(resolve(root, 'scripts'));
    await mkdir(resolve(root, 'node_modules/next/dist/bin'), { recursive: true });
    await writeFile(resolve(root, 'package.json'), '{"type":"module"}');
    await writeFile(resolve(root, 'scripts/neon-preview-start.ts'), await readFile(new URL('../scripts/neon-preview-start.ts', import.meta.url)));
    await writeFile(resolve(root, 'node_modules/next/package.json'), '{"type":"commonjs"}');
    await writeFile(resolve(root, 'node_modules/next/dist/bin/next.js'), `
      const http = require('node:http');
      const port = Number(process.argv[process.argv.indexOf('--port') + 1]);
      const server = http.createServer((req,res) => {
        res.setHeader('content-type','application/json');
        if(req.url==='/api/health')res.end(JSON.stringify({ok:true,database:'ready'}));
        else {res.statusCode=503;res.end(JSON.stringify({error:'PAYMENT_INTEGRATIONS_DISABLED_FOR_PREVIEW'}));}
      }).listen(port,'127.0.0.1');
      process.on('SIGTERM',()=>{server.close(()=>process.exit(0));server.closeAllConnections();});
    `);
    const env = { PATH: process.env.PATH, MANDATEGATE_DISABLE_PAYMENTS:'1',
      DATABASE_URL:'postgresql://fake:fake@fixture.neon.tech/neondb',
      BETTER_AUTH_SECRET:'local-only-test-value-of-at-least-32-characters',
      PORT:'31979', PREVIEW_HOST:'127.0.0.1' };
    const options = { cwd:root, launcher:resolve(root,'scripts/neon-preview-start.ts'),
      execArgv:['--experimental-strip-types'], env, port:31979 };
    const r = await exerciseRecovery(options);
    assert.equal(r.startupDenials.length,3);
    assert.equal(r.cycles.length,2);
    assert.equal(await portOpen(31979),false);
    const occupied = createServer().listen(31979,'127.0.0.1');
    await new Promise((resolveReady)=>occupied.once('listening',resolveReady));
    try { await assert.rejects(exerciseRecovery(options), /PREVIEW_PORT_ALREADY_IN_USE/); }
    finally { await new Promise(resolveClose=>occupied.close(resolveClose)); }
  } finally { await rm(root,{recursive:true,force:true}); }
});
