const projectRef = process.env.SUPABASE_PROJECT_ID?.trim() ?? '';
const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim() ?? '';

if (!/^[a-z0-9]{20}$/.test(projectRef)) {
  throw new Error('SUPABASE_PROJECT_ID deve conter um project ref válido de 20 caracteres.');
}
if (!accessToken) {
  throw new Error('SUPABASE_ACCESS_TOKEN é obrigatório para consultar o catálogo de Homolog.');
}

// This is deliberately one SELECT against the Management API read-only
// endpoint. It observes both migration history and materialized catalogs: the
// latter catches security hardening that does not change generated API types.
const catalogQuery = String.raw`
SELECT
  pg_catalog.jsonb_build_object(
    'runtime_hardening_22000', EXISTS (
      SELECT 1
      FROM supabase_migrations.schema_migrations AS migration
      WHERE migration.version = '20260824022000'
    ),
    'idempotency_hardening_190722', EXISTS (
      SELECT 1
      FROM supabase_migrations.schema_migrations AS migration
      WHERE migration.version = '20260824190722'
    )
  ) AS ledger,
  (
    SELECT pg_catalog.jsonb_build_object(
      'exists', true,
      'not_null', attribute.attnotnull,
      'type', pg_catalog.format_type(attribute.atttypid, attribute.atttypmod),
      'positive_check', EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS constraint_row
        WHERE constraint_row.conrelid = relation.oid
          AND constraint_row.contype = 'c'
          AND pg_catalog.pg_get_constraintdef(constraint_row.oid)
            LIKE '%expected_request_version > 0%'
      ),
      'unique_per_request', EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS constraint_row
        WHERE constraint_row.conrelid = relation.oid
          AND constraint_row.contype = 'u'
          AND pg_catalog.pg_get_constraintdef(constraint_row.oid)
            LIKE 'UNIQUE (request_id, expected_request_version)%'
      )
    )
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = relation.oid
     AND attribute.attname = 'expected_request_version'
     AND NOT attribute.attisdropped
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'control_access_request_approvals'
  ) AS expected_request_version,
  (
    SELECT pg_catalog.jsonb_object_agg(
      expected.function_key,
      CASE
        WHEN procedure_row.oid IS NULL THEN NULL
        ELSE pg_catalog.jsonb_build_object(
          'owner', pg_catalog.pg_get_userbyid(procedure_row.proowner),
          'security_definer', procedure_row.prosecdef,
          'settings', pg_catalog.to_jsonb(procedure_row.proconfig),
          'definition', pg_catalog.pg_get_functiondef(procedure_row.oid),
          'execute_acl_roles', (
            SELECT coalesce(
              jsonb_agg(coalesce(role_row.rolname, 'PUBLIC') ORDER BY coalesce(role_row.rolname, 'PUBLIC')),
              '[]'::jsonb
            )
            FROM pg_catalog.aclexplode(
              coalesce(
                procedure_row.proacl,
                pg_catalog.acldefault('f', procedure_row.proowner)
              )
            ) AS privilege_row
            LEFT JOIN pg_catalog.pg_roles AS role_row
              ON role_row.oid = privilege_row.grantee
            WHERE privilege_row.privilege_type = 'EXECUTE'
          )
        )
      END
    )
    FROM (VALUES
      (
        'get_corporate_case_runtime_administration_context',
        'public.get_corporate_case_runtime_administration_context(integer)'
      ),
      (
        'set_corporate_case_runtime_settings',
        'public.set_corporate_case_runtime_settings(boolean,boolean,boolean,boolean,boolean,boolean,integer,text,uuid)'
      ),
      (
        'enforce_corporate_case_runtime_write_boundary',
        'public.enforce_corporate_case_runtime_write_boundary()'
      ),
      (
        'create_control_access_request',
        'public.create_control_access_request(uuid,text,text,text,timestamptz,text,text,uuid)'
      ),
      (
        'decide_control_access_request',
        'public.decide_control_access_request(uuid,integer,text,text,uuid)'
      ),
      (
        'create_corporate_access_case',
        'public.create_corporate_access_case(uuid,text,text,text,timestamptz,text,uuid[],uuid)'
      ),
      (
        'corporate_case_events_are_immutable',
        'public.corporate_case_events_are_immutable()'
      )
    ) AS expected(function_key, signature)
    LEFT JOIN pg_catalog.pg_proc AS procedure_row
      ON procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
  ) AS functions,
  (
    SELECT pg_catalog.jsonb_object_agg(
      relation.relname,
      pg_catalog.jsonb_build_object(
        'owner', pg_catalog.pg_get_userbyid(relation.relowner),
        'rls_enabled', relation.relrowsecurity,
        'acl_roles', (
          SELECT coalesce(
            jsonb_agg(DISTINCT coalesce(role_row.rolname, 'PUBLIC')),
            '[]'::jsonb
          )
          FROM pg_catalog.aclexplode(
            coalesce(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
          ) AS privilege_row
          LEFT JOIN pg_catalog.pg_roles AS role_row
            ON role_row.oid = privilege_row.grantee
        )
      )
    )
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname IN (
        'corporate_case_runtime_settings',
        'corporate_case_runtime_changes',
        'corporate_case_events'
      )
  ) AS tables,
  (
    SELECT pg_catalog.jsonb_object_agg(
      trigger_row.tgname,
      pg_catalog.jsonb_build_object(
        'enabled', trigger_row.tgenabled,
        'definition', pg_catalog.pg_get_triggerdef(trigger_row.oid, true)
      )
    )
    FROM pg_catalog.pg_trigger AS trigger_row
    JOIN pg_catalog.pg_class AS relation
      ON relation.oid = trigger_row.tgrelid
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname IN (
        'corporate_case_runtime_settings',
        'corporate_case_runtime_changes',
        'corporate_case_events'
      )
      AND NOT trigger_row.tgisinternal
  ) AS triggers
`;

function assertSelectOnly(query) {
  const withoutComments = query
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ')
    .trim();
  const withoutStrings = withoutComments.replace(/'(?:''|[^'])*'/g, "''");
  const statements = withoutStrings.split(';').map((value) => value.trim()).filter(Boolean);
  const mutations = /\b(?:alter|call|copy|create|delete|do|drop|grant|insert|merge|refresh|reindex|revoke|truncate|update|vacuum)\b/i;

  if (statements.length !== 1 || !/^select\b/i.test(statements[0]) || mutations.test(statements[0])) {
    throw new Error('A consulta do monitor deve conter exclusivamente um SELECT sem mutações.');
  }
}

function parseRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.data)) return payload.data;
  throw new Error('A Management API retornou um formato de linhas inesperado.');
}

function parseJsonValue(value, field) {
  if (value && typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error(`O campo ${field} não contém JSON válido.`);
    }
  }
  return value;
}

function normalizedDefinition(contract) {
  return String(contract?.definition ?? '').toLowerCase().replace(/\s+/g, ' ');
}

const failures = [];
const verify = (condition, message) => {
  if (!condition) failures.push(message);
};

function verifyFunction(functions, key, { definer, searchPath, allow }) {
  const contract = functions[key];
  verify(Boolean(contract), `${key}: função ausente`);
  if (!contract) return '';

  const settings = Array.isArray(contract.settings) ? contract.settings : [];
  const acl = Array.isArray(contract.execute_acl_roles) ? contract.execute_acl_roles : [];
  verify(contract.owner === 'postgres', `${key}: owner deve ser postgres`);
  verify(contract.security_definer === definer, `${key}: SECURITY DEFINER divergente`);
  verify(settings.includes(`search_path=${searchPath}`), `${key}: search_path divergente`);
  for (const role of allow) {
    verify(acl.includes(role), `${key}: EXECUTE ausente para ${role}`);
  }
  for (const role of ['PUBLIC', 'anon', 'authenticated', 'service_role']) {
    if (!allow.includes(role)) {
      verify(!acl.includes(role), `${key}: EXECUTE indevido para ${role}`);
    }
  }
  return normalizedDefinition(contract);
}

function verifyMarkers(definition, key, markers) {
  for (const marker of markers) {
    verify(definition.includes(marker.toLowerCase()), `${key}: corpo sem ${marker}`);
  }
}

function verifyOrder(definition, key, first, second) {
  const firstIndex = definition.indexOf(first.toLowerCase());
  const secondIndex = definition.indexOf(second.toLowerCase());
  verify(
    firstIndex >= 0 && secondIndex > firstIndex,
    `${key}: ordem inválida entre ${first} e ${second}`,
  );
}

assertSelectOnly(catalogQuery);

const endpoint = `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/database/query/read-only`;
const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: catalogQuery }),
  signal: AbortSignal.timeout(30_000),
});

if (!response.ok) {
  const detail = (await response.text()).replace(/\s+/g, ' ').slice(0, 500);
  throw new Error(`Falha ao consultar o catálogo read-only de Homolog (${response.status}): ${detail}`);
}

const rows = parseRows(await response.json());
if (rows.length !== 1) {
  throw new Error(`A consulta do catálogo retornou ${rows.length} linhas; esperado: 1.`);
}

const ledger = parseJsonValue(rows[0].ledger, 'ledger') ?? {};
const column = parseJsonValue(rows[0].expected_request_version, 'expected_request_version');
const functions = parseJsonValue(rows[0].functions, 'functions') ?? {};
const tables = parseJsonValue(rows[0].tables, 'tables') ?? {};
const triggers = parseJsonValue(rows[0].triggers, 'triggers') ?? {};

verify(ledger.runtime_hardening_22000 === true, 'ledger: migration 20260824022000 ausente');
verify(ledger.idempotency_hardening_190722 === true, 'ledger: migration 20260824190722 ausente');
verify(column?.exists === true, 'control_access_request_approvals.expected_request_version ausente');
verify(column?.not_null === true, 'expected_request_version deve ser NOT NULL');
verify(column?.type === 'integer', 'expected_request_version deve ser integer');
verify(column?.positive_check === true, 'expected_request_version deve possuir CHECK positivo');
verify(
  column?.unique_per_request === true,
  'expected_request_version deve ser único por solicitação',
);

const runtimeGet = verifyFunction(functions, 'get_corporate_case_runtime_administration_context', {
  definer: true,
  searchPath: 'pg_catalog',
  allow: ['authenticated'],
});
verifyMarkers(runtimeGet, 'get_corporate_case_runtime_administration_context', [
  'actor_context := public.get_control_context()',
  "actor_context->>'role' <> 'saas_owner'",
]);

const runtimeSet = verifyFunction(functions, 'set_corporate_case_runtime_settings', {
  definer: true,
  searchPath: 'pg_catalog',
  allow: ['authenticated'],
});
verifyMarkers(runtimeSet, 'set_corporate_case_runtime_settings', [
  'for update',
  'existing_change.actor_profile_id is distinct from actor_id',
  'existing_change.expected_version is distinct from target_expected_version',
  'existing_change.reason is distinct from normalized_reason',
  'existing_change.new_settings is distinct from requested_payload',
]);

const runtimeBoundary = verifyFunction(functions, 'enforce_corporate_case_runtime_write_boundary', {
  definer: false,
  searchPath: 'pg_catalog',
  allow: [],
});
verifyMarkers(runtimeBoundary, 'enforce_corporate_case_runtime_write_boundary', [
  "if tg_op = 'truncate'",
  'current_user <> trusted_writer',
  'cutsync.corporate_case_runtime_expected_version',
]);

const createControl = verifyFunction(functions, 'create_control_access_request', {
  definer: true,
  searchPath: 'pg_catalog, public',
  allow: ['authenticated', 'service_role'],
});
verifyMarkers(createControl, 'create_control_access_request', [
  'pg_catalog.pg_advisory_xact_lock',
  'cutsync:create_control_access_request:',
  "target_action is null or target_action not in ('grant', 'revoke')",
  'existing_request.requested_by is distinct from actor_id',
  'existing_request.target_profile_id is distinct from requested_target_id',
  'existing_request.requested_action is distinct from target_action',
  'existing_requested_profile_key is distinct from normalized_profile_key',
  'existing_source_profile_key is distinct from normalized_source_profile_key',
  'existing_request.requested_valid_until is distinct from target_valid_until',
  'existing_request.justification is distinct from normalized_justification',
  'existing_request.ticket_reference is distinct from normalized_ticket_reference',
]);
verifyOrder(
  createControl,
  'create_control_access_request',
  'pg_catalog.pg_advisory_xact_lock',
  'where request.client_request_id = target_client_request_id',
);

const decideControl = verifyFunction(functions, 'decide_control_access_request', {
  definer: true,
  searchPath: 'pg_catalog, public',
  allow: ['authenticated', 'service_role'],
});
verifyMarkers(decideControl, 'decide_control_access_request', [
  'pg_catalog.pg_advisory_xact_lock',
  'cutsync:decide_control_access_request:',
  'target_expected_version is null',
  'target_decision is null',
  'existing_decision.expected_request_version is distinct from target_expected_version',
  'existing_decision.reason is distinct from normalized_reason',
  'request_row.version is distinct from target_expected_version',
  'client_request_id, expected_request_version',
]);
verifyOrder(
  decideControl,
  'decide_control_access_request',
  'pg_catalog.pg_advisory_xact_lock',
  'where request.id = target_request_id',
);

const createCorporate = verifyFunction(functions, 'create_corporate_access_case', {
  definer: true,
  searchPath: 'pg_catalog, public',
  allow: ['authenticated', 'service_role'],
});
verifyMarkers(createCorporate, 'create_corporate_access_case', [
  'pg_catalog.pg_advisory_xact_lock',
  'cutsync:create_corporate_access_case:',
  "target_action is null or target_action not in ('grant', 'revoke')",
  'existing_case.requester_profile_id <> actor_id',
  'existing_case.beneficiary_profile_id <> target_beneficiary_profile_id',
  'existing_case.requested_action is distinct from target_action',
  'existing_case.requested_profile_key <> normalized_profile_key',
  'existing_case.source_profile_key is distinct from normalized_source_profile_key',
  'existing_case.requested_valid_until is distinct from target_valid_until',
  'existing_case.summary <> normalized_justification',
  'existing_case.observer_profile_ids is distinct from normalized_observer_ids',
]);
verifyOrder(
  createCorporate,
  'create_corporate_access_case',
  'pg_catalog.pg_advisory_xact_lock',
  'where corporate_case.client_request_id = target_client_request_id',
);

verifyFunction(functions, 'corporate_case_events_are_immutable', {
  definer: false,
  searchPath: 'pg_catalog, public',
  allow: [],
});

for (const tableName of [
  'corporate_case_runtime_settings',
  'corporate_case_runtime_changes',
  'corporate_case_events',
]) {
  const table = tables[tableName];
  const acl = Array.isArray(table?.acl_roles) ? table.acl_roles : [];
  verify(Boolean(table), `${tableName}: tabela ausente`);
  verify(table?.owner === 'postgres', `${tableName}: owner deve ser postgres`);
  verify(table?.rls_enabled === true, `${tableName}: RLS deve estar habilitado`);
  for (const role of ['PUBLIC', 'anon', 'authenticated', 'service_role']) {
    verify(!acl.includes(role), `${tableName}: ACL direta indevida para ${role}`);
  }
}

for (const triggerName of [
  'corporate_case_runtime_settings_write_boundary',
  'corporate_case_runtime_settings_truncate_boundary',
  'corporate_case_runtime_changes_insert_boundary',
  'corporate_case_runtime_changes_truncate_boundary',
  'corporate_case_events_immutable',
  'corporate_case_events_truncate_immutable',
]) {
  verify(Boolean(triggers[triggerName]), `${triggerName}: trigger ausente`);
  verify(triggers[triggerName]?.enabled !== 'D', `${triggerName}: trigger desabilitado`);
}

const truncateDefinition = String(
  triggers.corporate_case_events_truncate_immutable?.definition ?? '',
).toUpperCase();
verify(truncateDefinition.includes('BEFORE TRUNCATE'), 'corporate_case_events: proteção BEFORE TRUNCATE ausente');
verify(
  truncateDefinition.includes('EXECUTE FUNCTION CORPORATE_CASE_EVENTS_ARE_IMMUTABLE()'),
  'corporate_case_events: trigger TRUNCATE aponta para função inesperada',
);

if (failures.length > 0) {
  console.error('Drift materializado detectado no catálogo de Homolog:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Catálogo read-only de Homolog corresponde aos hardenings 22000 e 190722.');
}
