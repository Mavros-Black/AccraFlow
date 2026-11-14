import { test, expect } from "@playwright/test";
// Interaction tests do not pan/zoom against community tile servers.
test.beforeEach(async ({ page }, info) => {
  if (info.title.startsWith("live basemap")) return;
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
});

test("live basemap initial viewport loads without API credentials", async ({
  page,
}) => {
  const tile = page.waitForResponse(
    (r) => r.url().includes("tile.openstreetmap.org") && r.status() === 200,
    { timeout: 25000 },
  );
  await page.goto("/");
  await tile;
  await expect(page.locator(".maplibregl-canvas")).toBeVisible({
    timeout: 20000,
  });
  await expect(page.locator('.map-inner[data-ready="true"]')).toHaveCount(1, {
    timeout: 25000,
  });
  await page.screenshot({
    path: "test-results/dashboard-live-basemap.png",
    fullPage: true,
  });
});

test("map markers select reports and layer toggle works with fixture tiles", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Accra Map" })).toBeVisible();
  const cards = page.locator(".kpi");
  await expect(
    cards.filter({ hasText: "Total Reports" }).locator("strong"),
  ).toHaveText("24");
  await expect(
    cards.filter({ hasText: "Critical Issues" }).locator("strong"),
  ).toHaveText("5");
  await expect(
    cards.filter({ hasText: "In Progress" }).locator("strong"),
  ).toHaveText("8");
  await expect(
    cards.filter({ hasText: "Resolved" }).locator("strong"),
  ).toHaveText("11");
  await expect(
    cards.filter({ hasText: "Total Reports" }).locator(".kpi-trend"),
  ).toContainText("14%");
  await expect(
    cards.filter({ hasText: "Resolved" }).locator(".kpi-trend"),
  ).toContainText("10%");
  await expect(
    cards.filter({ hasText: "Drainage Coverage" }).locator("strong"),
  ).toHaveText("76%");
  await expect(
    page.getByRole("img", { name: /76% demo coverage/ }),
  ).toHaveCount(1);
  await expect(page.locator(".maplibregl-canvas")).toBeVisible({
    timeout: 20000,
  });
  await expect(
    page.getByRole("checkbox", { name: "Demo map layers" }),
  ).toBeChecked();
  await expect(
    page.getByText("Colors do not represent actual flood risk."),
  ).toBeVisible();
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "3D", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "2D", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const pin = page.getByRole("button", {
    name: "DEMO: Standing water near junction, Adabraka",
  });
  await expect(pin).toBeVisible();
  await pin.click();
  await expect(
    page.getByRole("heading", { name: "Standing water near junction" }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: "Demo map layers" }).uncheck();
  await expect(pin).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Demo map layers" }).check();
  await expect(pin).toBeVisible();
  await page
    .getByRole("combobox", { name: "Find a neighbourhood" })
    .selectOption("Osu");
  await page.getByRole("button", { name: "Locate", exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("new report enters review workflow and can create a maintenance work order", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New report", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Report title").fill("Synthetic blocked drain");
  await dialog
    .getByLabel("Description")
    .fill("Synthetic test observation for the local demonstration workflow.");
  await dialog.getByRole("button", { name: "Submit demo report" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.locator(".kpi").filter({ hasText: "Total Reports" }).locator("strong"),
  ).toHaveText("25");
  await expect(
    page
      .locator(".kpi")
      .filter({ hasText: "Total Reports" })
      .locator(".kpi-trend"),
  ).toContainText("19%");
  await expect(
    page.getByRole("heading", { name: "Synthetic blocked drain", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Demo: Under Review", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Demo: Verified", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create demo work order", exact: true })
    .click();
  await expect(page.locator(".notice")).toContainText(
    "Demo work order created",
  );
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Maintenance", exact: true })
    .click();
  await expect(
    page.getByText("Synthetic blocked drain", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Toggle demo completion: Synthetic blocked drain",
    })
    .click();
  await expect(
    page
      .locator(".task")
      .filter({ hasText: "Synthetic blocked drain" })
      .getByText("Completed", { exact: true }),
  ).toBeVisible();
});

test("configuration saves without producing fabricated results and CSV is downloadable", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Simulation Lab", exact: true })
    .click();
  await page.getByLabel("Rainfall depth (mm)").fill("75");
  await page
    .getByRole("combobox", { name: "Intervention", exact: true })
    .selectOption("Cleaning");
  await page.getByRole("button", { name: "Save local configuration" }).click();
  await expect(
    page.getByText("Configuration saved in this session"),
  ).toBeVisible();
  await expect(
    page.getByText("Awaiting validated model", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/75 mm \/ 60 min · Cleaning/)).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export demo CSV" }).click();
  expect((await download).suggestedFilename()).toBe(
    "accraflow-demo-incidents.csv",
  );
});

test("report filters, modal keyboard dismissal and small-screen layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Reports & Incidents" })
    .click();
  await page.getByRole("textbox", { name: "Filter reports" }).fill("Osu");
  await expect(page.getByRole("row")).toHaveCount(2);
  await page
    .getByRole("combobox", { name: "Filter status" })
    .selectOption("Verified");
  await expect(
    page.getByText("No demo reports match these filters."),
  ).toBeVisible();
  await page.getByRole("button", { name: "New report", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
});

test("lower dashboard cards expose their data and support demo actions", async ({
  page,
}) => {
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1680, height: 1050 });
  const chart = page.getByRole("combobox", { name: "Chart view" });
  await chart.selectOption("rainfall");
  await expect(
    page.getByRole("heading", { name: /Rainfall & Water Level/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: /Fictional demo chart/ }),
  ).toBeVisible();
  await expect(page.getByText(/Fictional sample only/)).toBeVisible();
  await chart.selectOption("reports");
  await expect(
    page.getByRole("heading", { name: /Reports & Work Orders/ }),
  ).toBeVisible();
  await expect(page.getByText(/Counts by incident status/)).toBeVisible();
  await expect(
    page.getByText("OPEN DEMO REPORTS · SNAPSHOT, NOT RISK"),
  ).toBeVisible();
  await expect(
    page
      .locator(".forecast-row")
      .filter({ hasText: "Kaneshie" })
      .getByLabel("3 open demo reports"),
  ).toBeVisible();
  const period = page.getByRole("combobox", { name: "Forecast period" });
  await period.selectOption("48 hours");
  await expect(
    page.getByText(/No flood forecast for the next 48 hours/),
  ).toBeVisible();
  const completion = page.getByRole("button", {
    name: "Toggle demo completion: Inspect culvert opening",
  });
  await expect(completion).toHaveAttribute("aria-pressed", "false");
  await completion.click();
  await expect(completion).toHaveAttribute("aria-pressed", "true");
  await expect(
    page
      .locator(".task")
      .filter({ hasText: "Inspect culvert opening" })
      .getByText("Completed", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Inspect culvert opening", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Culvert inspection required" }),
  ).toBeVisible();
});
