type EnvironmentReader = (name: string) => string | undefined;

const KEY_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

const readDenoEnvironment: EnvironmentReader = (name) => Deno.env.get(name);

const parseKeySet = (
  raw: string,
  keyName: string,
  expectedPrefix: "sb_publishable_" | "sb_secret_",
  errorLabel: "publishable" | "secret",
) => {
  if (!KEY_NAME_PATTERN.test(keyName)) {
    throw new Error(`invalid_supabase_${errorLabel}_key_name`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`invalid_supabase_${errorLabel}_keys`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`invalid_supabase_${errorLabel}_keys`);
  }

  const value = (parsed as Record<string, unknown>)[keyName];
  if (
    typeof value !== "string"
    || value !== value.trim()
    || !value.startsWith(expectedPrefix)
  ) {
    throw new Error(`missing_supabase_${errorLabel}_key`);
  }

  return value;
};

const getSupabaseKey = ({
  keyName,
  keySetEnvironment,
  localEnvironment,
  expectedPrefix,
  errorLabel,
  readEnvironment,
}: {
  keyName: string;
  keySetEnvironment: "SUPABASE_PUBLISHABLE_KEYS" | "SUPABASE_SECRET_KEYS";
  localEnvironment: "SUPABASE_PUBLISHABLE_KEY" | "SUPABASE_SECRET_KEY";
  expectedPrefix: "sb_publishable_" | "sb_secret_";
  errorLabel: "publishable" | "secret";
  readEnvironment: EnvironmentReader;
}) => {
  const keySet = readEnvironment(keySetEnvironment)?.trim();
  if (keySet) {
    return parseKeySet(keySet, keyName, expectedPrefix, errorLabel);
  }

  const localKey = readEnvironment(localEnvironment)?.trim();
  if (!localKey || !localKey.startsWith(expectedPrefix)) {
    throw new Error(`missing_supabase_${errorLabel}_key`);
  }
  return localKey;
};

export const getSupabasePublishableKey = (
  keyName = "default",
  readEnvironment: EnvironmentReader = readDenoEnvironment,
) => getSupabaseKey({
  keyName,
  keySetEnvironment: "SUPABASE_PUBLISHABLE_KEYS",
  localEnvironment: "SUPABASE_PUBLISHABLE_KEY",
  expectedPrefix: "sb_publishable_",
  errorLabel: "publishable",
  readEnvironment,
});

export const getSupabaseSecretKey = (
  keyName = "default",
  readEnvironment: EnvironmentReader = readDenoEnvironment,
) => getSupabaseKey({
  keyName,
  keySetEnvironment: "SUPABASE_SECRET_KEYS",
  localEnvironment: "SUPABASE_SECRET_KEY",
  expectedPrefix: "sb_secret_",
  errorLabel: "secret",
  readEnvironment,
});
