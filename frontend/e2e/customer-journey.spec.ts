import { test, expect, type Locator, type Page } from "@playwright/test";

async function tabUntilFocused(page: Page, target: Locator, maxTabs = 24) {
  for (let i = 0; i < maxTabs; i += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

async function join(page: Page, organization: "university" | "clinic" = "university") {
  const directory =
    organization === "university"
      ? {
          category: "Universities",
          organizationName: "Almaty University · Demo",
          serviceName: "Student services",
          operatingHours: "Hours: 00:00–23:59",
        }
      : {
          category: "Clinics",
          organizationName: "City Health Clinic · Demo",
          serviceName: "General consultation",
          operatingHours: "Hours: 00:00–23:59",
        };
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Skip the waiting. Keep your place." }),
  ).toBeVisible();
  await page.getByRole("button", { name: directory.category, exact: true }).click();
  await expect(page.locator("article")).toHaveCount(1);
  await page.getByRole("link", { name: "View Services" }).click();
  await expect(page.getByRole("heading", { name: directory.organizationName })).toBeVisible();
  await expect(page.getByText("Service hours listed below · Asia/Almaty")).toBeVisible();
  await expect(page.getByText(directory.operatingHours)).toBeVisible();
  const service = page.locator("article").filter({ hasText: directory.serviceName });
  await expect(service.getByText("Open", { exact: true })).toBeVisible();
  await expect(service.getByText(/\d+ waiting/)).toBeVisible();
  await expect(service.getByText(/~\d+ min wait/)).toBeVisible();
  await page.getByRole("link", { name: "Join Queue" }).click();
  await expect(page.getByRole("heading", { name: "Confirm your place" })).toBeVisible();
  const joinFlowFitsViewport = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(joinFlowFitsViewport).toBe(true);
  await expect(page.locator("input")).toHaveCount(0);
  await page.getByRole("button", { name: "Confirm & join queue" }).click();
  await expect(page).toHaveURL(/\/ticket\//);
  await expect(page.getByRole("heading", { name: "You’re in the queue" })).toBeVisible();
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  return page.url();
}

test("discover, join, track position, staff call/start/complete, and private browser history", async ({
  page,
  browser,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const organization = info.project.name === "mobile" ? "clinic" : "university";
  const staffUsername = organization === "clinic" ? "demo-staff-clinic" : "demo-staff-university";
  const serviceName = organization === "clinic" ? "General consultation" : "Student services";
  const firstUrl = await join(page, organization);
  await expect(page.getByText("People ahead of you")).toBeVisible();
  await expect(page.locator("body")).not.toHaveText(/Mock API/);
  await page.screenshot({ path: info.outputPath("ticket.png"), fullPage: true });
  const second = await page.context().newPage();
  const secondUrl = await join(second, organization);
  await expect(
    second.getByText("People ahead of you").locator("..").getByText("1", { exact: true }),
  ).toBeVisible();

  const staffContext = await browser.newContext({ viewport: page.viewportSize() });
  const staff = await staffContext.newPage();
  await staff.goto("http://127.0.0.1:15173/login");
  await staff.getByLabel("Username").fill(staffUsername);
  await staff.getByLabel("Password").fill("staff123");
  await staff.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(staff.getByRole("heading", { name: "Service desk" })).toBeVisible();
  const staffFitsViewport = await staff.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(staffFitsViewport).toBe(true);
  await staff.getByRole("button", { name: "Call Next", exact: true }).click();
  await expect(page.getByRole("heading", { name: "It’s your turn!" })).toBeVisible({
    timeout: 12000,
  });
  await expect(
    second.getByText("People ahead of you").locator("..").getByText("0", { exact: true }),
  ).toBeVisible({ timeout: 12000 });
  await expect(staff.getByRole("button", { name: "Complete Service" })).toHaveCount(0);
  await staff.getByRole("button", { name: "Start service", exact: true }).click();
  await expect(page.getByRole("heading", { name: "You’re being served" })).toBeVisible({
    timeout: 12000,
  });
  await staff.getByRole("button", { name: "Complete Service", exact: true }).click();
  await expect(page.getByRole("heading", { name: "All done. Enjoy your day!" })).toBeVisible({
    timeout: 12000,
  });
  await second.goto(secondUrl);
  await second.keyboard.press("Tab");
  await expect(second.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await tabUntilFocused(second, second.getByRole("button", { name: "Cancel Ticket", exact: true }));
  await second.keyboard.press("Enter");
  await expect(second.getByRole("alertdialog")).toBeVisible();
  await expect(second.getByRole("button", { name: "Go back", exact: true })).toBeFocused();
  await second.keyboard.press("Tab");
  await expect(second.getByRole("button", { name: "Confirm", exact: true })).toBeFocused();
  await second.keyboard.press("Enter");
  await expect(second.getByRole("heading", { name: "Your ticket is cancelled" })).toBeVisible();
  await expect(staff.getByRole("button", { name: "Call Next", exact: true })).toBeDisabled({
    timeout: 12000,
  });
  await page.goto("/tickets");
  await expect(page.locator("main").getByRole("link").filter({ hasText: serviceName })).toHaveCount(
    2,
  );

  const privateContext = await browser.newContext();
  const stranger = await privateContext.newPage();
  await stranger.goto("http://127.0.0.1:15173/tickets");
  await expect(stranger.getByText("Your next visit starts here")).toBeVisible();
  await stranger.goto(firstUrl);
  await expect(stranger.getByRole("heading", { name: "All done. Enjoy your day!" })).toBeVisible();
  await stranger.goto("http://127.0.0.1:15173/ticket/invalid-private-link");
  await expect(stranger.getByRole("alert")).toContainText("Ticket unavailable");
  await privateContext.close();
  await staffContext.close();
  expect(errors).toEqual([]);
});

test("search, closed and empty states, keyboard navigation, responsive layout", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(page.locator("article")).toHaveCount(5);
  await page.screenshot({ path: info.outputPath("explore.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByLabel("Search organizations and services").fill("general consultation");
  await expect(page.locator("article")).toHaveCount(1);
  await page.getByLabel("Search organizations and services").fill("nonexistent service");
  await expect(page.getByText("No matching organizations")).toBeVisible();
  await page.getByRole("button", { name: "Reset filters" }).click();
  await page.goto("/organizations/org-demo");
  await expect(page.getByRole("button", { name: "Queue closed" })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.goto("/join/org-demo/svc-it");
  await expect(page.getByRole("button", { name: "Queue closed", exact: true })).toBeDisabled();
  await page.goto("/");
  await expect(page.getByRole("group", { name: "Organization categories" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
  await expect(page.locator("main")).toBeFocused();
  await page.keyboard.press("Tab");
  const search = page.getByLabel("Search organizations and services");
  await expect(search).toBeFocused();
  await page.keyboard.type("clinic");
  await expect(page.locator("article")).toHaveCount(1);
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const universities = page.getByRole("button", { name: "Universities", exact: true });
  await expect(universities).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(universities).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("article")).toHaveCount(1);
  for (let i = 0; i < 4; i += 1) await page.keyboard.press("Tab");
  const viewServices = page.getByRole("link", { name: "View Services" });
  await expect(viewServices).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Almaty University · Demo" })).toBeVisible();
  const joinQueue = page.getByRole("link", { name: "Join Queue" });
  await joinQueue.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Confirm your place" })).toBeVisible();
  const confirmJoin = page.getByRole("button", { name: "Confirm & join queue" });
  await confirmJoin.press("Enter");
  await expect(page.getByRole("heading", { name: "You’re in the queue" })).toBeVisible();
  const cancelTicket = page.getByRole("button", { name: "Cancel Ticket" });
  await cancelTicket.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "Go back" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Confirm" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Your ticket is cancelled" })).toBeVisible();
});

test("queue conflict after availability changes is announced and prevents ticket issuance", async ({
  page,
}) => {
  await page.goto("/join/org-demo/svc-fin");
  const joinButton = page.getByRole("button", { name: "Confirm & join queue" });
  await expect(joinButton).toBeEnabled();
  const login = await page.request.post("http://127.0.0.1:18765/api/auth/login", {
    data: { username: "admin", password: "admin123" },
  });
  expect(login.ok()).toBe(true);
  const { token } = await login.json();
  const closed = await page.request.patch("http://127.0.0.1:18765/api/admin/services/svc-fin", {
    headers: { Authorization: `Bearer ${token}` },
    data: { isOpen: false },
  });
  expect(closed.ok()).toBe(true);

  try {
    await joinButton.click();
    await expect(
      page.locator('[role="alert"]').filter({ hasText: "This queue is closed" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "You’re in the queue" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Queue closed", exact: true })).toBeDisabled();
  } finally {
    const reopened = await page.request.patch("http://127.0.0.1:18765/api/admin/services/svc-fin", {
      headers: { Authorization: `Bearer ${token}` },
      data: { isOpen: true },
    });
    expect(reopened.ok()).toBe(true);
  }
});

test("staff no-show confirmation and essential admin configuration", async ({ page, browser }) => {
  await page.goto("/join/demo-clinic/demo-svc-clinic");
  await page.getByRole("button", { name: "Confirm & join queue" }).click();
  await expect(page.getByRole("heading", { name: "You’re in the queue" })).toBeVisible();
  const context = await browser.newContext({ viewport: page.viewportSize() });
  const staff = await context.newPage();
  await staff.goto("http://127.0.0.1:15173/login");
  await expect(staff.getByLabel("Username")).toBeEnabled();
  const loginFitsViewport = await staff.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(loginFitsViewport).toBe(true);
  await staff.keyboard.press("Tab");
  await expect(staff.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await staff.keyboard.press("Enter");
  await expect(staff.locator("main")).toBeFocused();
  await staff.keyboard.press("Tab");
  await expect(staff.getByLabel("Username")).toBeFocused();
  await staff.keyboard.type("demo-staff-clinic");
  await staff.keyboard.press("Tab");
  await expect(staff.getByLabel("Password")).toBeFocused();
  await staff.keyboard.type("staff123");
  await staff.keyboard.press("Tab");
  const clinicSignIn = staff.getByRole("button", { name: "Sign in", exact: true });
  await expect(clinicSignIn).toBeFocused();
  await staff.keyboard.press("Enter");
  await expect(staff.getByRole("heading", { name: "Service desk" })).toBeVisible();
  await staff.goto("http://127.0.0.1:15173/staff");
  await staff.keyboard.press("Tab");
  await staff.keyboard.press("Enter");
  await expect(staff.locator("main")).toBeFocused();
  const callNext = staff.getByRole("button", { name: "Call Next", exact: true });
  await expect(callNext).toBeEnabled();
  await staff.keyboard.press("Tab");
  await staff.keyboard.press("Tab");
  await expect(callNext).toBeFocused();
  await staff.keyboard.press("Enter");
  const staffFitsViewport = await staff.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(staffFitsViewport).toBe(true);
  await staff.getByRole("button", { name: "Mark No-show", exact: true }).click();
  await staff.getByRole("button", { name: "Go back", exact: true }).click();
  await expect(staff.getByRole("button", { name: "Start service", exact: true })).toBeVisible();
  await staff.getByRole("button", { name: "Mark No-show", exact: true }).click();
  await staff.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("heading", { name: "You missed your turn" })).toBeVisible({
    timeout: 12000,
  });
  await staff.getByRole("button", { name: "Sign out", exact: true }).click();
  await staff.goto("http://127.0.0.1:15173/admin");
  await expect(staff.getByText("Admins only.")).toBeVisible();
  const expiredContext = await browser.newContext({ viewport: page.viewportSize() });
  const expiredStaff = await expiredContext.newPage();
  await expiredStaff.addInitScript(() => {
    localStorage.setItem(
      "kezek-session",
      JSON.stringify({
        token: "e2e-expired-session",
        user: {
          id: "demo-staff-university",
          name: "Almaty University demo staff",
          username: "demo-staff-university",
          role: "staff",
        },
      }),
    );
  });
  const expiredResponse = await expiredStaff.request.get("http://127.0.0.1:18765/api/counters", {
    headers: { Authorization: "Bearer e2e-expired-session" },
  });
  expect(expiredResponse.status()).toBe(401);
  await expiredStaff.goto("http://127.0.0.1:15173/staff");
  await expect(expiredStaff.getByRole("alert")).toContainText("Couldn’t load your counters", {
    timeout: 15000,
  });
  await expiredContext.close();
  await staff.goto("http://127.0.0.1:15173/login");
  await expect(staff.getByLabel("Username")).toBeEnabled();
  await staff.keyboard.press("Tab");
  await expect(staff.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await staff.keyboard.press("Enter");
  await expect(staff.locator("main")).toBeFocused();
  await staff.keyboard.press("Tab");
  const username = staff.getByLabel("Username");
  await expect(username).toBeFocused();
  await staff.keyboard.type("admin");
  await staff.keyboard.press("Tab");
  const password = staff.getByLabel("Password");
  await expect(password).toBeFocused();
  await staff.keyboard.type("wrong");
  await staff.keyboard.press("Tab");
  const adminSignIn = staff.getByRole("button", { name: "Sign in", exact: true });
  await expect(adminSignIn).toBeFocused();
  await staff.keyboard.press("Enter");
  await expect(staff.getByRole("alert")).toContainText("Invalid username or password");
  await staff.keyboard.press("Shift+Tab");
  await expect(password).toBeFocused();
  await staff.keyboard.press("Control+A");
  await staff.keyboard.type("admin123");
  await staff.keyboard.press("Enter");
  await expect(staff.getByText("5 participating organizations across Kezek")).toBeVisible();
  const adminFitsViewport = await staff.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(adminFitsViewport).toBe(true);
  await expect(staff.getByRole("heading", { name: "Almaty University · Demo" })).toBeVisible();
  await expect(staff.getByRole("heading", { name: "City Health Clinic · Demo" })).toBeVisible();
  await staff.goto("http://127.0.0.1:15173/admin");
  await staff.keyboard.press("Tab");
  await expect(staff.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await staff.keyboard.press("Enter");
  await expect(staff.locator("main")).toBeFocused();
  const organizationsTab = staff.getByRole("tab", { name: "Organizations" });
  await organizationsTab.focus();
  await expect(organizationsTab).toBeFocused();
  await staff.keyboard.press("ArrowRight");
  await expect(staff.getByRole("tab", { name: "Analytics" })).toHaveAttribute(
    "data-state",
    "active",
  );
  await expect(staff.getByRole("heading", { name: "Tickets by day" })).toBeVisible();
  await staff.getByLabel("Analytics start date").fill("2026-10-20");
  await staff.getByLabel("Analytics end date").fill("2026-10-22");
  const analyticsResponse = staff.waitForResponse(
    (response) =>
      response.url().includes("/api/admin/analytics?dateFrom=2026-10-20&dateTo=2026-10-22") &&
      response.request().method() === "GET",
  );
  await staff.getByRole("button", { name: "Apply dates" }).click();
  const analytics = await analyticsResponse;
  expect(analytics.ok()).toBe(true);
  expect(await analytics.json()).toMatchObject({
    dateFrom: "2026-10-20",
    dateTo: "2026-10-22",
    timezone: "Asia/Almaty",
  });
  await expect(
    staff.getByText("Showing 2026-10-20 – 2026-10-22 · Organization time: Asia/Almaty"),
  ).toBeVisible();
  await staff.getByRole("tab", { name: "Analytics" }).focus();
  await staff.keyboard.press("ArrowRight");
  const servicesTab = staff.getByRole("tab", { name: "Services" });
  await expect(servicesTab).toHaveAttribute("data-state", "active");
  await staff.getByLabel("Name", { exact: true }).fill("Browser demo service");
  await staff.getByLabel("Description", { exact: true }).fill("Created through real API");
  await staff.getByLabel("Prefix", { exact: true }).fill("T");
  await staff.getByRole("button", { name: "Add service", exact: true }).click();
  const row = staff
    .locator("div.surface")
    .filter({ has: staff.getByText("Browser demo service", { exact: true }) });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Close queue" }).click();
  await expect(row.getByRole("button", { name: "Open queue" })).toBeVisible();
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  await staff.getByRole("button", { name: "Go back", exact: true }).click();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  await staff.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(row).toHaveCount(0);
  await servicesTab.focus();
  await staff.keyboard.press("ArrowRight");
  const countersTab = staff.getByRole("tab", { name: "Counters" });
  await expect(countersTab).toHaveAttribute("data-state", "active");
  await staff.getByLabel("Counter name").fill("Browser assigned counter");
  await staff.getByRole("button", { name: "Add counter", exact: true }).click();
  const counter = staff
    .locator("div.surface")
    .filter({ has: staff.getByText("Browser assigned counter", { exact: true }) });
  await expect(counter.last()).toBeVisible();
  const assignResponse = staff.waitForResponse(
    (response) =>
      response.url().includes(`/api/admin/counters/`) &&
      response.request().method() === "PATCH" &&
      response.request().postData()?.includes('"staffId"'),
  );
  await counter.last().getByLabel("Assigned staff member").selectOption("stf-aigerim");
  const assignment = await assignResponse;
  expect(assignment.ok()).toBe(true);
  expect((await assignment.json()).staffId).toBe("stf-aigerim");
  const serviceResponse = staff.waitForResponse(
    (response) =>
      response.url().includes(`/api/admin/counters/`) &&
      response.request().method() === "PATCH" &&
      response.request().postData()?.includes('"serviceIds"'),
  );
  await counter.last().getByRole("button", { name: "A · Registrar Office", exact: true }).click();
  expect((await serviceResponse).ok()).toBe(true);
  await staff.getByRole("button", { name: "Sign out", exact: true }).click();
  await staff.goto("http://127.0.0.1:15173/login");
  await staff.getByLabel("Username").fill("aigerim");
  await staff.getByLabel("Password").fill("staff123");
  await staff.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(staff.getByRole("heading", { name: "Service desk" })).toBeVisible();
  await staff.reload();
  await expect(staff.getByRole("heading", { name: "Service desk" })).toBeVisible();
  await expect(
    staff.getByRole("button", { name: "Browser assigned counter" }).last(),
  ).toBeVisible();
  await context.close();
});
