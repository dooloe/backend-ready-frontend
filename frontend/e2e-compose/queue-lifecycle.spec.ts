import { expect, test } from "@playwright/test";

test("client ticket updates through staff call, service, and completion", async ({
  page,
  browser,
}) => {
  // Customer access is an anonymous private ticket session; the app has no client login flow.
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Get your ticket online. Wait where it suits you." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Universities", exact: true }).click();
  await page.getByRole("link", { name: "View Services" }).click();
  const service = page.locator("article").filter({ hasText: "Enrollment certificate" });
  await expect(service).toHaveCount(1);
  await service.getByRole("link", { name: "Get a ticket" }).click();
  await page.getByRole("button", { name: "Get a ticket", exact: true }).click();
  await expect(page).toHaveURL(/\/ticket\//);
  await expect(page.getByRole("heading", { name: "You’re in the queue" })).toBeVisible();

  // A separate browser context keeps the staff session independent of the client ticket.
  const staffContext = await browser.newContext();
  try {
    const staff = await staffContext.newPage();
    await staff.goto(`${new URL(page.url()).origin}/login`);
    await staff.getByLabel("Username").fill("demo-staff-university");
    await staff.getByLabel("Password").fill("staff123");
    await staff.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(staff.getByRole("heading", { name: "Service desk" })).toBeVisible();

    await staff.getByRole("button", { name: "Call Next", exact: true }).click();
    await expect(page.getByRole("heading", { name: "It’s your turn!" })).toBeVisible({
      timeout: 15000,
    });

    await staff.getByRole("button", { name: "Start service", exact: true }).click();
    await expect(page.getByRole("heading", { name: "You’re being served" })).toBeVisible({
      timeout: 15000,
    });

    await staff.getByRole("button", { name: "Complete Service", exact: true }).click();
    await expect(page.getByRole("heading", { name: "All done. Enjoy your day!" })).toBeVisible({
      timeout: 15000,
    });
  } finally {
    await staffContext.close();
  }
});
