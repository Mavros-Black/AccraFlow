import { test, expect } from "@playwright/test";

const orgA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const orgB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("organization reports are separate from demo data and switch with the selected organization", async ({
  page,
}) => {
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      json: {
        user: { id: "resident", email: "test@example.test" },
        memberships: [
          {
            organization_id: orgA,
            role: "resident",
            organizations: { id: orgA, name: "Organization A" },
          },
          {
            organization_id: orgB,
            role: "moderator",
            organizations: { id: orgB, name: "Organization B" },
          },
        ],
      },
    }),
  );
  await page.route("**/api/incidents?*", (route) => {
    const org = new URL(route.request().url()).searchParams.get(
      "organizationId",
    );
    const incident =
      org === orgA
        ? {
            id: "report-a",
            title: "Reported drain A",
            description: "An unverified observation.",
            category: "blockage",
            status: "submitted",
            latitude: 5.58,
            longitude: -0.21,
            created_at: "2026-01-01T00:00:00Z",
          }
        : {
            id: "report-b",
            title: "Reported drain B",
            description: "A verified observation.",
            category: "flooding",
            status: "verified",
            latitude: 5.59,
            longitude: -0.2,
            created_at: "2026-01-01T00:00:00Z",
          };
    return route.fulfill({ json: { incidents: [incident] } });
  });
  await page.goto("/");
  await expect(page.locator('.map-inner[data-ready="true"]')).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole("button", { name: "Show organization reports" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Demo map layers" }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("button", {
      name: "Organization report: Reported drain A, Submitted",
    }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Organization report: Reported drain A, Submitted",
    })
    .click();
  await expect(page.getByText("An unverified observation.")).toBeVisible();
  await expect(
    page.locator(".kpi").filter({ hasText: "Total Reports" }).locator("strong"),
  ).toHaveText("24");
  await page.locator(".organization-map-toolbar select").selectOption(orgB);
  await expect(
    page.getByRole("button", {
      name: "Organization report: Reported drain B, Verified",
    }),
  ).toBeVisible();
  await expect(page.getByText("Reported drain A", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Hide organization reports" }).click();
  await expect(
    page.getByRole("button", { name: /Organization report: Reported drain/ }),
  ).toHaveCount(0);
});
