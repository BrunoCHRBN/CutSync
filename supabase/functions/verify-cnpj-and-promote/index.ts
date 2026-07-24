import "@supabase/functions-js/edge-runtime.d.ts";

// Compatibility tombstone. Business documents must only enter through
// submit-business-registration, which requires an authenticated AAL2 session,
// calculates a keyed fingerprint and encrypts the document before persistence.
Deno.serve(() =>
  Response.json(
    { error: "registration_endpoint_replaced" },
    {
      status: 410,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json",
      },
    },
  )
);
