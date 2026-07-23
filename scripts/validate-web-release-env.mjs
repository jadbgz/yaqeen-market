import { inspectReleaseEnvironment } from "../src/lib/release/environment-core.mjs";

const release = inspectReleaseEnvironment(process.env);

if (release.environment !== "staging") {
  console.error(`\nYAQEEN WEB RELEASE GATE\nExpected YAQEEN_ENVIRONMENT=staging, received ${release.environment}.\n`);
  process.exit(1);
}

if (release.issues.length > 0) {
  console.error(`\nYAQEEN WEB RELEASE GATE\n${release.issues.join("\n")}\n`);
  process.exit(1);
}

console.log(`Web release environment is valid for staging at ${release.releaseSha.slice(0, 12)}.`);
