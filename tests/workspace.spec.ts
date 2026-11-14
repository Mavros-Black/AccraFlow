import { test, expect } from "@playwright/test";

test("unconfigured workspace fails closed and explains the missing backend", async ({
  page,
  request,
}) => {
  const response = await request.get("/api/auth/session");
  test.skip(
    response.status() === 401,
    "Requires a server without Supabase configuration.",
  );
  expect(response.status()).toBe(503);
  expect(await response.json()).toEqual({
    error: "Backend is not configured.",
  });
  await page.goto("/workspace");
  await expect(page.getByRole("status")).toContainText(
    "Backend is not configured.",
  );
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("API rejects cross-origin and invalid requests before accessing the backend", async ({
  request,
}) => {
  const headers = {
    Origin: "http://localhost:3000",
    "Content-Type": "application/json",
  };
  const crossOrigin = await request.post("/api/incidents", {
    headers: { ...headers, Origin: "https://attacker.example" },
    data: "{}",
  });
  expect(crossOrigin.status()).toBe(403);
  const invalid = await request.post("/api/incidents", { headers, data: "{" });
  expect(invalid.status()).toBe(400);
  const wrongType = await request.post("/api/incidents", {
    headers: { ...headers, "Content-Type": "text/plain" },
    data: "{}",
  });
  expect(wrongType.status()).toBe(415);
  const large = await request.post("/api/incidents", {
    headers,
    data: JSON.stringify({ value: "x".repeat(17000) }),
  });
  expect(large.status()).toBe(413);
});

test("a rejected submission retains the report fields", async ({ page }) => {
  const org = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth/session")
      return route.fulfill({
        json: {
          user: { id: "user", email: "resident@example.test" },
          memberships: [
            {
              organization_id: org,
              role: "resident",
              organizations: { id: org, name: "Test organization" },
            },
          ],
        },
      });
    if (
      url.pathname === "/api/incidents" &&
      route.request().method() === "POST"
    )
      return route.fulfill({
        status: 400,
        json: { error: "Report rejected by server." },
      });
    if (url.pathname === "/api/incidents")
      return route.fulfill({ json: { incidents: [] } });
    if (url.pathname === "/api/work-orders")
      return route.fulfill({ json: { workOrders: [] } });
    return route.fulfill({
      status: 404,
      json: { error: "Unexpected request" },
    });
  });
  await page.goto("/workspace");
  await expect(page.getByText("Test organization")).toBeAttached();
  await page.getByText("Submit a report", { exact: true }).click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("Blocked drain near junction");
  await page.getByLabel("Latitude").fill("5.58");
  await page.getByLabel("Longitude").fill("-0.21");
  await page
    .getByLabel("Description")
    .fill("Water is collecting around the drain after rainfall.");
  await page.getByRole("button", { name: "Submit report" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Report rejected by server.",
  );
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Blocked drain near junction",
  );
  await expect(page.getByLabel("Description")).toHaveValue(
    "Water is collecting around the drain after rainfall.",
  );
});

test("reporter can correct and withdraw a submitted report", async ({
  page,
}) => {
  const org = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const incidentId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  let incident = {
    id: incidentId,
    reported_by: "user",
    title: "Blocked drain report",
    description: "Water is collecting around the drain.",
    category: "blockage",
    status: "submitted",
    longitude: -0.21,
    latitude: 5.58,
    created_at: "2026-01-01T00:00:00Z",
  };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/auth/session")
      return route.fulfill({
        json: {
          user: { id: "user", email: "resident@example.test" },
          memberships: [
            {
              organization_id: org,
              role: "resident",
              organizations: { id: org, name: "Test organization" },
            },
          ],
        },
      });
    if (
      path === `/api/incidents/${incidentId}` &&
      request.method() === "PATCH"
    ) {
      incident = { ...incident, ...request.postDataJSON() };
      return route.fulfill({ json: { ok: true } });
    }
    if (path === `/api/incidents/${incidentId}/withdraw`) {
      incident = { ...incident, status: "withdrawn" };
      return route.fulfill({ json: { ok: true } });
    }
    if (path === "/api/incidents")
      return route.fulfill({ json: { incidents: [incident] } });
    if (path === "/api/work-orders")
      return route.fulfill({ json: { workOrders: [] } });
    if (path.endsWith("/photos"))
      return route.fulfill({ json: { photos: [] } });
    if (path.endsWith("/history"))
      return route.fulfill({ json: { history: [] } });
    return route.fulfill({
      status: 404,
      json: { error: "Unexpected request" },
    });
  });
  await page.goto("/workspace");
  await page.getByText("Edit or withdraw report").click();
  const details = page
    .locator("details")
    .filter({ hasText: "Edit or withdraw report" });
  await details.getByLabel("Title").fill("Corrected drain report");
  await details.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toContainText("Report updated.");
  await expect(
    page.getByRole("heading", { name: "Corrected drain report" }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await details.getByRole("button", { name: "Withdraw report" }).click();
  await expect(page.getByRole("status")).toContainText("Report withdrawn.");
  await expect(page.getByText("Edit or withdraw report")).toHaveCount(0);
  await expect(page.getByText("Withdrawn", { exact: true })).toBeVisible();
});

test("operators create work orders and update due dates in Accra time", async ({
  page,
}) => {
  const org = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const incidentId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const orderId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  let order: {
    id: string;
    incident_id: string;
    title: string;
    priority: string;
    status: string;
    due_at: string | null;
    completion_notes: null;
    maintenance_assignments: never[];
  } | null = null;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/auth/session")
      return route.fulfill({
        json: {
          user: { id: "operator", email: "operator@example.test" },
          memberships: [
            {
              organization_id: org,
              role: "operator",
              organizations: { id: org, name: "Test organization" },
            },
          ],
        },
      });
    if (path === "/api/incidents")
      return route.fulfill({
        json: {
          incidents: [
            {
              id: incidentId,
              reported_by: "other",
              title: "Verified blockage",
              description: "A verified drainage blockage.",
              category: "blockage",
              status: "verified",
              longitude: -0.21,
              latitude: 5.58,
              created_at: "2026-01-01T00:00:00Z",
            },
          ],
        },
      });
    if (path === "/api/operators")
      return route.fulfill({ json: { operators: [] } });
    if (path.endsWith("/history"))
      return route.fulfill({ json: { history: [] } });
    if (path.endsWith("/photos"))
      return route.fulfill({ json: { photos: [] } });
    if (path === "/api/work-orders" && request.method() === "POST") {
      const body = request.postDataJSON();
      expect(body.dueAt).toBe("2030-03-10T23:59:59.999Z");
      order = {
        id: orderId,
        incident_id: incidentId,
        title: body.title,
        priority: body.priority,
        status: "open",
        due_at: body.dueAt,
        completion_notes: null,
        maintenance_assignments: [],
      };
      return route.fulfill({ json: { id: orderId } });
    }
    if (path === `/api/work-orders/${orderId}/due-date`) {
      const body = request.postDataJSON();
      if (order)
        order = {
          ...order,
          due_at: body.dueDate ? `${body.dueDate}T23:59:59.999Z` : null,
        };
      return route.fulfill({ json: { ok: true } });
    }
    if (path === "/api/work-orders")
      return route.fulfill({ json: { workOrders: order ? [order] : [] } });
    return route.fulfill({
      status: 404,
      json: { error: "Unexpected request" },
    });
  });
  await page.goto("/workspace");
  await page
    .locator("summary")
    .filter({ hasText: "Create work order" })
    .click();
  await page.getByLabel("Task title").fill("Clear verified blockage");
  await page.getByLabel("Due date (optional, Accra time)").fill("2030-03-10");
  await page.getByRole("button", { name: "Create work order" }).click();
  await expect(page.getByRole("status")).toContainText("Work order created.");
  const orderRow = page.locator(".live-orders .task");
  await expect(orderRow).toContainText("Due: 10 Mar 2030");
  await orderRow.getByLabel("Due date (Accra time)").fill("2030-03-12");
  await orderRow.getByRole("button", { name: "Save due date" }).click();
  await expect(orderRow).toContainText("Due: 12 Mar 2030");
  await orderRow.getByLabel("Due date (Accra time)").fill("");
  await orderRow.getByRole("button", { name: "Save due date" }).click();
  await expect(orderRow).toContainText("No due date");
});
