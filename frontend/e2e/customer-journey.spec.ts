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
          operatingHours: "Hours: 12:00 AM–11:59 PM",
        }
      : {
          category: "Clinics",
          organizationName: "City Health Clinic · Demo",
          serviceName: "General consultation",
          operatingHours: "Hours: 12:00 AM–11:59 PM",
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
  await expect(service.getByText(/\d+ (?:person|people) waiting/)).toBeVisible();
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

test(
  "discover, join, track position, staff call/start/complete, and private browser history",
  async ({ page, browser }, info) => {
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
    await tabUntilFocused(
      second,
      second.getByRole("button", { name: "Cancel Ticket", exact: true }),
    );
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
    await expect(
      page.locator("main").getByRole("link").filter({ hasText: serviceName }),
    ).toHaveCount(2);

    const privateContext = await browser.newContext();
    const stranger = await privateContext.newPage();
    await stranger.goto("http://127.0.0.1:15173/tickets");
    await expect(stranger.getByText("Your next visit starts here")).toBeVisible();
    await stranger.goto(firstUrl);
    await expect(
      stranger.getByRole("heading", { name: "All done. Enjoy your day!" }),
    ).toBeVisible();
    await stranger.goto("http://127.0.0.1:15173/ticket/invalid-private-link");
    await expect(stranger.getByRole("alert")).toContainText("Ticket unavailable");
    await privateContext.close();
    await staffContext.close();
    expect(errors).toEqual([]);
  },
  { timeout: 60_000 },
);

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

test("staff no-show confirmation and essential admin configuration", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(90000);
  const browserServiceName = "Browser demo service " + info.project.name;
  const browserCounterName = "Browser assigned counter " + info.project.name;
  const renamedBrowserCounterName = "Renamed browser counter " + info.project.name;
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
  await staff.getByLabel("Name", { exact: true }).fill(browserServiceName);
  await staff.getByLabel("Description", { exact: true }).fill("Created through real API");
  await staff.getByLabel("Prefix", { exact: true }).fill("T");
  await staff.getByRole("button", { name: "Add service", exact: true }).click();
  const row = staff.getByRole("form", { name: "Edit " + browserServiceName });
  await expect(row).toBeVisible();
  const closeQueue = staff.waitForResponse(
    (response) =>
      response.url().includes("/api/admin/queues/") && response.request().method() === "PATCH",
  );
  await row.getByRole("button", { name: "Close queue" }).click();
  const closedQueue = await closeQueue;
  expect(closedQueue.ok()).toBe(true);
  expect(await closedQueue.json()).toMatchObject({ isOpen: false });
  await expect(row.getByRole("button", { name: "Open queue" })).toBeVisible();
  const openQueue = staff.waitForResponse(
    (response) =>
      response.url().includes("/api/admin/queues/") && response.request().method() === "PATCH",
  );
  await row.getByRole("button", { name: "Open queue" }).click();
  const reopenedQueue = await openQueue;
  expect(reopenedQueue.ok()).toBe(true);
  expect(await reopenedQueue.json()).toMatchObject({ isOpen: true });
  await expect(row.getByRole("button", { name: "Close queue" })).toBeVisible();

  const saveService = staff.waitForResponse(
    (response) =>
      response.url().includes("/api/admin/services/") && response.request().method() === "PATCH",
  );
  await row.getByLabel("Opens at for " + browserServiceName, { exact: true }).fill("00:00");
  await row.getByLabel("Closes at for " + browserServiceName, { exact: true }).fill("00:01");
  await row.getByLabel("Duration for " + browserServiceName, { exact: true }).fill("7");
  await row.getByRole("button", { name: "Save service" }).click();
  const savedService = await saveService;
  expect(savedService.ok()).toBe(true);
  expect(await savedService.json()).toMatchObject({
    avgServiceMinutes: 7,
    opensAt: "00:00:00",
    closesAt: "00:01:00",
  });
  const reopenQueue = staff.waitForResponse(
    (response) =>
      response.url().includes("/api/admin/queues/") && response.request().method() === "PATCH",
  );
  await row.getByRole("button", { name: "Open queue" }).click();
  expect((await reopenQueue).status()).toBe(409);
  await expect(row.getByRole("alert")).toContainText(/outside|hours/i);
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
  await staff.getByRole("textbox", { name: "Counter name", exact: true }).fill(browserCounterName);
  await staff.getByRole("button", { name: "Add counter", exact: true }).click();
  const counter = staff
    .locator("div.surface")
    .filter({ has: staff.getByLabel(`Counter name for ${browserCounterName}`) });
  await expect(counter.last()).toBeVisible();
  const renameResponse = staff.waitForResponse(
    (response) =>
      response.url().includes(`/api/admin/counters/`) &&
      response.request().method() === "PATCH" &&
      response.request().postData()?.includes(`"name":"${renamedBrowserCounterName}"`),
  );
  await counter
    .last()
    .getByLabel(`Counter name for ${browserCounterName}`)
    .fill(renamedBrowserCounterName);
  await counter.last().getByRole("button", { name: "Save name", exact: true }).click();
  expect((await renameResponse).ok()).toBe(true);
  await staff.getByRole("tab", { name: "Staff settings" }).click();
  const browserStaffUsername = "browser-created-staff-" + info.project.name;
  const browserStaffName = "Browser-created staff " + info.project.name;
  const editedBrowserStaffUsername = browserStaffUsername + "-edited";
  await staff.getByLabel("Full name").fill(browserStaffName);
  await staff.getByLabel("Username", { exact: true }).fill(browserStaffUsername);
  await staff.getByLabel("Password").fill("temporary-password");
  const createStaffResponse = staff.waitForResponse(
    (response) =>
      response.url().includes("/api/admin/staff") && response.request().method() === "POST",
  );
  await staff.getByRole("button", { name: "Add staff", exact: true }).click();
  const createdStaff = await createStaffResponse;
  expect(createdStaff.ok()).toBe(true);
  expect(await createdStaff.json()).not.toHaveProperty("password");
  await expect(staff.getByLabel("Password")).toHaveValue("");
  const newStaffRow = staff
    .locator("li")
    .filter({ has: staff.getByRole("textbox", { name: `Name for ${browserStaffUsername}` }) });
  await newStaffRow
    .getByRole("textbox", { name: `Name for ${browserStaffUsername}`, exact: true })
    .fill("Updated browser-created staff");
  await newStaffRow
    .getByRole("textbox", { name: `Username for ${browserStaffUsername}`, exact: true })
    .fill(editedBrowserStaffUsername);
  const updateStaffResponse = staff.waitForResponse(
    (response) =>
      response.url().includes("/api/admin/staff/") && response.request().method() === "PATCH",
  );
  await newStaffRow.getByRole("button", { name: "Save", exact: true }).click();
  const updatedStaff = await updateStaffResponse;
  expect(updatedStaff.ok()).toBe(true);
  expect(await updatedStaff.json()).toMatchObject({
    name: "Updated browser-created staff",
    username: editedBrowserStaffUsername,
  });
  const editedStaffRow = staff.locator("li").filter({
    has: staff.getByRole("textbox", { name: `Name for ${editedBrowserStaffUsername}` }),
  });
  const disableStaffResponse = staff.waitForResponse(
    (response) =>
      response.url().includes("/api/admin/staff/") && response.request().method() === "PATCH",
  );
  await editedStaffRow.getByRole("button", { name: "Deactivate", exact: true }).click();
  const disabledStaff = await disableStaffResponse;
  expect(disabledStaff.ok()).toBe(true);
  expect(await disabledStaff.json()).toMatchObject({ isActive: false });
  const aigerimRow = staff
    .locator("li")
    .filter({ has: staff.getByRole("textbox", { name: "Name for aigerim", exact: true }) });
  const counterAssignment = aigerimRow.getByLabel("Counter to assign to Aigerim");
  await counterAssignment.selectOption({ label: renamedBrowserCounterName });
  const assignResponse = staff.waitForResponse(
    (response) =>
      response.url().includes(`/api/admin/counters/`) &&
      response.request().method() === "PATCH" &&
      response.request().postData()?.includes('"staffId"'),
  );
  await aigerimRow.getByRole("button", { name: "Assign counter", exact: true }).click();
  const assignment = await assignResponse;
  expect(assignment.ok()).toBe(true);
  expect((await assignment.json()).staffId).toBe("stf-aigerim");
  const removeAssignment = staff.waitForResponse(
    (response) =>
      response.url().includes(`/api/admin/counters/`) &&
      response.request().method() === "PATCH" &&
      response.request().postData()?.includes('"staffId":null'),
  );
  await staff
    .getByRole("button", {
      name: new RegExp(`Remove ${renamedBrowserCounterName} assignment from`),
    })
    .click();
  expect((await removeAssignment).ok()).toBe(true);
  await staff.getByRole("tab", { name: "Counters" }).click();
  const renamedCounter = staff
    .locator("div.surface")
    .filter({ has: staff.getByLabel(`Counter name for ${renamedBrowserCounterName}`) });
  const reassignResponse = staff.waitForResponse(
    (response) =>
      response.url().includes(`/api/admin/counters/`) &&
      response.request().method() === "PATCH" &&
      response.request().postData()?.includes('"staffId":"stf-aigerim"'),
  );
  await renamedCounter.last().getByLabel("Assigned staff member").selectOption("stf-aigerim");
  expect((await reassignResponse).ok()).toBe(true);
  const serviceResponse = staff.waitForResponse(
    (response) =>
      response.url().includes(`/api/admin/counters/`) &&
      response.request().method() === "PATCH" &&
      response.request().postData()?.includes('"serviceIds"'),
  );
  await renamedCounter
    .last()
    .getByRole("button", { name: "A · Registrar Office", exact: true })
    .click();
  expect((await serviceResponse).ok()).toBe(true);
  await staff.getByRole("button", { name: "Sign out", exact: true }).click();
  await staff.goto("http://127.0.0.1:15173/login");
  await staff.getByLabel("Username").fill("aigerim");
  await staff.getByLabel("Password").fill("staff123");
  await staff.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(staff.getByRole("heading", { name: "Service desk" })).toBeVisible();
  await staff.reload();
  await expect(staff.getByRole("heading", { name: "Service desk" })).toBeVisible();
  await expect(staff.getByRole("button", { name: renamedBrowserCounterName }).last()).toBeVisible();
  await context.close();
});

test("cookie sessions restore after reload, enforce roles, and revoke access on logout", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Username")).toBeEnabled();

  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password").fill("incorrect-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Invalid username or password");

  await page.getByLabel("Password").fill("admin123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Administration" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Admin", exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("kezek-session"))).toBeNull();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Administration" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Admin", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Username").fill("aigerim");
  await page.getByLabel("Password").fill("staff123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Service desk" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/staff$/);
  await expect(page.getByRole("heading", { name: "Service desk" })).toBeVisible();
});

test("an expired cookie session cannot open a protected dashboard", async ({ page }) => {
  await page.context().addCookies([
    {
      name: "kezek_session",
      value: "e2e-expired-session",
      url: "http://127.0.0.1:15173/api",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  await page.goto("/admin");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Administration" })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("kezek-session"))).toBeNull();
});
