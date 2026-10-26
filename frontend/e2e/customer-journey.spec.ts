import { test, expect, type Page } from "@playwright/test";

async function join(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Skip the waiting. Keep your place." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Universities", exact: true }).click();
  await expect(page.locator("article")).toHaveCount(1);
  await page.getByRole("link", { name: "View Services" }).click();
  await expect(page.getByRole("heading", { name: "Almaty University · Demo" })).toBeVisible();
  await page.getByRole("link", { name: "Join Queue" }).click();
  await expect(page.getByRole("heading", { name: "Confirm your place" })).toBeVisible();
  await expect(page.locator("input")).toHaveCount(0);
  await page.getByRole("button", { name: "Confirm & join queue" }).click();
  await expect(page).toHaveURL(/\/ticket\//);
  await expect(page.getByRole("heading", { name: "You’re in the queue" })).toBeVisible();
  return page.url();
}

test("discover, join, track position, staff call/start/complete, and private browser history", async ({
  page,
  browser,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const firstUrl = await join(page);
  await expect(page.getByText("People ahead of you")).toBeVisible();
  await expect(page.locator("body")).not.toHaveText(/Mock API/);
  await page.screenshot({ path: info.outputPath("ticket.png"), fullPage: true });
  const second = await page.context().newPage();
  await join(second);
  await expect(
    second.getByText("People ahead of you").locator("..").getByText("1", { exact: true }),
  ).toBeVisible();

  const staffContext = await browser.newContext();
  const staff = await staffContext.newPage();
  await staff.goto("http://127.0.0.1:15173/login");
  await staff.getByLabel("Username").fill("demo-staff-university");
  await staff.getByLabel("Password").fill("staff123");
  await staff.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(staff.getByRole("heading", { name: "Service desk" })).toBeVisible();
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
  await second.getByRole("button", { name: "Cancel Ticket", exact: true }).click();
  await expect(second.getByRole("alertdialog")).toBeVisible();
  await second.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(second.getByRole("heading", { name: "Your ticket is cancelled" })).toBeVisible();
  await expect(staff.getByRole("button", { name: "Call Next", exact: true })).toBeDisabled({
    timeout: 12000,
  });
  await page.goto("/tickets");
  await expect(
    page.locator("main").getByRole("link").filter({ hasText: "Student services" }),
  ).toHaveCount(2);

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
  await expect(page.getByRole("button", { name: "Confirm & join queue" })).toBeDisabled();
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
});

test("staff no-show confirmation and essential admin configuration", async ({ page, browser }) => {
  await page.goto("/join/demo-clinic/demo-svc-clinic");
  await page.getByRole("button", { name: "Confirm & join queue" }).click();
  await expect(page.getByRole("heading", { name: "You’re in the queue" })).toBeVisible();
  const context = await browser.newContext();
  const staff = await context.newPage();
  await staff.goto("http://127.0.0.1:15173/login");
  await staff.getByLabel("Username").fill("demo-staff-clinic");
  await staff.getByLabel("Password").fill("staff123");
  await staff.getByRole("button", { name: "Sign in", exact: true }).click();
  await staff.getByRole("button", { name: "Call Next", exact: true }).click();
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
  await staff.goto("http://127.0.0.1:15173/login");
  await staff.getByLabel("Username").fill("admin");
  await staff.getByLabel("Password").fill("wrong");
  await staff.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(staff.getByRole("alert")).toContainText("Invalid username or password");
  await staff.getByLabel("Password").fill("admin123");
  await staff.getByRole("button", { name: "Sign in", exact: true }).click();
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
  await context.close();
});
