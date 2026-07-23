const environments = new Set(["local", "ci", "staging", "production"]);
const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

function value(env, name) {
  const candidate = env[name];
  return typeof candidate === "string" ? candidate.trim() : "";
}

function isPlaceholder(candidate) {
  const normalized = candidate.toLowerCase();
  return normalized.includes("replace") || normalized.includes("placeholder") || normalized.includes("example");
}

function hostedHttpsIssue(env, name) {
  const candidate = value(env, name);
  if (!candidate) return `${name}_missing`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:" || localHosts.has(parsed.hostname)) return `${name}_must_be_hosted_https`;
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return `${name}_must_be_origin_only`;
    return null;
  } catch {
    return `${name}_invalid`;
  }
}

function requiredSecretIssue(env, name, prefix, minimumLength = 24) {
  const candidate = value(env, name);
  if (!candidate) return `${name}_missing`;
  if (!candidate.startsWith(prefix) || candidate.length < minimumLength || isPlaceholder(candidate)) {
    return `${name}_invalid`;
  }
  return null;
}

export function getReleaseSha(env) {
  return value(env, "YAQEEN_RELEASE_SHA") || value(env, "VERCEL_GIT_COMMIT_SHA") || value(env, "GITHUB_SHA");
}

export function inspectReleaseEnvironment(env) {
  const requestedEnvironment = value(env, "YAQEEN_ENVIRONMENT") || "local";
  const issues = [];

  if (!environments.has(requestedEnvironment)) {
    return {
      environment: requestedEnvironment,
      releaseSha: getReleaseSha(env),
      issues: ["YAQEEN_ENVIRONMENT_invalid"],
    };
  }

  if (requestedEnvironment !== "staging" && requestedEnvironment !== "production") {
    return { environment: requestedEnvironment, releaseSha: getReleaseSha(env), issues };
  }

  for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SITE_URL"]) {
    const issue = hostedHttpsIssue(env, name);
    if (issue) issues.push(issue);
  }

  const publishableKey = value(env, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (!publishableKey || publishableKey.length < 20 || isPlaceholder(publishableKey)) {
    issues.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY_invalid");
  }

  const serviceRoleKey = value(env, "SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRoleKey || serviceRoleKey.length < 30 || isPlaceholder(serviceRoleKey) || serviceRoleKey === publishableKey) {
    issues.push("SUPABASE_SERVICE_ROLE_KEY_invalid");
  }

  if (value(env, "STRIPE_TEST_CHECKOUT_ENABLED") !== "true") {
    issues.push("STRIPE_TEST_CHECKOUT_ENABLED_must_be_true");
  }
  for (const [name, prefix] of [
    ["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_test_"],
    ["STRIPE_SECRET_KEY", "sk_test_"],
    ["STRIPE_WEBHOOK_SECRET", "whsec_"],
  ]) {
    const issue = requiredSecretIssue(env, name, prefix);
    if (issue) issues.push(issue);
  }

  const healthToken = value(env, "YAQEEN_HEALTHCHECK_TOKEN");
  if (!healthToken || healthToken.length < 32 || isPlaceholder(healthToken)) {
    issues.push("YAQEEN_HEALTHCHECK_TOKEN_invalid");
  }

  const releaseSha = getReleaseSha(env);
  if (!/^[a-f0-9]{40}$/i.test(releaseSha)) issues.push("YAQEEN_RELEASE_SHA_invalid");

  if (requestedEnvironment === "production") {
    issues.push("production_live_payments_locked");
  }

  return { environment: requestedEnvironment, releaseSha, issues };
}
