const requiredNames = [
  'JSM_BASE_URL',
  'JSM_REQUESTER_EMAIL',
  'JSM_REQUESTER_API_TOKEN',
  'JSM_REQUESTER_ACCOUNT_ID',
  'JSM_AGENT_EMAIL',
  'JSM_AGENT_API_TOKEN',
  'JSM_PROJECT_KEY',
  'JSM_SERVICE_DESK_ID',
  'JSM_REQUEST_TYPE_ID',
  'JSM_FIELD_CUTSYNC_TICKET_ID',
  'JSM_FIELD_PRODUCT',
  'JSM_FIELD_REQUEST_KIND',
  'JSM_FIELD_AREA',
  'JSM_FIELD_REQUESTER_ROLE',
  'JSM_FIELD_CUTSYNC_TEAM',
  'JSM_FIELD_LOCATION',
  'JSM_FIELD_ESCALATION_LEVEL',
  'JSM_FIELD_ROUTING_VERSION',
  'JSM_FIELD_IMPACT',
  'JSM_FIELD_PRIORITY',
  'SUPPORT_JOB_SECRET',
  'SUPPORT_JSM_WEBHOOK_SECRET',
];

const missing = requiredNames.filter((name) => !process.env[name]?.trim());
if (missing.length > 0) {
  process.stderr.write(`Configuração ausente: ${missing.join(', ')}\n`);
  process.exitCode = 1;
} else {
  const baseUrl = process.env.JSM_BASE_URL.trim().replace(/\/+$/, '');
  const serviceDeskId = process.env.JSM_SERVICE_DESK_ID.trim();
  const requestTypeId = process.env.JSM_REQUEST_TYPE_ID.trim();
  const authorization = Buffer.from(
    `${process.env.JSM_AGENT_EMAIL.trim()}:${process.env.JSM_AGENT_API_TOKEN.trim()}`,
    'utf8',
  ).toString('base64');
  const requesterAuthorization = Buffer.from(
    `${process.env.JSM_REQUESTER_EMAIL.trim()}:${process.env.JSM_REQUESTER_API_TOKEN.trim()}`,
    'utf8',
  ).toString('base64');

  if (
    process.env.JSM_REQUESTER_EMAIL.trim().toLowerCase()
    === process.env.JSM_AGENT_EMAIL.trim().toLowerCase()
  ) {
    process.stderr.write(
      'JSM_REQUESTER_EMAIL e JSM_AGENT_EMAIL devem identificar contas diferentes.\n',
    );
    process.exit(1);
  }

  const jobSecret = process.env.SUPPORT_JOB_SECRET.trim();
  const webhookSecret = process.env.SUPPORT_JSM_WEBHOOK_SECRET.trim();
  if (
    jobSecret.length < 32
    || webhookSecret.length < 32
    || jobSecret === webhookSecret
  ) {
    process.stderr.write(
      'Os segredos do cron e da automação JSM devem ser diferentes e ter ao menos 32 caracteres.\n',
    );
    process.exit(1);
  }

  const requestJson = async (pathname, encodedCredentials = authorization) => {
    const response = await fetch(`${baseUrl}${pathname}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Basic ${encodedCredentials}`,
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      throw new Error(`JSM respondeu HTTP ${response.status} em ${pathname}.`);
    }
    return response.json();
  };

  try {
    const [requestType, fields, requesterTypes, requesterIdentity] = await Promise.all([
      requestJson(
        `/rest/servicedeskapi/servicedesk/${encodeURIComponent(serviceDeskId)}`
        + `/requesttype/${encodeURIComponent(requestTypeId)}/field`,
      ),
      requestJson('/rest/api/3/field'),
      requestJson(
        `/rest/servicedeskapi/servicedesk/${encodeURIComponent(serviceDeskId)}`
        + '/requesttype?limit=100',
        requesterAuthorization,
      ),
      requestJson('/rest/api/3/myself', requesterAuthorization),
    ]);
    const jiraFields = new Set(
      Array.isArray(fields)
        ? fields.map((field) => field?.id).filter((id) => typeof id === 'string')
        : [],
    );
    const requestFields = new Set(
      Array.isArray(requestType?.requestTypeFields)
        ? requestType.requestTypeFields
          .map((field) => field?.fieldId)
          .filter((id) => typeof id === 'string')
        : [],
    );
    const requesterCanUseType = Array.isArray(requesterTypes?.values)
      && requesterTypes.values.some((requestTypeEntry) => (
        String(requestTypeEntry?.id ?? '') === requestTypeId
      ));
    const requesterAccountMatches = String(requesterIdentity?.accountId ?? '')
      === process.env.JSM_REQUESTER_ACCOUNT_ID.trim();
    const configuredFieldNames = [
      'JSM_FIELD_CUTSYNC_TICKET_ID',
      'JSM_FIELD_PRODUCT',
      'JSM_FIELD_AREA',
      'JSM_FIELD_REQUESTER_ROLE',
      'JSM_FIELD_CUTSYNC_TEAM',
      'JSM_FIELD_LOCATION',
      'JSM_FIELD_ESCALATION_LEVEL',
      'JSM_FIELD_ROUTING_VERSION',
      'JSM_FIELD_IMPACT',
      'JSM_FIELD_PRIORITY',
    ];
    const invalidFields = configuredFieldNames.filter((name) => {
      const id = process.env[name].trim();
      return !jiraFields.has(id) || !requestFields.has(id);
    });

    if (!requesterAccountMatches) {
      process.stderr.write(
        'JSM_REQUESTER_ACCOUNT_ID não corresponde à conta requester autenticada.\n',
      );
      process.exitCode = 1;
    } else if (!requesterCanUseType) {
      process.stderr.write(
        'A conta requester não consegue acessar o service desk/request type configurado.\n',
      );
      process.exitCode = 1;
    } else if (invalidFields.length > 0) {
      process.stderr.write(
        `Campos inexistentes ou fora do request type: ${invalidFields.join(', ')}\n`,
      );
      process.exitCode = 1;
    } else {
      process.stdout.write(
        `Configuração JSM validada: ${configuredFieldNames.length} campos CutSync disponíveis.\n`,
      );
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Falha ao validar o JSM.'}\n`);
    process.exitCode = 1;
  }
}
