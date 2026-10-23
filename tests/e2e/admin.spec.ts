import { test, expect } from "@playwright/test";
async function login(page: any, user = "admin") {
  await page.goto("/");
  await page.getByLabel("Company code *", { exact: true }).fill("VIDYA");
  await page
    .getByLabel("Employee ID / email *", { exact: true })
    .fill(user + "@mrconnect.test");
  await page.getByLabel("Password *", { exact: true }).fill("Demo-only-2026!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A clear view of your field force" }),
  ).toBeVisible();
}
test("sign-in, customer CRUD, validation, search and persistence", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await page.getByRole("link", { name: "Customers", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Customer directory", level: 1 }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add customer", exact: true }).click();
  await page
    .getByLabel("Customer name *", { exact: true })
    .fill("Dr. Browser Test");
  await page
    .getByLabel("Customer type *", { exact: true })
    .selectOption("Doctor");
  await page
    .getByLabel("Assigned representative *", { exact: true })
    .selectOption({ label: "Aman Sharma" });
  await page
    .getByLabel("Route *", { exact: true })
    .selectOption({ label: "Delhi HQ · Local route" });
  await page.getByLabel("Area *", { exact: true }).fill("Test area");
  await page
    .getByLabel("Clinic / business address *", { exact: true })
    .fill("Test clinic address");
  await page
    .getByRole("button", { name: "Save customer", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Dr. Browser Test");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .getByRole("searchbox", { name: "Search", exact: true })
    .fill("Browser Test");
  await expect(page.getByRole("table")).toContainText("Dr. Browser Test");
  await page.reload();
  await page
    .getByRole("searchbox", { name: "Search", exact: true })
    .fill("Browser Test");
  await page.getByRole("button", { name: "View Dr. Browser Test" }).click();
  await page.getByRole("button", { name: "Edit record" }).click();
  await page.getByLabel("Area *", { exact: true }).fill("Updated test area");
  await page
    .getByRole("button", { name: "Save customer", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Updated test area");
  await page.screenshot({ path: "docs/admin-customers.png", fullPage: true });
  expect(errors).toEqual([]);
});
test("manager can return a claim with a reason and record the decision", async ({
  page,
}) => {
  await login(page, "manager");
  await page.getByRole("link", { name: "Approvals", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: "Priya Singh" });
  await row.getByRole("button", { name: /View/ }).click();
  await page
    .getByRole("button", { name: "Return for correction", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("reason");
  await page
    .getByLabel("Decision note")
    .fill("Please attach travel details for this claim");
  await page
    .getByRole("button", { name: "Return for correction", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("returned");
  await expect(page.getByRole("dialog")).toContainText(
    "Please attach travel details",
  );
});
test("all modules render, exports download, tracking empty state is truthful", async ({
  page,
}) => {
  await login(page);
  await page.screenshot({ path: "docs/admin-dashboard.png", fullPage: true });
  for (const path of [
    "/team",
    "/module/route",
    "/module/tourplan",
    "/activity",
    "/module/expense",
    "/module/leave",
    "/module/sponsorship",
    "/module/product",
    "/module/input",
    "/module/challan",
    "/module/rcpa",
    "/module/campaign",
    "/inventory",
    "/reports",
    "/settings",
  ]) {
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.locator("main")).not.toContainText(
      "The request could not be completed",
    );
  }
  await page.goto("/reports");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download CSV" }).click();
  expect((await download).suggestedFilename()).toBe(
    "mr-connect-productivity.csv",
  );
  await page.goto("/tracking");
  await expect(
    page.getByText("No location points for this date"),
  ).toBeVisible();
  await expect(
    page.getByText("No shift was started.", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/admin-tracking-empty.png",
    fullPage: true,
  });
});
test("customer import validates before writing and previews CSV", async ({
  page,
}) => {
  await login(page);
  await page.goto("/customers");
  await page.getByRole("button", { name: "Import customers" }).click();
  await page
    .getByLabel("Customer CSV")
    .setInputFiles({
      name: "customers.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "name,type,assignedTo,routeId,area,clinicAddress\nInvalid Doctor,Doctor,aman,unknown,Delhi,Test clinic",
      ),
    });
  await expect(page.getByRole("dialog")).toContainText("1 customers ready");
  await page.getByRole("button", { name: "Validate & import" }).click();
  await expect(page.getByRole("alert")).toContainText("Row 2");
});
test("mobile admin layout has usable navigation and no document overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("link", { name: "Customers", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Customer directory", level: 1 }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.locator(".sidebar").evaluate((e) => e.getBoundingClientRect().right),
    )
    .toBeLessThanOrEqual(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "docs/admin-mobile.png", fullPage: true });
});
test("session expiry exits to sign-in and server errors are visible", async ({
  page,
  context,
}) => {
  await login(page);
  await context.clearCookies();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await page.getByLabel("Company code *", { exact: true }).fill("VIDYA");
  await page
    .getByLabel("Employee ID / email *", { exact: true })
    .fill("admin@mrconnect.test");
  await page.getByLabel("Password *", { exact: true }).fill("invalid");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("incorrect");
});
