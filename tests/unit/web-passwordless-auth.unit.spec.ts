/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = process.cwd();
const readSource = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('consome o callback do login sem senha no navegador', () => {
  const supabaseClient = readSource('apps/web/src/services/supabase.ts');
  const login = readSource('apps/web/src/components/screens/LoginExperience.tsx');

  expect(supabaseClient).toContain("detectSessionInUrl: Platform.OS === 'web'");
  expect(supabaseClient).toContain('persistSession: true');
  expect(login).toContain('supabase.auth.signInWithOtp');
  expect(login).toContain('emailRedirectTo: redirectUrl');
  expect(login).toContain("const callbackUrl = new URL('/login', window.location.origin)");
});
