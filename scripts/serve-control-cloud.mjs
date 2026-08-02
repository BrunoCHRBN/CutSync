#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'apps/control/dist');
const port = process.env.PORT || '8083';

if (!fs.existsSync(dist)) {
  console.error('Missing apps/control/dist. Run the Control web build first.');
  process.exit(1);
}

const stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cutsync-cloud-serve-'));
const cloudRoot = path.join(stageRoot, 'cloud');
fs.mkdirSync(cloudRoot, { recursive: true });
fs.cpSync(dist, cloudRoot, { recursive: true });

console.log(`Serving CutSync Cloud static export from ${cloudRoot} at http://127.0.0.1:${port}/cloud`);

const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['--yes', 'serve', stageRoot, '-l', String(port)],
  { stdio: 'inherit' },
);

const cleanup = () => {
  try {
    fs.rmSync(stageRoot, { recursive: true, force: true });
  } catch {
    // ignore cleanup failures
  }
};

child.on('exit', (code) => {
  cleanup();
  process.exit(code ?? 0);
});

process.on('SIGINT', () => {
  child.kill('SIGINT');
});
process.on('SIGTERM', () => {
  child.kill('SIGTERM');
});
