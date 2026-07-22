/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = process.cwd();
const readJson = (relativePath: string) => JSON.parse(
  fs.readFileSync(path.join(root, relativePath), 'utf8'),
);

test('declara os três produtos e os pacotes como workspaces', () => {
  const packageJson = readJson('package.json');

  expect(packageJson.private).toBe(true);
  expect(packageJson.workspaces).toEqual(['apps/*', 'packages/*']);
  expect(packageJson.scripts['start:web']).toContain('@cutsync/web');
  expect(packageJson.scripts['start:client']).toContain('@cutsync/client');
  expect(packageJson.scripts['start:business']).toContain('@cutsync/business');
});

test('mantém identidades mobile independentes', () => {
  const client = readJson('apps/client/app.json').expo;
  const business = readJson('apps/business/app.json').expo;

  expect(client.slug).toBe('cutsync-client');
  expect(client.scheme).toBe('cutsync');
  expect(client.ios.bundleIdentifier).toBe('com.cutsync.client');
  expect(client.android.package).toBe('com.cutsync.client');

  expect(business.slug).toBe('cutsync-business');
  expect(business.scheme).toBe('cutsync-business');
  expect(business.ios.bundleIdentifier).toBe('com.cutsync.business');
  expect(business.android.package).toBe('com.cutsync.business');
});

test('não replica rotas Web e de governança nos shells mobile', () => {
  for (const app of ['client', 'business']) {
    const routesRoot = path.join(root, 'apps', app, 'src', 'app');
    const routes = fs.readdirSync(routesRoot, { recursive: true })
      .map(String)
      .filter((entry) => entry.endsWith('.tsx'));

    expect(routes.some((route) => path.basename(route) === '_layout.tsx')).toBe(true);
    expect(routes.some((route) => path.basename(route) === 'index.tsx')).toBe(true);
    expect(routes.some((route) => route.includes('governance'))).toBe(false);
    expect(routes.some((route) => route.includes('superadmin'))).toBe(false);
  }
});

test('centraliza contratos compartilhados sem compartilhar telas', () => {
  const databasePackage = readJson('packages/database/package.json');
  const domainPackage = readJson('packages/domain/package.json');
  const validationPackage = readJson('packages/validation/package.json');

  expect(databasePackage.name).toBe('@cutsync/database');
  expect(domainPackage.name).toBe('@cutsync/domain');
  expect(validationPackage.name).toBe('@cutsync/validation');
  expect(fs.existsSync(path.join(root, 'packages/database/src/supabase.generated.ts'))).toBe(true);
  expect(fs.existsSync(path.join(root, 'packages/domain/src/date-time.ts'))).toBe(true);
  expect(fs.existsSync(path.join(root, 'packages/validation/src/password-policy.ts'))).toBe(true);
  expect(fs.existsSync(path.join(root, 'packages', 'screens'))).toBe(false);
  expect(fs.existsSync(path.join(root, 'packages', 'components'))).toBe(false);
});
