/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  CORPORATE_CASE_PARTICIPANT_ROLES,
  CORPORATE_CASE_STATUSES,
  CORPORATE_CASE_TASK_TYPES,
  CORPORATE_NOTIFICATION_CHANNELS,
  isCorporateCaseStatus,
} from '@cutsync/domain';

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260824014000_corporate_cases_foundation.sql'),
  'utf8',
).replace(/\r\n/g, '\n');
const controlTypes = fs.readFileSync(
  path.join(root, 'apps/control/src/types/control.ts'),
  'utf8',
).replace(/\r\n/g, '\n');

const privateTables = [
  'corporate_case_runtime_settings',
  'corporate_business_calendars',
  'corporate_business_calendar_holidays',
  'corporate_work_groups',
  'corporate_work_group_members',
  'corporate_case_types',
  'corporate_case_routing_policies',
  'corporate_case_routing_stages',
  'corporate_cases',
  'corporate_case_participants',
  'corporate_case_messages',
  'corporate_case_events',
  'corporate_case_tasks',
  'corporate_case_approval_slots',
  'corporate_case_sla_instances',
  'corporate_notification_preferences',
  'corporate_notification_templates',
  'corporate_notifications',
  'corporate_notification_outbox',
  'corporate_notification_deliveries',
];

test('keeps the corporate cases runtime disabled on initial deployment', () => {
  expect(migration).toContain('enabled boolean NOT NULL DEFAULT false');
  expect(migration).toContain('creation_enabled boolean NOT NULL DEFAULT false');
  expect(migration).toContain('automation_enabled boolean NOT NULL DEFAULT false');
  expect(migration).toContain('email_enabled boolean NOT NULL DEFAULT false');
  expect(migration).toContain('legacy_redirects_enabled boolean NOT NULL DEFAULT false');
  expect(migration).toContain('corporate_case_runtime_settings_dependency');
});
test('keeps every corporate cases table private and RLS-protected', () => {
  for (const table of privateTables) {
    expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
  }

  expect(migration).toContain('FROM PUBLIC, anon, authenticated;');
  expect(migration).toContain('TO service_role;');
  expect(migration).not.toContain('GRANT SELECT ON TABLE');
  expect(migration).not.toContain('GRANT INSERT ON TABLE');
  expect(migration).not.toContain('CREATE POLICY');
});

test('models participants, approvals, expiry, immutable events and a durable outbox', () => {
  expect(migration).toContain('CREATE TABLE public.corporate_case_participants');
  expect(migration).toContain("'observer'");
  expect(migration).toContain('CREATE TABLE public.corporate_case_approval_slots');
  expect(migration).toContain('expires_at timestamptz NOT NULL');
  expect(migration).toContain('CREATE TRIGGER corporate_case_events_immutable');
  expect(migration).toContain("RAISE EXCEPTION 'corporate_case_events_are_immutable'");
  expect(migration).toContain('CREATE TABLE public.corporate_notification_outbox');
  expect(migration).toContain('corporate_notification_outbox_pending_idx');
});

test('seeds access routing without enabling execution or assigning real people', () => {
  expect(migration).toContain("'access_release'");
  expect(migration).toContain("'access_intake'");
  expect(migration).toContain("'access_review'");
  expect(migration).toContain("'access_approvers'");
  expect(migration).toContain("'access_fulfillment'");
  expect(migration).not.toContain('INSERT INTO public.corporate_work_group_members');
  expect(migration).not.toContain('support_tickets');
});

test('keeps database and application authorization contracts aligned', () => {
  const permissions = [
    'control.cases.request',
    'control.cases.read',
    'control.cases.triage',
    'control.cases.route',
    'control.cases.manage',
    'control.cases.audit',
  ];

  for (const permission of permissions) {
    expect(migration).toContain(`'${permission}'`);
    expect(controlTypes).toContain(`'${permission}'`);
  }
});

test('exports stable corporate cases domain values', () => {
  expect(CORPORATE_CASE_STATUSES).toContain('awaiting_approval');
  expect(CORPORATE_CASE_STATUSES).toContain('expired');
  expect(CORPORATE_CASE_PARTICIPANT_ROLES).toContain('observer');
  expect(CORPORATE_CASE_TASK_TYPES).toEqual([
    'triage',
    'review',
    'approval',
    'fulfillment',
  ]);
  expect(CORPORATE_NOTIFICATION_CHANNELS).toEqual(['in_app', 'email', 'push']);
  expect(isCorporateCaseStatus('resolved')).toBe(true);
  expect(isCorporateCaseStatus('unknown')).toBe(false);
});
