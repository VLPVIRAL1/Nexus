import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const accessibleRoutes = [
  { name: "login", path: "/login" },
  { name: "account recovery", path: "/auth/recovery" },
  { name: "dashboard", path: "/dashboard" },
  { name: "client list", path: "/clients" },
  { name: "return workspace", path: "/clients/sample/years/2025" },
  { name: "persisted return hub", path: "/clients/30000000-0000-4000-8000-000000000001/years/2025" },
  { name: "persisted intake", path: "/clients/30000000-0000-4000-8000-000000000001/years/2025/intake" },
  { name: "taxpayer profile", path: "/clients/30000000-0000-4000-8000-000000000001/years/2025/taxpayer-profile" },
  { name: "return profile", path: "/clients/30000000-0000-4000-8000-000000000001/years/2025/return-profile" },
  { name: "federal credits", path: "/clients/30000000-0000-4000-8000-000000000001/years/2025/credits" },
  { name: "advanced federal modules", path: "/clients/30000000-0000-4000-8000-000000000001/years/2025/advanced" },
  { name: "schedule activities", path: "/clients/30000000-0000-4000-8000-000000000001/years/2025/activities" },
  { name: "intake blockers", path: "/clients/sample/years/2025/intake" },
  { name: "mapping split", path: "/clients/sample/years/2025/mapping" },
  { name: "review blockers", path: "/clients/sample/years/2025/review" },
  { name: "stale calculation", path: "/clients/sample/years/2025/calculation/summary" },
  { name: "import staging", path: "/imports/new" },
  { name: "stale outputs", path: "/workpapers" },
  { name: "sample outputs", path: "/clients/sample/years/2025/outputs" },
  { name: "source entry", path: "/clients/30000000-0000-4000-8000-000000000001/years/2025/source-entry" },
  { name: "administration access", path: "/administration" },
  { name: "release closure", path: "/administration/release-closure" },
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
  test.setTimeout(60_000);
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
  test.setTimeout(60_000);
  await page.goto("/dashboard", { waitUntil: "networkidle" });
  const search = page.getByRole("combobox", { name: "Search assigned clients and returns" });
  await expect(search).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(search).toBeFocused();
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/search/clients") && response.request().method() === "POST",
    { timeout: 30_000 },
  );
  await search.fill("000123");
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  await expect(page.getByRole("option", { name: /John Sample/ })).toBeVisible();
  expect(page.url()).not.toContain("000123");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox", { name: "Client search results" })).toBeHidden();
});

test("persisted return workbench provides keyboard-first form access and stable deep links", async ({ page }) => {
  const base = "/clients/30000000-0000-4000-8000-000000000001/years/2025";
  await page.goto(base);
  await expect(page.getByRole("complementary", { name: "Return topics" })).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();
  await page.keyboard.press("Control+k");
  const search = page.getByRole("combobox", { name: "Search forms and topics" });
  await expect(search).toBeFocused();
  await search.fill("8962");
  await expect(page.getByRole("option", { name: /Premium Tax Credit/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`${base}/advanced\\?section=premiumTaxCredit`));
  await expect(page.getByRole("heading", { name: "Form 1095-A and Form 8962" })).toBeVisible();

  await page.keyboard.press("Control+Enter");
  await expect(page).toHaveURL(`${base}/calculation/summary`);
  await expect(page.getByRole("heading", { name: "Federal tax summary" })).toBeVisible();

  await page.goto(base);
  await expect(page).toHaveURL(`${base}/calculation/summary`);
  await page.getByRole("button", { name: "Shortcuts" }).click();
  await expect(page.getByText("Open next / previous diagnostic")).toBeVisible();
});

test("workbench preferences, pane controls, and source context are accessible", async ({ page }) => {
  const base = "/clients/30000000-0000-4000-8000-000000000001/years/2025";
  const sourceByteRequests: string[] = [];
  page.on("request", (request) => { if (/\/sources\/[^/]+\/download/.test(request.url())) sourceByteRequests.push(request.url()); });
  await page.goto(`${base}/taxpayer-profile`);
  const separator = page.getByRole("separator", { name: "Resize return tree" });
  await separator.focus();
  const before = Number(await separator.getAttribute("aria-valuenow"));
  await page.keyboard.press("ArrowRight");
  await expect(separator).toHaveAttribute("aria-valuenow", String(before + 10));

  await page.getByRole("tab", { name: "Sources" }).click();
  await expect(page.getByRole("heading", { name: "Source evidence" })).toBeVisible();
  expect(sourceByteRequests).toEqual([]);

  await page.getByRole("button", { name: "Compact density" }).click();
  await expect(page.locator(".preparer-workbench")).toHaveClass(/density-compact/);
  await page.getByRole("button", { name: "Classic page view" }).click();
  await expect(page.getByRole("button", { name: "Open Return Workbench" })).toBeVisible();
  await page.getByRole("button", { name: "Open Return Workbench" }).click();
  await expect(page.getByRole("complementary", { name: "Return topics" })).toBeVisible();
});

test("workbench return tree and context become labeled drawers on small screens", async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 });
  await page.goto("/clients/30000000-0000-4000-8000-000000000001/years/2025");
  await page.getByRole("button", { name: "Open return tree" }).click();
  await expect(page.getByRole("complementary", { name: "Return topics" })).toBeVisible();
  await page.getByRole("button", { name: "Close return topics" }).click();
  await page.getByRole("button", { name: "Open return context" }).click();
  await expect(page.getByRole("complementary", { name: "Return context" })).toBeVisible();
  await page.getByRole("button", { name: "Close return context" }).click();
});

test("workbench retains its primary workflow at a 200-percent-equivalent viewport", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 500 });
  await page.goto("/clients/30000000-0000-4000-8000-000000000001/years/2025/return-profile");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open return tree" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open return context" })).toBeVisible();
  await page.getByRole("button", { name: "Open return tree" }).click();
  await expect(page.getByRole("link", { name: /Filing status and dependents/ }).first()).toBeVisible();
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
  await page.goto("/clients/30000000-0000-4000-8000-000000000001/years/2025/sources");
  await page.locator('input[type="file"]').setInputFiles({
    name: "Synthetic clean W-2.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF"),
  });
  await page.getByRole("button", { name: "Upload and scan" }).click();
  await expect(page.getByText("Synthetic clean W-2.pdf").first()).toBeVisible();

  await page.goto("/clients/30000000-0000-4000-8000-000000000001/years/2025/intake");
  await expect(page.getByRole("heading", { name: "Expected documents" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Upload source" })).toHaveAttribute("href", "/clients/30000000-0000-4000-8000-000000000001/years/2025/sources");
  await page.getByRole("combobox", { name: "Registry item", exact: true }).selectOption("w2");
  await expect(page.getByRole("textbox", { name: "Checklist key", exact: true })).toHaveValue("w2");
  await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("received");
  await expect(page.getByLabel("Clean uploaded source")).toBeVisible();
  await expect(page.getByRole("option", { name: /\.pdf · / }).first()).toBeAttached();
});

test("return profile exposes filing statuses, standard-deduction facts, dependent classification and Schedule A", async ({ page }) => {
  await page.goto("/clients/30000000-0000-4000-8000-000000000001/years/2025/return-profile");
  await expect(page.getByRole("heading", { name: "Filing status, dependents & Schedule A" })).toBeVisible();
  for (const status of ["Single", "Married filing jointly", "Married filing separately", "Head of household", "Qualifying surviving spouse"]) {
    await expect(page.getByRole("radio", { name: status })).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "Standard-deduction facts" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Another person can claim the taxpayer as a dependent" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Taxpayer age 65 or older" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Form 8615 applicability reviewed" })).toBeDisabled();
  await page.getByRole("button", { name: "Add dependent" }).click();
  await expect(page.getByRole("textbox", { name: "Legal name" }).last()).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Qualifies for child tax credit" }).last()).toBeVisible();
  await page.getByRole("checkbox", { name: "Use Schedule A" }).check();
  await expect(page.getByRole("textbox", { name: "Medical and dental expenses" })).toBeEnabled();
});

test("advanced federal workflow exposes editable Forms 8959 and 8960 interviews", async ({ page }) => {
  await page.goto("/clients/30000000-0000-4000-8000-000000000001/years/2025/advanced");
  await page.getByRole("button", { name: "Schedule 1, 6251 & 8889" }).click();
  await expect(page.getByRole("heading", { name: "Additional Medicare Tax · Form 8959" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Form 8959 enabled" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Unreported tips" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Net Investment Income Tax · Form 8960" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Form 8960 enabled" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Investment interest expense" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nondeductible IRA basis · Form 8606" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Owner-specific IRA basis ledgers JSON" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Retirement distributions · Form 1099-R / Form 5329" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Complex retirement treatments enabled" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Employee deferrals · taxpayer" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Capital gains · Form 8949 / Schedule D" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Capital-loss carryovers reviewed" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Source-linked capital treatments JSON" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Qualified business income · Form 8995-A" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Complex QBI enabled" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Source-linked QBI trades JSON" })).toBeVisible();
});

test("Schedule C exposes vehicle, home-office, depreciation and loss workpapers", async ({ page }) => {
  await page.goto("/clients/30000000-0000-4000-8000-000000000001/years/2025/activities?type=schedule_c");
  if (await page.getByRole("heading", { name: "Create the first Schedule activity" }).isVisible()) {
    await page.getByRole("textbox", { name: "New activity name" }).fill("Synthetic Schedule C");
    await page.getByRole("button", { name: "Create", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "Part IV · Vehicle deduction" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Deduction method" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Form 8829 · Home office" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Schedule C assets" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Loss limitations reviewed" })).toBeVisible();
});

test("premium tax credit workflow exposes exception and monthly reconciliation inputs", async ({ page }) => {
  await page.goto("/clients/30000000-0000-4000-8000-000000000001/years/2025/advanced");
  await page.getByRole("button", { name: "Premium Tax Credit" }).click();
  await expect(page.getByRole("heading", { name: "Form 1095-A and Form 8962" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Below-poverty exception" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "MFS exception" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Household-member MAGI ledger JSON" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Alternative marriage-year households JSON" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Marketplace policies and monthly columns JSON" })).toBeVisible();
});

test("imported taxpayer and spouse profiles expose guarded manual editing", async ({ page }) => {
  await page.goto("/clients/30000000-0000-4000-8000-000000000001/years/2025/taxpayer-profile");
  await expect(page.getByRole("heading", { name: "Return identity and address" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Taxpayer", exact: true })).toBeVisible();
  await expect(page.getByLabel("Legal name").first()).not.toHaveValue("");
  await expect(page.getByRole("button", { name: "Save taxpayer" })).toBeVisible();
  await expect(page.getByText("Profiles imported from canonical JSON become the same editable records used by calculation and output.")).toBeVisible();
});

test("release closure exposes all five governed workspaces", async ({ page }) => {
  await page.goto("/administration/release-closure");
  await expect(page.getByRole("heading", { name: "Release readiness and evidence" })).toBeVisible();

  const workspaces = [
    ["Tax review", "Independent tax fixture"],
    ["Security & infrastructure", "Import production-readiness result"],
    ["Manual acceptance", "Manual acceptance session"],
    ["Output tie-out", "Source-to-output tie-out"],
  ] as const;
  for (const [tab, heading] of workspaces) {
    await page.getByRole("button", { name: tab }).click();
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }

  await page.getByRole("button", { name: "Release gates" }).click();
  await expect(page.getByRole("heading", { name: "Product scope" })).toBeVisible();
});

test("global import entry downloads the blank template and routes to the persisted return", async ({ page, request }) => {
  await page.goto("/imports/new");
  const templateLink = page.getByRole("link", { name: "Download 2025 JSON template" });
  await expect(templateLink).toHaveAttribute("href", "/api/templates/2025/1040/canonical.json");
  await expect(page.getByRole("link", { name: "Stage JSON" })).toHaveAttribute("href", "/clients/30000000-0000-4000-8000-000000000001/years/2025/imports");
  const response = await request.get("/api/templates/2025/1040/canonical.json");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-disposition"]).toContain("taxpayer-import-template-2025-v1.4.0-review.json");
  expect((await response.json()).forms).toMatchObject({ w2: [], form_1099_nec: [], form_1099_misc: [], form_1099_int: [], form_1099_div: [], form_1099_b: [], form_1099_g: [], form_1099_k: [], form_1099_r: [], form_1099_sa: [], form_ssa_1099: [], form_rrb_1099: [] });
  const example = await request.get("/api/examples/2025/supported-review-return.json");
  expect(example.ok()).toBe(true);
  expect(await example.json()).toMatchObject({ tax_year: 2025, forms: { w2: [expect.any(Object)], form_1099_b: [expect.any(Object)], form_1099_g: [expect.any(Object)], form_1099_r: [expect.any(Object)], form_1099_sa: [expect.any(Object)], form_ssa_1099: [expect.any(Object)] }, metadata: { synthetic_review_example: true } });
});

for (const route of [
  { name: "dashboard", path: "/dashboard?fixture=visual" },
  { name: "clients", path: "/clients?fixture=visual" },
  { name: "return-workspace", path: "/clients/sample/years/2025" },
  { name: "persisted-workbench", path: "/clients/30000000-0000-4000-8000-000000000001/years/2025" },
  { name: "intake-blockers", path: "/clients/sample/years/2025/intake" },
  { name: "mapping-split", path: "/clients/sample/years/2025/mapping" },
  { name: "review-blockers", path: "/clients/sample/years/2025/review" },
  { name: "calculation-stale", path: "/clients/sample/years/2025/calculation/summary" },
  { name: "import-staging", path: "/imports/new" },
  { name: "outputs-stale", path: "/workpapers" },
]) {
  test(`${route.name} visual baseline`, async ({ page }) => {
    if (route.name === "persisted-workbench") {
      await page.route(/\/api\/clients\/[^/]+\/years\/2025\/review$/, async (requestRoute) => {
        await requestRoute.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ revision: 1, issues: [], points: [], auditEvents: [] }),
        });
      });
    }
    await stabilize(page, route.path);
    await expect(page).toHaveScreenshot(`${route.name}.png`, { fullPage: true });
  });
}

async function stabilize(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("main")).toBeVisible();
  if (await page.locator(".preparer-workbench").count()) await expect(page.getByRole("heading", { name: "Current diagnostics" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

function formatViolations(violations: Array<{ id: string; impact?: string | null; nodes: Array<{ target: unknown }> }>) {
  return violations.map((violation) => `${violation.id} (${violation.impact ?? "unknown"}): ${violation.nodes.map((node) => String(node.target)).join(", ")}`).join("\n");
}
