export interface JsmTicketInput {
  ticketId: string;
  protocol: string;
  subject: string;
  message: string;
  requestKind: string;
  product: string;
  category: string;
  requesterRole: string;
  teamCode: string;
  locationLabel: string | null;
  escalationLevel: number;
  routingVersion: number;
  impact: string;
  priority: string;
}

export interface JsmRequestReference {
  issueId: string;
  issueKey: string;
  issueUrl: string;
}

export interface JsmPublicComment {
  id: string;
  body: string;
  authorAccountId: string | null;
  authorDisplayName: string;
  createdAt: string;
}

export interface JsmIssueSnapshot {
  status: string;
  assigneeAccountId: string | null;
  assigneeDisplayName: string | null;
  updatedAt: string | null;
  firstResponseDueAt: string | null;
  firstRespondedAt: string | null;
  slaBreached: boolean | null;
}

export class JsmRequestError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly retryAfterSeconds: number | null = null,
  ) {
    super(code);
    this.name = "JsmRequestError";
  }
}

interface JsmConfig {
  baseUrl: string;
  requesterEmail: string;
  requesterApiToken: string;
  requesterAccountId: string;
  agentEmail: string;
  agentApiToken: string;
  serviceDeskId: string;
  requestTypeId: string;
  projectKey: string;
  fieldTicketId: string;
  customFields: Record<string, string>;
}

const requiredEnvironment = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new JsmRequestError("support_sync_not_configured", 500);
  return value;
};

const loadConfig = (): JsmConfig => ({
  baseUrl: requiredEnvironment("JSM_BASE_URL").replace(/\/+$/, ""),
  requesterEmail: requiredEnvironment("JSM_REQUESTER_EMAIL"),
  requesterApiToken: requiredEnvironment("JSM_REQUESTER_API_TOKEN"),
  requesterAccountId: requiredEnvironment("JSM_REQUESTER_ACCOUNT_ID"),
  agentEmail: requiredEnvironment("JSM_AGENT_EMAIL"),
  agentApiToken: requiredEnvironment("JSM_AGENT_API_TOKEN"),
  serviceDeskId: requiredEnvironment("JSM_SERVICE_DESK_ID"),
  requestTypeId: requiredEnvironment("JSM_REQUEST_TYPE_ID"),
  projectKey: requiredEnvironment("JSM_PROJECT_KEY"),
  fieldTicketId: requiredEnvironment("JSM_FIELD_CUTSYNC_TICKET_ID"),
  customFields: {
    product: requiredEnvironment("JSM_FIELD_PRODUCT"),
    category: requiredEnvironment("JSM_FIELD_AREA"),
    requesterRole: requiredEnvironment("JSM_FIELD_REQUESTER_ROLE"),
    teamCode: requiredEnvironment("JSM_FIELD_CUTSYNC_TEAM"),
    location: requiredEnvironment("JSM_FIELD_LOCATION"),
    escalation: requiredEnvironment("JSM_FIELD_ESCALATION_LEVEL"),
    routingVersion: requiredEnvironment("JSM_FIELD_ROUTING_VERSION"),
    impact: requiredEnvironment("JSM_FIELD_IMPACT"),
    priority: requiredEnvironment("JSM_FIELD_PRIORITY"),
  },
});

const asObject = (value: unknown): Record<string, unknown> => (
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const asString = (value: unknown) => (
  typeof value === "string" && value.trim() ? value.trim() : null
);

const parseRetryAfter = (response: Response) => {
  const value = Number(response.headers.get("Retry-After"));
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : null;
};

const mapExternalFailure = (response: Response) => {
  if (response.status === 429) {
    return new JsmRequestError(
      "support_external_rate_limited",
      response.status,
      parseRetryAfter(response),
    );
  }
  if (response.status >= 500) {
    return new JsmRequestError("support_external_unavailable", response.status);
  }
  return new JsmRequestError("support_external_rejected", response.status);
};

const mapStatus = (value: string | null) => {
  const normalized = (value ?? "").toLowerCase();
  if (/resolv|conclu|done/.test(normalized)) return "resolved";
  if (/closed|fechad/.test(normalized)) return "closed";
  if (
    /waiting.*customer|aguardando.*usu|customer pending|^pending$|^pendente$/.test(
      normalized,
    )
  ) {
    return "waiting_user";
  }
  if (/progress|andamento|investiga/.test(normalized)) return "in_progress";
  return "open";
};

const commentMarker = (messageId: string) => `CS-MSG-${messageId}`;

export const hasCutSyncCommentMarker = (body: string) => (
  /\bCS-MSG-[0-9a-f-]{36}\b/i.test(body)
);

export const stripCutSyncCommentMarkers = (body: string) => (
  body
    .replace(/(?:^|\n)\s*Referência:\s*CS-MSG-[0-9a-f-]{36}\s*(?=\n|$)/gi, "\n")
    .trim()
);

export class JsmClient {
  private readonly config = loadConfig();

  isCutSyncRequesterComment(comment: JsmPublicComment) {
    return comment.authorAccountId === this.config.requesterAccountId
      && hasCutSyncCommentMarker(comment.body);
  }

  private async requestJson(
    path: string,
    init: RequestInit = {},
    identity: "agent" | "requester" = "agent",
  ): Promise<Record<string, unknown>> {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    const email = identity === "requester"
      ? this.config.requesterEmail
      : this.config.agentEmail;
    const apiToken = identity === "requester"
      ? this.config.requesterApiToken
      : this.config.agentApiToken;
    headers.set("Authorization", `Basic ${btoa(`${email}:${apiToken}`)}`);
    if (init.body) headers.set("Content-Type", "application/json");

    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}${path}`, {
        ...init,
        headers,
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      throw new JsmRequestError("support_external_unavailable", 503);
    }

    if (!response.ok) throw mapExternalFailure(response);
    if (response.status === 204) return {};

    try {
      return asObject(await response.json());
    } catch {
      throw new JsmRequestError("support_external_rejected", 502);
    }
  }

  async findRequestByTicketId(ticketId: string): Promise<JsmRequestReference | null> {
    const numericFieldId = this.config.fieldTicketId.replace(/^customfield_/, "");
    if (!/^\d+$/.test(numericFieldId)) {
      throw new JsmRequestError("support_sync_not_configured", 500);
    }

    const jql = `project = "${this.config.projectKey.replace(/"/g, "")}" AND cf[${numericFieldId}] ~ "${ticketId}"`;
    const payload = await this.requestJson("/rest/api/3/search/jql", {
      method: "POST",
      body: JSON.stringify({
        jql,
        fields: ["key", "id"],
        maxResults: 2,
      }),
    });
    const issues = Array.isArray(payload.issues) ? payload.issues : [];
    const issue = asObject(issues[0]);
    const issueId = asString(issue.id);
    const issueKey = asString(issue.key);
    if (!issueId || !issueKey) return null;
    return {
      issueId,
      issueKey,
      issueUrl: `${this.config.baseUrl}/browse/${encodeURIComponent(issueKey)}`,
    };
  }

  async createRequest(input: JsmTicketInput): Promise<JsmRequestReference> {
    const requestFieldValues: Record<string, unknown> = {
      summary: input.subject,
      description: [
        input.message,
        "",
        `Protocolo CutSync: ${input.protocol}`,
        `Referência CutSync: ${input.ticketId}`,
      ].join("\n"),
      [this.config.fieldTicketId]: input.ticketId,
    };
    const values: Record<string, string | number | null> = {
      product: input.product,
      category: input.category,
      requesterRole: input.requesterRole,
      teamCode: input.teamCode,
      location: input.locationLabel,
      escalation: input.escalationLevel,
      routingVersion: input.routingVersion,
      impact: input.impact,
      priority: input.priority,
    };
    // JSM applies the hidden request-kind preset configured on the request type.
    // Sending a hidden field explicitly makes the customer request API reject it.
    for (const [name, fieldId] of Object.entries(this.config.customFields)) {
      if (values[name] !== null && values[name] !== undefined) {
        requestFieldValues[fieldId] = values[name];
      }
    }

    const payload = await this.requestJson("/rest/servicedeskapi/request", {
      method: "POST",
      body: JSON.stringify({
        serviceDeskId: this.config.serviceDeskId,
        requestTypeId: this.config.requestTypeId,
        requestFieldValues,
      }),
    }, "requester");
    const issueId = asString(payload.issueId);
    const issueKey = asString(payload.issueKey);
    if (!issueId || !issueKey) {
      throw new JsmRequestError("support_external_rejected", 502);
    }
    return {
      issueId,
      issueKey,
      issueUrl: `${this.config.baseUrl}/browse/${encodeURIComponent(issueKey)}`,
    };
  }

  async addPublicComment(
    issueKey: string,
    messageId: string,
    body: string,
  ): Promise<string> {
    const payload = await this.requestJson(
      `/rest/servicedeskapi/request/${encodeURIComponent(issueKey)}/comment`,
      {
        method: "POST",
        body: JSON.stringify({
          public: true,
          body: `${body}\n\nReferência: ${commentMarker(messageId)}`,
        }),
      },
      "requester",
    );
    const commentId = asString(payload.id);
    if (!commentId) throw new JsmRequestError("support_external_rejected", 502);
    return commentId;
  }

  async updateRoutingFields(
    issueKey: string,
    values: {
      escalationLevel?: number;
      teamCode?: string;
      priority?: string;
    },
  ): Promise<void> {
    const fields: Record<string, unknown> = {};
    const escalationField = this.config.customFields.escalation;
    const teamField = this.config.customFields.teamCode;
    const priorityField = this.config.customFields.priority;
    if (escalationField && typeof values.escalationLevel === "number") {
      fields[escalationField] = values.escalationLevel;
    }
    if (teamField && values.teamCode) {
      fields[teamField] = values.teamCode;
    }
    if (priorityField && values.priority) {
      fields[priorityField] = values.priority;
    }
    if (Object.keys(fields).length === 0) return;

    await this.requestJson(`/rest/api/3/issue/${encodeURIComponent(issueKey)}`, {
      method: "PUT",
      body: JSON.stringify({ fields }),
    });
  }

  async findPublicCommentByMessageId(
    issueKey: string,
    messageId: string,
  ): Promise<string | null> {
    const marker = commentMarker(messageId);
    const comments = await this.listPublicComments(issueKey);
    return comments.find((comment) => (
      comment.authorAccountId === this.config.requesterAccountId
      && comment.body.includes(marker)
    ))?.id ?? null;
  }

  async listPublicComments(issueKey: string): Promise<JsmPublicComment[]> {
    const comments: JsmPublicComment[] = [];
    let start = 0;
    for (let page = 0; page < 10; page += 1) {
      const payload = await this.requestJson(
        `/rest/servicedeskapi/request/${encodeURIComponent(issueKey)}`
        + `/comment?public=true&limit=100&start=${start}`,
      );
      const values = Array.isArray(payload.values) ? payload.values : [];
      comments.push(...values.flatMap((rawComment) => {
        const comment = asObject(rawComment);
        const author = asObject(comment.author);
        const created = asObject(comment.created);
        const id = asString(comment.id);
        const body = asString(comment.body);
        const createdAt = asString(created.iso8601)
          ?? asString(comment.created);
        if (!id || !body || !createdAt) return [];
        return [{
          id,
          body,
          authorAccountId: asString(author.accountId),
          authorDisplayName: asString(author.displayName) ?? "Equipe CutSync",
          createdAt,
        }];
      }));

      if (payload.isLastPage === true || values.length === 0) break;
      start += values.length;
    }
    return comments;
  }

  async getIssueSnapshot(issueKey: string): Promise<JsmIssueSnapshot> {
    const [issuePayload, slaPayloadValue] = await Promise.all([
      this.requestJson(
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=status,assignee,updated`,
      ),
      this.requestJson(
        `/rest/servicedeskapi/request/${encodeURIComponent(issueKey)}/sla`,
      ).catch((error) => {
        // Some request types do not expose an SLA resource. Missing SLA data is
        // acceptable, but authentication/authorization failures must surface so
        // the scheduled worker cannot report a false healthy reconciliation.
        if (error instanceof JsmRequestError && error.status === 404) return {};
        throw error;
      }),
    ]);
    const fields = asObject(issuePayload.fields);
    const status = asObject(fields.status);
    const assignee = asObject(fields.assignee);
    const slaPayload = asObject(slaPayloadValue);
    const slaValues = Array.isArray(slaPayload.values) ? slaPayload.values : [];
    const firstResponse = slaValues
      .map((value): Record<string, unknown> => asObject(value))
      .find((value: Record<string, unknown>) => /first response|primeira resposta/i.test(
        asString(value.name) ?? asString(value.slaDisplayName) ?? "",
      ));
    const ongoingCycle = asObject(firstResponse?.ongoingCycle);
    const completedCycles = Array.isArray(firstResponse?.completedCycles)
      ? firstResponse.completedCycles
      : [];
    const completedCycle = asObject(completedCycles[0]);
    const breachTime = asObject(ongoingCycle.breachTime);
    const stopTime = asObject(completedCycle.stopTime);

    return {
      status: mapStatus(asString(status.name)),
      assigneeAccountId: asString(assignee.accountId),
      assigneeDisplayName: asString(assignee.displayName),
      updatedAt: asString(fields.updated),
      firstResponseDueAt: asString(breachTime.iso8601),
      firstRespondedAt: asString(stopTime.iso8601),
      slaBreached: typeof ongoingCycle.breached === "boolean"
        ? ongoingCycle.breached
        : typeof completedCycle.breached === "boolean"
        ? completedCycle.breached
        : null,
    };
  }
}

export const getJsmRetryDelaySeconds = (error: unknown) => {
  if (error instanceof JsmRequestError && error.retryAfterSeconds) {
    return Math.min(Math.max(error.retryAfterSeconds, 60), 21_600);
  }
  return null;
};

export const getJsmSafeErrorCode = (error: unknown) => (
  error instanceof JsmRequestError
    ? error.code
    : "support_external_unavailable"
);
