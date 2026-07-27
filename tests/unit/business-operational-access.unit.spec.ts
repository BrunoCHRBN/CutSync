/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = process.cwd();
const migration = fs
  .readFileSync(
    path.join(
      root,
      'supabase/migrations/20260801000000_business_operational_access.sql',
    ),
    'utf8',
  )
  .replace(/\r\n/g, '\n');
const sqlTest = fs
  .readFileSync(
    path.join(root, 'supabase/tests/business_operational_access.sql'),
    'utf8',
  )
  .replace(/\r\n/g, '\n');

const functionBody = (name: string, nextMarker: string) => {
  const start = migration.indexOf(`FUNCTION public.${name}`);
  const end = migration.indexOf(nextMarker, start);

  expect(start, `${name} must exist`).toBeGreaterThan(-1);
  expect(end, `${name} must have a stable boundary`).toBeGreaterThan(start);
  return migration.slice(start, end);
};

test('resolves owner only from authoritative local and group identities', () => {
  const resolver = functionBody(
    'resolve_business_operational_identity',
    'CREATE OR REPLACE FUNCTION public.resolve_business_operational_capabilities',
  );

  expect(resolver).toContain("membership.status = 'active'");
  expect(resolver).toContain("membership.role = 'professional'");
  expect(resolver).toContain("organization.status = 'active'");
  expect(resolver).toContain("organization_member.role = 'owner'");
  expect(resolver).toContain("organization_member.status = 'active'");
  expect(resolver).toContain('organization.organization_id IS NULL');
  expect(resolver).toContain(
    "billing_account.owner_resolution_status = 'confirmed'",
  );
  expect(resolver).not.toContain("organization_member.role = 'manager'");
  expect(resolver).not.toContain("organization_member.role = 'finance'");
});

test('keeps capabilities role-aware and fail-closed by billing mode', () => {
  const capabilityResolver = functionBody(
    'resolve_business_operational_capabilities',
    '-- Safe, current-actor predicates',
  );

  expect(capabilityResolver).toContain("target_access_mode NOT IN ('full', 'read_only')");
  expect(capabilityResolver).toContain("'view_own_agenda'");
  expect(capabilityResolver).toContain("'view_team_agenda'");
  expect(capabilityResolver).toContain("'create_self_walk_in'");
  expect(capabilityResolver).toContain("'create_team_walk_in'");
  expect(capabilityResolver).toContain("'manage_own_blocks'");
  expect(capabilityResolver).toContain("'manage_team_blocks'");
  expect(capabilityResolver).toContain("'manage_services'");
  expect(capabilityResolver).toContain("'manage_team'");
  expect(capabilityResolver).toContain("'manage_admins'");
  expect(capabilityResolver).toContain("'view_own_commission'");
  expect(capabilityResolver).toContain("'view_unit_reports'");
  expect(capabilityResolver).toContain("'manage_operational_settings'");
  expect(capabilityResolver).toContain('establishment.share_agendas');
  expect(capabilityResolver).toContain(
    "IF target_access_mode = 'read_only' THEN",
  );
});

test('exposes the Business context and minimized timezone-aware agenda contracts', () => {
  const context = functionBody(
    'get_my_business_operational_contexts',
    'CREATE OR REPLACE FUNCTION public.get_business_agenda_day',
  );
  const agenda = functionBody(
    'get_business_agenda_day',
    '-- Services: operational members can consult',
  );

  expect(context).toContain("COALESCE(billing.access_mode, 'blocked')");
  expect(context).toContain("COALESCE(billing.billing_status, 'unconfigured')");
  expect(context).toContain(
    'COALESCE(billing.covered_establishment_ids, ARRAY[]::uuid[])',
  );
  expect(agenda).toContain("target_scope NOT IN ('own', 'team')");
  expect(agenda).toContain("RAISE EXCEPTION 'business_access_blocked'");
  expect(agenda).toContain(
    'target_local_date::timestamp AT TIME ZONE target_timezone',
  );
  expect(agenda).toContain(
    "(target_local_date + 1)::timestamp AT TIME ZONE target_timezone",
  );
  expect(agenda).toContain('client_display_name text');
  expect(agenda).not.toContain('phone');
  expect(agenda).not.toContain('cancellation_note_internal');
  expect(agenda).not.toContain('cancellation_reason');
});

test('hardens base RLS and SECURITY DEFINER appointment writes', () => {
  expect(migration).toContain(
    'DROP POLICY IF EXISTS "Members manage establishment services"',
  );
  expect(migration).toContain(
    'CREATE POLICY "Business admins update services"',
  );
  expect(migration).toContain(
    'DROP POLICY IF EXISTS "Members manage establishment appointments"',
  );
  expect(migration).toContain(
    'CREATE POLICY "Business staff read appointments"',
  );
  expect(migration).toContain(
    'CREATE OR REPLACE FUNCTION public.enforce_business_appointment_scope',
  );
  expect(migration).toContain(
    'CREATE TRIGGER enforce_business_appointment_scope',
  );
  expect(migration).toContain(
    "target_professional_id = (SELECT auth.uid())",
  );
  expect(migration).toContain(
    "public.has_business_capability(establishment_id, 'view_team_agenda')",
  );
  expect(migration).toContain(
    'DROP POLICY IF EXISTS "Operational members read schedule blocks"',
  );
  expect(migration).toContain(
    'CREATE OR REPLACE FUNCTION public.get_establishment_client_contacts',
  );
  expect(migration).toContain(
    'CREATE OR REPLACE FUNCTION public.get_appointment_participant_names',
  );
  expect(migration).toContain(
    'get_admin_report_before_business_access',
  );
  expect(migration).toContain(
    'FROM PUBLIC, anon, authenticated;',
  );
});

test('enforces invitation hierarchy without selecting a legacy active unit', () => {
  const invitationGuard = functionBody(
    'can_manage_business_invitation',
    'CREATE OR REPLACE FUNCTION public.can_operate_business_appointment',
  );
  const legacyAcceptance = functionBody(
    'accept_invitation(invitation_token text)',
    'CREATE OR REPLACE FUNCTION public.accept_invitation_v2',
  );
  const v2Acceptance = functionBody(
    'accept_invitation_v2(invitation_token text)',
    'DROP POLICY IF EXISTS "Business administrators read invitations"',
  );

  expect(invitationGuard).toContain("WHEN target_role = 'admin'");
  expect(invitationGuard).toContain("'manage_admins'");
  expect(invitationGuard).toContain("WHEN target_role = 'professional'");
  expect(invitationGuard).toContain("'manage_team'");
  expect(legacyAcceptance).toContain('INSERT INTO public.memberships');
  expect(legacyAcceptance).toContain(
    'INSERT INTO public.profile_establishments',
  );
  expect(legacyAcceptance).not.toContain('UPDATE public.profiles');
  expect(legacyAcceptance).not.toContain('SET establishment_id');
  expect(v2Acceptance).not.toContain('UPDATE public.profiles');
  expect(v2Acceptance).not.toContain('SET establishment_id');
});

test('revokes anonymous access, reloads PostgREST and covers role flows in SQL', () => {
  expect(migration).toContain(
    'REVOKE ALL ON FUNCTION public.get_my_business_operational_contexts()',
  );
  expect(migration).toContain(
    'REVOKE ALL ON FUNCTION public.get_business_agenda_day(uuid, date, text)',
  );
  expect(migration).toContain('FROM PUBLIC, anon;');
  expect(migration).toContain(
    'TO authenticated, service_role;',
  );
  expect(migration).toContain("NOTIFY pgrst, 'reload schema'");

  expect(sqlTest).toContain('group owner context was not resolved correctly');
  expect(sqlTest).toContain('active organization link did not disable legacy owner');
  expect(sqlTest).toContain('read-only owner context was not fail-closed');
  expect(sqlTest).toContain('blocked context was not returned fail-closed');
  expect(sqlTest).toContain('professional changed a team appointment');
  expect(sqlTest).toContain(
    'unit admin unexpectedly invited an administrator',
  );
  expect(sqlTest).toContain(
    'invitation acceptance changed active establishment',
  );
  expect(sqlTest).toContain('invitation accepted by a different e-mail');
  expect(sqlTest).toContain('expired invitation was accepted');
  expect(sqlTest).toContain('professional changed a service directly');
  expect(sqlTest).toContain('professional changed a team appointment directly');
  expect(sqlTest).toContain('blocked owner read reports');
  expect(sqlTest.trimEnd().endsWith('ROLLBACK;')).toBe(true);
});
