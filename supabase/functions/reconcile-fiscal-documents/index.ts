import {
  getRequiredEnv,
  json,
  requireJobSecret,
  sanitizeErrorCode,
} from "../_shared/billing.ts";

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    requireJobSecret(request);
    const response = await fetch(
      `${getRequiredEnv("SUPABASE_URL")}/functions/v1/process-fiscal-jobs`,
      {
        method: "POST",
        headers: {
          "x-cutsync-job-secret": getRequiredEnv("BILLING_JOB_SECRET"),
          Authorization: `Bearer ${getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
      },
    );
    const body = await response.json();
    return json({ reconciled: response.ok, result: body }, response.status);
  } catch (error) {
    const code = sanitizeErrorCode(error);
    return json({ error: code }, code === "unauthorized" ? 401 : 500);
  }
});
