import { test, expect } from "@playwright/test";

test("audits the fixture repo and renders the tier-first report", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toHaveText(/blacklight/i);
  await expect(page.locator(".trust")).toContainText("never store your code");

  await page.fill('input[type="url"]', "https://github.com/demo/fixture");
  await page.click('button[type="submit"]');

  // Report renders (the worker served the baked fixture, real audit ran).
  const report = page.locator(".report");
  await expect(report).toBeVisible({ timeout: 30_000 });

  // Tier-first: quick wins lead, with a real fix diff and a copy button.
  await expect(page.getByRole("heading", { name: /Quick wins/ })).toBeVisible();
  await expect(page.locator(".diff")).toContainText("contents: read");
  await expect(page.locator(".copy").first()).toBeVisible();

  // Category headline + rule links.
  await expect(page.locator(".headline")).toContainText("security");
  await expect(page.locator("a.rule").first()).toHaveAttribute("href", /audit-rules/);

  // Category filter is interactive.
  await page.getByRole("button", { name: /^security/ }).click();
  await expect(report).toBeVisible();
});

test("shows a clean error for a non-allowlisted host", async ({ page }) => {
  await page.goto("/");
  await page.fill('input[type="url"]', "https://evil.example.com/o/r");
  await page.click('button[type="submit"]');
  await expect(page.locator(".error")).toContainText(/Host not allowed/, { timeout: 30_000 });
});
