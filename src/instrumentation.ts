export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { inspectReleaseEnvironment } = await import("@/lib/release/environment");
  const release = inspectReleaseEnvironment(process.env);
  const strictEnvironment = release.environment === "staging" || release.environment === "production";

  if (strictEnvironment && release.issues.length > 0) {
    console.error(JSON.stringify({
      event: "release_environment_rejected",
      environment: release.environment,
      issueCodes: release.issues,
    }));
    throw new Error("release_environment_invalid");
  }

  if (process.env.NODE_ENV === "production" && release.environment === "local") {
    console.warn(JSON.stringify({
      event: "release_environment_unclassified",
      message: "Set YAQEEN_ENVIRONMENT before serving remote traffic.",
    }));
  }
}
