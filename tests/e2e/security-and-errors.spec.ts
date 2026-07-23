import { expect, test } from "@playwright/test";

test("public responses keep the security header contract", async ({ page }) => {
  const response = await page.goto("/");
  expect(response).not.toBeNull();

  const headers = response!.headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["strict-transport-security"]).toContain("max-age=63072000");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-powered-by"]).toBeUndefined();
});

test("unknown routes render the branded 404", async ({ page }) => {
  const response = await page.goto("/page-that-must-not-exist");

  expect(response?.status()).toBe(404);
  await expect(page.getByText("ERREUR 404")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Cette page");
  await expect(page.getByRole("link", { name: "Explorer le catalogue" })).toBeVisible();
});

test("robots excludes private and transactional surfaces", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.ok()).toBeTruthy();

  const robots = await response.text();
  expect(robots).toContain("Disallow: /api/");
  expect(robots).toContain("Disallow: /checkout");
  expect(robots).toContain("Disallow: /compte");
  expect(robots).toContain("Disallow: /operations/");
  expect(robots).toContain("Disallow: /seller");
  expect(robots).toContain("Sitemap:");
});

test("health endpoints separate public liveness from protected readiness", async ({ request }) => {
  const live = await request.get("/api/health/live");
  expect(live.status()).toBe(200);
  expect(live.headers()["cache-control"]).toContain("no-store");
  await expect(live.json()).resolves.toEqual({ status: "ok" });

  const ready = await request.get("/api/health/ready");
  expect(ready.status()).toBe(404);
  expect(ready.headers()["cache-control"]).toContain("no-store");
  await expect(ready.json()).resolves.toEqual({ error: "not_found" });
});
