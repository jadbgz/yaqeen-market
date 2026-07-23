import { expect, test } from "@playwright/test";

const stagingSmoke = process.env.YAQEEN_STAGING_SMOKE === "true";
const healthToken = process.env.STAGING_HEALTH_TOKEN ?? "";
const expectedReleaseSha = process.env.EXPECTED_RELEASE_SHA ?? "";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "";

test.describe("@staging release gate", () => {
  test.skip(!stagingSmoke, "Only runs against the protected staging environment.");

  test("the deployed release and its external dependencies are ready", async ({ request }) => {
    expect(healthToken.length).toBeGreaterThanOrEqual(32);
    expect(expectedReleaseSha).toMatch(/^[a-f0-9]{40}$/i);

    const response = await request.get("/api/health/ready", {
      headers: { Authorization: `Bearer ${healthToken}` },
    });
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");

    const payload = await response.json();
    expect(payload).toEqual({
      status: "ready",
      environment: "staging",
      release: { sha: expectedReleaseSha },
      checks: {
        configuration: { state: "up", durationMs: expect.any(Number) },
        database: { state: "up", durationMs: expect.any(Number) },
        stripe: { state: "up", durationMs: expect.any(Number) },
      },
    });
  });

  test("checkout reaches the authentication boundary without exposing a payment error", async ({ request }) => {
    const origin = new URL(baseURL).origin;
    const response = await request.post("/api/checkout/session", {
      headers: { Origin: origin },
      data: {
        checkoutToken: "00000000-0000-4000-8000-000000000001",
        addressId: "00000000-0000-4000-8000-000000000002",
        items: [{ variantId: "00000000-0000-4000-8000-000000000003", quantity: 1 }],
      },
    });

    expect(response.status()).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "authentication_required" });
  });
});
