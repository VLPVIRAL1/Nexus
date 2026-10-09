import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const accessibleRoutes = [
  { name: "login", path: "/login" },
  { name: "account recovery", path: "/auth/recovery" },
  { name: "dashboard", path: "/dashboard" },
  { name: "client list", path: "/clients" },
  { name: "return workspace", path: "/clients/sample/years/2025" },
  { name: "persisted intake", path: "/clients/30000000-0000-4000-8000-000000000001/years/2025/intake" },
  { name: "intake blockers", path: "/clients/sample/years/2025/intake" },
  { name: "mapping split", path: "/clients/sample/years/2025/mapping" },
  { name: "review blockers", path: "/clients/sample/years/2025/review" },
  { name: "stale calculation", path: "/clients/sample/years/2025/calculation/summary" },
  { name: "import staging", path: "/imports/new" },
  { name: "stale outputs", path: "/workpapers" },
  { name: "sample outputs", path: "/clients/sample/years/2025/outputs" },
  { name: "source entry", path: "/clients/30000000-0000-4000-8000-000000000001/years/2025/source-entry" },
  { name: "administration access", path: "/administration" },
];

for (const route of accessibleRoutes) {
  test(`${route.name} has no automated WCAG A/AA violations`, async ({ page }) => {
    await page.goto(route.path);
    await expect(page.locator("main")).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations, formatViolations(results.violations)).toEqual([]);
  });
}

test("keyboard users can skip repeated navigation and see focus", async ({ page }) => {
  await page.goto("/dashboard");
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await expect(page.locator("#main-content")).toHaveCSS("outline-style", "solid");
});

test("authorized client search keeps the query out of the URL and supports the keyboard shortcut", async ({ page }) => {
  await page.goto("/dashboard");
  await page.keyboard.press("Control+k");
  const search = page.getByRole("combobox", { name: "Search assigned clients and returns" });
  await expect(search).toBeFocused();
  await search.fill("000123");
  await expect(page.getByRole("option", { name: /John Sample/ })).toBeVisible();
  expect(page.url()).not.toContain("000123");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox", { name: "Client search results" })).toBeHidden();
});

test("registered repeatable fields are keyboard-operable", async ({ page }) => {
  await page.goto("/clients/30000000-0000-4000-8000-000000000001/years/2025/source-entry");
  await expect(page.locator(".registry-add-row").first()).toBeVisible();
  await page.waitForTimeout(500);
  const addRow = page.getByRole("button", { name: "Add row" }).first();
  await addRow.focus();
  await expect(addRow).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /Remove .* row/ }).first()).toBeVisible();
});

test("expected-document intake can link clean uploaded evidence", async ({ page }) => {
  await page.goto("/clients/30000000-0000-4000-8000-000000000001/years/2025/intake");
  await expect(page.getByRole("heading", { name: "Expected documents" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Upload source" })).toHaveAttribute("href", "/clients/30000000-0000-4000-8000-000000000001/years/2025/sources");
  await page.getByRole("combobox", { name: "Registry item", exact: true }).selectOption("w2");
  await expect(page.getByRole("textbox", { name: "Checklist key", exact: true })).toHaveValue("w2");
  await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("received");
  await expect(page.getByLabel("Clean uploaded source")).toBeVisible();
  await expect(page.getByRole("option", { name: /\.pdf · / }).first()).toBeAttached();
});

for (const route of [
  { name: "dashboard", path: "/dashboard?fixture=visual" },
  { name: "clients", path: "/clients?fixture=visual" },
  { name: "return-workspace", path: "/clients/sample/years/2025" },
  { name: "intake-blockers", path: "/clients/sample/years/2025/intake" },
  { name: "mapping-split", path: "/clients/sample/years/2025/mapping" },
  { name: "review-blockers", path: "/clients/sample/years/2025/review" },
  { name: "calculation-stale", path: "/clients/sample/years/2025/calculation/summary" },
  { name: "import-staging", path: "/imports/new" },
  { name: "outputs-stale", path: "/workpapers" },
]) {
  test(`${route.name} visual baseline`, async ({ page }) => {
    await stabilize(page, route.path);
    await expect(page).toHaveScreenshot(`${route.name}.png`, { fullPage: true });
  });
}

async function stabilize(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("main")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

function formatViolations(violations: Array<{ id: string; impact?: string | null; nodes: Array<{ target: unknown }> }>) {
  return violations.map((violation) => `${violation.id} (${violation.impact ?? "unknown"}): ${violation.nodes.map((node) => String(node.target)).join(", ")}`).join("\n");
}
