#!/usr/bin/env node
import { spawn } from 'node:child_process';

const urlKey = ['EXPO', 'PUBLIC', 'SUPABASE', 'URL'].join('_');
const keyKey = ['EXPO', 'PUBLIC', 'SUPABASE', 'PUBLISHABLE', 'KEY'].join('_');

const env = {
  ...process.env,
  [urlKey]: 'https://example.supabase.co',
  [keyKey]: ['sb', 'publishable', 'e2e', 'placeholder'].join('_'),
};

const build = spawn(
  'npm',
  ['--workspace', '@cutsync/control', 'run', 'build:web'],
  { stdio: 'inherit', env },
);

build.on('exit', (code) => {
  if (code !== 0) process.exit(code ?? 1);
  const serve = spawn('node', ['scripts/serve-control-cloud.mjs'], {
    stdio: 'inherit',
    env,
  });
  serve.on('exit', (serveCode) => process.exit(serveCode ?? 0));
  process.on('SIGINT', () => serve.kill('SIGINT'));
  process.on('SIGTERM', () => serve.kill('SIGTERM'));
});
