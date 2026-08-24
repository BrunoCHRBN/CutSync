/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(
    root,
    'supabase/migrations/20260824190722_control_access_idempotency_and_event_hardening.sql',
  ),
  'utf8',
).replace(/\r\n?/g, '\n');

const readFunction = (functionName: string) => {
  const marker = `CREATE OR REPLACE FUNCTION public.${functionName}(`;
  const start = migration.indexOf(marker);
  expect(start, functionName).toBeGreaterThanOrEqual(0);

  const nextFunction = migration.indexOf('\nCREATE OR REPLACE FUNCTION public.', start + marker.length);
  const firstAlter = migration.indexOf('\nALTER FUNCTION public.', start + marker.length);
  const candidates = [nextFunction, firstAlter].filter((position) => position >= 0);
  const end = candidates.length > 0 ? Math.min(...candidates) : migration.length;

  return migration.slice(start, end);
};

const expectSerializedBeforeWrite = (
  body: string,
  lockNamespace: string,
  firstLookup: string,
  expiryError: string,
  firstInsert: string,
) => {
  const lock = body.indexOf(lockNamespace);
  const lookup = body.indexOf(firstLookup);
  const replayReturn = body.indexOf('RETURN jsonb_build_object(', lookup);
  const temporalValidation = body.indexOf('IF target_valid_until IS NOT NULL', replayReturn);
  const temporalError = body.indexOf(`RAISE EXCEPTION '${expiryError}'`, temporalValidation);
  const insert = body.indexOf(firstInsert);

  expect(lock, `${lockNamespace} advisory lock`).toBeGreaterThanOrEqual(0);
  expect(lookup, `${lockNamespace} first lookup`).toBeGreaterThan(lock);
  expect(replayReturn, `${lockNamespace} replay return`).toBeGreaterThan(lookup);
  expect(temporalValidation, `${lockNamespace} temporal validation`).toBeGreaterThan(replayReturn);
  expect(temporalError, `${lockNamespace} temporal error`).toBeGreaterThan(temporalValidation);
  expect(insert, `${lockNamespace} first insert`).toBeGreaterThan(temporalError);
};

test('requires the complete normalized Control request fingerprint on replay', () => {
  const body = readFunction('create_control_access_request');

  for (const fragment of [
    'existing_request.requested_by IS DISTINCT FROM actor_id',
    'existing_request.target_profile_id IS DISTINCT FROM requested_target_id',
    'existing_request.requested_action IS DISTINCT FROM target_action',
    'existing_requested_profile_key IS DISTINCT FROM normalized_profile_key',
    'existing_source_profile_key IS DISTINCT FROM normalized_source_profile_key',
    'existing_request.requested_valid_until IS DISTINCT FROM target_valid_until',
    'existing_request.justification IS DISTINCT FROM normalized_justification',
    'existing_request.ticket_reference IS DISTINCT FROM normalized_ticket_reference',
  ]) {
    expect(body).toContain(fragment);
  }

  expect(body).toContain("RAISE EXCEPTION 'idempotency_conflict'");
});

test('rejects null actions in both creation RPCs', () => {
  const controlBody = readFunction('create_control_access_request');
  const corporateBody = readFunction('create_corporate_access_case');

  expect(controlBody).toContain(
    "target_action IS NULL OR target_action NOT IN ('grant', 'revoke')",
  );
  expect(controlBody).toContain(
    'existing_request.requested_action IS DISTINCT FROM target_action',
  );
  expect(corporateBody).toContain(
    "target_action IS NULL OR target_action NOT IN ('grant', 'revoke')",
  );
  expect(corporateBody).toContain(
    'existing_case.requested_action IS DISTINCT FROM target_action',
  );
});

test('serializes both creation keys before lookup and insert to contain unique races', () => {
  expectSerializedBeforeWrite(
    readFunction('create_control_access_request'),
    'cutsync:create_control_access_request:',
    'WHERE request.client_request_id = target_client_request_id',
    'access_expiry_invalid',
    'INSERT INTO public.control_access_requests(',
  );
  expectSerializedBeforeWrite(
    readFunction('create_corporate_access_case'),
    'cutsync:create_corporate_access_case:',
    'WHERE corporate_case.client_request_id = target_client_request_id',
    'corporate_access_expiry_invalid',
    'INSERT INTO public.corporate_cases(',
  );

  expect(migration.match(/pg_catalog\.pg_advisory_xact_lock\(/g)).toHaveLength(3);
});

test('persists the complete decision fingerprint and rejects malformed versions', () => {
  const body = readFunction('decide_control_access_request');
  const lock = body.indexOf('cutsync:decide_control_access_request:');
  const lookup = body.indexOf('WHERE approval.client_request_id = target_client_request_id');

  expect(lock).toBeGreaterThanOrEqual(0);
  expect(lookup).toBeGreaterThan(lock);
  expect(body).toContain('normalized_reason text := btrim');
  expect(body).toContain('existing_decision.reason IS DISTINCT FROM normalized_reason');
  expect(body).toContain('existing_decision.decision IS DISTINCT FROM target_decision');
  expect(body).toContain(
    'existing_decision.expected_request_version IS DISTINCT FROM target_expected_version',
  );
  expect(body).toMatch(
    /approver_was_owner,\s*client_request_id, expected_request_version/,
  );
  expect(body).toMatch(
    /actor_is_owner,\s*target_client_request_id, target_expected_version/,
  );
  expect(body).toContain('target_expected_version IS NULL');
  expect(body).toContain('target_expected_version <= 0');
  expect(body).toContain('target_decision IS NULL');
  expect(body).toContain('request_row.version IS DISTINCT FROM target_expected_version');
  expect(body).toContain("RAISE EXCEPTION 'idempotency_conflict'");
});

test('backfills and constrains the persisted expected request version', () => {
  expect(migration).toContain(
    'ADD COLUMN IF NOT EXISTS expected_request_version integer',
  );
  for (const exactAuditFragment of [
    "audit_log.target_type = 'control_access_request'",
    'audit_log.target_id = approval_row.request_id',
    'audit_log.actor_id = approval_row.approver_id',
    "audit_log.action = 'control.access.approval_' || approval_row.decision",
    "audit_log.changes->'version'",
  ]) {
    expect(migration).toContain(exactAuditFragment);
  }
  expect(migration).toContain('matching_audit_count > 1');
  expect(migration).toContain('matching_audit_count = 1 AND valid_audit_count <> 1');
  expect(migration).toContain('request_group.missing_count > 1');
  expect(migration).toContain('remaining_ordinal_count <> 1');
  expect(migration).not.toContain('row_number() OVER');
  expect(migration).toContain('ALTER COLUMN expected_request_version SET NOT NULL');
  expect(migration).toContain(
    'CONSTRAINT control_access_request_approvals_expected_version_check',
  );
  expect(migration).toContain('CHECK (expected_request_version > 0)');
  expect(migration).toContain(
    'CONSTRAINT control_access_request_approvals_request_expected_version_key',
  );
  expect(migration).toContain('UNIQUE (request_id, expected_request_version)');
});

test('removes direct service-role ledger access and blocks statement-level truncation', () => {
  expect(migration).toContain('ALTER TABLE public.corporate_case_events OWNER TO postgres');
  expect(migration).toContain('CREATE TRIGGER corporate_case_events_truncate_immutable');
  expect(migration).toContain('BEFORE TRUNCATE ON public.corporate_case_events');
  expect(migration).toContain('FOR EACH STATEMENT');
  expect(migration).toContain('EXECUTE FUNCTION public.corporate_case_events_are_immutable()');
  expect(migration).toContain(
    'REVOKE ALL PRIVILEGES ON TABLE public.corporate_case_events\n'
      + 'FROM PUBLIC, anon, authenticated, service_role;',
  );
  expect(migration).not.toContain(
    'GRANT ALL ON TABLE public.corporate_case_events TO service_role',
  );
});

test('keeps replaced SECURITY DEFINER RPCs behind explicit execute ACLs', () => {
  for (const signature of [
    'public.create_control_access_request(\n  uuid, text, text, text, timestamptz, text, text, uuid\n)',
    'public.decide_control_access_request(\n  uuid, integer, text, text, uuid\n)',
    'public.create_corporate_access_case(\n  uuid, text, text, text, timestamptz, text, uuid[], uuid\n)',
  ]) {
    expect(migration).toContain(`ALTER FUNCTION ${signature} OWNER TO postgres;`);
    expect(migration).toContain(
      `REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC, anon, authenticated, service_role;`,
    );
    expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO authenticated, service_role;`);
  }
});
