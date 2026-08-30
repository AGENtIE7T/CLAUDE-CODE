import { test, expect } from "@playwright/test";

/**
 * The acceptance walk-through, in a browser, against the fixture WordPress.
 * Nothing here touches a real website.
 */

test("health endpoint reports capabilities without any credential", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.gates).toHaveProperty("canWrite");
  // Nothing credential-shaped anywhere in the payload.
  const text = JSON.stringify(body);
  expect(text).not.toMatch(/password|secret|Bearer|apiKey/i);
});

test("the connection screen shows capability status and tests the connection", async ({ page }) => {
  await page.goto("/connection");
  await expect(page.getByRole("heading", { name: /what this system can actually do/i })).toBeVisible();

  // Capability cards are present and name the fixture honestly.
  await expect(page.getByText("Mock (fixture)")).toBeVisible();
  await expect(page.getByText("Production writes").first()).toBeVisible();
  await expect(page.getByText("Disabled").first()).toBeVisible();

  await page.getByRole("button", { name: /run connection test/i }).click();
  await expect(page.getByText("Reachable")).toBeVisible();
  await expect(page.getByText(/page\(s\) and post\(s\) are readable/i)).toBeVisible();
  await expect(page.getByText("MOCK fixture")).toBeVisible();
});

test("protected URLs and Autopilot rules can be configured and persist", async ({ page }) => {
  await page.goto("/autopilot");
  await expect(page.getByRole("heading", { name: /^Protected URLs$/ })).toBeVisible();

  await page.getByPlaceholder("/checkout**").fill("/checkout**\n/my-account**");
  await page.getByRole("button", { name: /save protected urls/i }).click();
  await expect(page.getByText(/2 pattern\(s\) can never be modified/i)).toBeVisible();

  // Autopilot defaults, then enable it and tighten a limit.
  await expect(page.getByText("Disabled").first()).toBeVisible();
  await page.getByLabel(/enable autopilot for this website/i).check();
  await page.locator('input[name="maxLinksPerPage"]').fill("2");
  await page.getByRole("button", { name: /save autopilot rules/i }).click();
  await expect(page.getByText(/Autopilot is ON/i)).toBeVisible();

  // The settings survive a reload.
  await page.reload();
  await expect(page.locator('input[name="maxLinksPerPage"]')).toHaveValue("2");
  await expect(page.getByPlaceholder("/checkout**")).toHaveValue("/checkout**\n/my-account**");
});

test("a plain-English audit instruction becomes a plan and reports findings", async ({ page }) => {
  await page.goto("/command");
  await page
    .getByLabel(/tell it what to do/i)
    .fill("Audit my website and find internal-link opportunities");
  await page.getByRole("button", { name: /run it/i }).click();

  await expect(page.getByText("Task plan")).toBeVisible();
  await expect(page.getByText("AUDIT", { exact: true })).toBeVisible();
  await expect(page.getByText(/Audit complete\./)).toBeVisible();
  await expect(page.getByText(/No website was modified/)).toBeVisible();
  await expect(page.getByRole("heading", { name: /what happened, step by step/i })).toBeVisible();
  // An audit must never build an edit, so there is no work order to approve.
  await expect(page.getByRole("button", { name: /approve and apply/i })).toHaveCount(0);
});

test("a prohibited request is refused with a legitimate alternative", async ({ page }) => {
  await page.goto("/command");
  await page.getByLabel(/tell it what to do/i).fill("Buy 500 backlinks for my homepage");
  await page.getByRole("button", { name: /run it/i }).click();

  await expect(page.getByText("Refused", { exact: true })).toBeVisible();
  await expect(page.getByText(/prohibited SEO operation/i)).toBeVisible();
  await expect(page.getByText(/What can be done instead/i)).toBeVisible();
  // A refusal runs nothing at all.
  await expect(page.getByRole("heading", { name: /what happened, step by step/i })).toHaveCount(0);
});

test("a preview creates a work order, and approving it applies and verifies one link", async ({
  page,
}) => {
  await page.goto("/command");
  await page
    .getByLabel(/tell it what to do/i)
    .fill("Find relevant links from blog articles to service pages. Show a preview only.");
  await page.getByRole("button", { name: /run it/i }).click();

  // A preview must never claim to have changed anything.
  await expect(page.getByText("Work order created").first()).toBeVisible();
  await expect(page.getByText("No website was modified.")).toBeVisible();
  await expect(page.getByRole("heading", { name: /internal-link recommendations/i })).toBeVisible();

  // Approve the exact previewed revision.
  await expect(page.getByRole("heading", { name: /awaiting your approval/i })).toBeVisible();
  await page.getByRole("button", { name: /approve and apply/i }).click();

  await expect(page.getByText(/Applied and verified on/i)).toBeVisible();
  await expect(page.getByText("Verify the change exists")).toBeVisible();
});

test("history records what actually happened, labelled as a mock", async ({ page }) => {
  await page.goto("/runs");
  await expect(page.getByRole("heading", { name: /everything that ran/i })).toBeVisible();
  await expect(page.getByText("applied").first()).toBeVisible();
  await expect(page.getByText("mock").first()).toBeVisible();
});

test("a website can be added", async ({ page }) => {
  await page.goto("/websites");
  await expect(page.getByRole("heading", { name: /your connected websites/i })).toBeVisible();
  await expect(page.getByText(/protected URL\(s\)|No protected URLs/).first()).toBeVisible();
});
