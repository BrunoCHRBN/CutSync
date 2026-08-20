import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * PS1-E1C — Frontend Legacy Authorization Guard
 * Prevents regressions where modern frontend code attempts to use legacy
 * profiles.role, profiles.establishment_id, or memberships.role for authorization,
 * routing, or feature gates.
 */

const REPO_ROOT = path.resolve(__dirname, '../..');
const SCAN_DIRS = [
  path.join(REPO_ROOT, 'apps/web/src'),
  path.join(REPO_ROOT, 'apps/business/src'),
  path.join(REPO_ROOT, 'apps/client/src'),
  path.join(REPO_ROOT, 'apps/control/src'),
  path.join(REPO_ROOT, 'packages/database/src'),
];

// Documented exceptions allowed for type definitions, legacy adapters, and governance profiles
const ALLOWLIST: { filePattern: RegExp; allowedLinePatterns: RegExp[] }[] = [
  {
    // AuthContext holds the legacy Profile type definition and fetchProfile mapping
    filePattern: /apps[\\/]web[\\/]src[\\/]contexts[\\/]AuthContext\.tsx$/,
    allowedLinePatterns: [
      /role:\s*'client'\s*\|\s*'professional'\s*\|\s*'admin'/,
      /const role:\s*Profile\['role'\]\s*=\s*data\.role/,
      /const nextProfile\s*=\s*\{\s*\.\.\.data,\s*role\s*\}/,
    ],
  },
  {
    // Governance components operate on platform governance roles (SaaS_Viewer, SaaS_Editor, SaaS_Owner), NOT public.profiles.role
    filePattern: /apps[\\/]web[\\/]src[\\/]components[\\/]governance[\\/]/,
    allowedLinePatterns: [
      /profile\?\.role\s*===\s*'SaaS_/,
      /profile\?\.role\s*!==\s*'SaaS_/,
      /profile\?\.role\s*\?\?\s*'SaaS_/,
      /profile\.role/,
    ],
  },
  {
    // Supabase generated types
    filePattern: /supabase\.generated\.ts$/,
    allowedLinePatterns: [/.*/],
  },
];

function getAllTsFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results.push(...getAllTsFiles(filePath));
    } else if (/\.(ts|tsx)$/.test(file) && !/\.d\.ts$/.test(file)) {
      results.push(filePath);
    }
  }
  return results;
}

test.describe('PS1-E1C — Legacy Authorization Guard', () => {
  test('no modern frontend code uses profile.role or membership.role for authorization', () => {
    const violations: { file: string; line: number; text: string; reason: string }[] = [];

    const FORBIDDEN_PATTERNS = [
      {
        regex: /(?:profile|userProfile)\??\.role\s*(?:===|!==|==|!=)\s*['"`](?:admin|professional|client)['"`]/,
        reason: 'Using profile.role for authorization/branching is prohibited. Use business capabilities, activeContext, or authorized contexts.',
      },
      {
        regex: /membership\??\.role\s*(?:===|!==|==|!=)\s*['"`](?:admin|professional)['"`]/,
        reason: 'Using membership.role for authorization is prohibited. Use membership.role_template or capabilities.',
      },
    ];

    for (const scanDir of SCAN_DIRS) {
      const files = getAllTsFiles(scanDir);
      for (const filePath of files) {
        const relativePath = path.relative(REPO_ROOT, filePath);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const lines = fileContent.split('\n');

        lines.forEach((lineText, index) => {
          for (const pattern of FORBIDDEN_PATTERNS) {
            if (pattern.regex.test(lineText)) {
              // Check if covered by allowlist
              const isAllowed = ALLOWLIST.some((rule) => {
                if (rule.filePattern.test(relativePath)) {
                  return rule.allowedLinePatterns.some((lp) => lp.test(lineText));
                }
                return false;
              });

              if (!isAllowed) {
                violations.push({
                  file: relativePath,
                  line: index + 1,
                  text: lineText.trim(),
                  reason: pattern.reason,
                });
              }
            }
          }
        });
      }
    }

    if (violations.length > 0) {
      console.error('Found prohibited legacy authorization patterns:', violations);
    }
    expect(violations).toHaveLength(0);
  });

  test('no modern frontend code routes or decides authority on profiles.establishment_id', () => {
    const violations: { file: string; line: number; text: string }[] = [];

    for (const scanDir of SCAN_DIRS) {
      const files = getAllTsFiles(scanDir);
      for (const filePath of files) {
        const relativePath = path.relative(REPO_ROOT, filePath);
        if (/AuthContext\.tsx$/.test(relativePath) || /supabase\.generated\.ts$/.test(relativePath)) {
          continue;
        }

        const fileContent = fs.readFileSync(filePath, 'utf8');
        const lines = fileContent.split('\n');

        lines.forEach((lineText, index) => {
          // Flag assignments or routing checks based on profile.establishment_id
          if (/(?:router\.push|navigate)\(.*profile\??\.establishment_id/.test(lineText) ||
              /hasPermission\(.*profile\??\.establishment_id/.test(lineText)) {
            violations.push({
              file: relativePath,
              line: index + 1,
              text: lineText.trim(),
            });
          }
        });
      }
    }

    expect(violations).toHaveLength(0);
  });
});
