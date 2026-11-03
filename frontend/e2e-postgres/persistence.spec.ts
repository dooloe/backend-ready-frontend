import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

test("Compose app serves the frontend and migrated, seeded PostgreSQL API", async ({ page }) => {
  const schema = await page.request.get("/openapi.json");
  expect(schema.ok()).toBeTruthy();
  expect((await schema.json()).info.title).toBe("Kezek API");

  const organizations = await page.request.get("/api/organizations");
  expect(organizations.ok()).toBeTruthy();
  expect(await organizations.json()).toEqual(
    expect.arrayContaining([expect.objectContaining({ name: "Almaty University · Demo" })]),
  );

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Get your ticket online. Wait where it suits you." }),
  ).toBeVisible({ timeout: 30000 });
});

async function waitForApp(page: import("@playwright/test").Page) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const response = await page.request.get("/", { headers: { Accept: "text/html" } });
      if (response.ok()) return;
    } catch {
      // The app can briefly refuse connections while its container starts.
    }
    await page.waitForTimeout(500);
  }
  throw new Error("Application did not become ready after container recreation");
}

function recreate(service: "app" | "db") {
  const project = process.env.COMPOSE_PROJECT_NAME;
  if (!project) throw new Error("COMPOSE_PROJECT_NAME must identify this isolated test stack");
  execFileSync(
    "docker",
    [
      "compose",
      "-p",
      project,
      "-f",
      "docker-compose.yaml",
      "-f",
      "compose.test.yaml",
      "up",
      "-d",
      "--wait",
      "--force-recreate",
      service,
    ],
    {
      cwd: process.env.KEZEK_REPO_ROOT ?? process.cwd(),
      stdio: "inherit",
    },
  );
}

test("PostgreSQL customer writes survive application and database container recreation", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Get your ticket online. Wait where it suits you." }),
  ).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "Universities", exact: true }).click();
  await page.getByRole("link", { name: "View Services" }).click();
  const service = page.locator("article").filter({ hasText: "Enrollment certificate" });
  await expect(service).toHaveCount(1);
  await service.getByRole("link", { name: "Get a ticket" }).click();
  await page.getByRole("button", { name: "Get a ticket", exact: true }).click();
  await expect(page).toHaveURL(/\/ticket\//);
  await expect(page.getByRole("heading", { name: "You’re in the queue" })).toBeVisible();
  const ticketUrl = page.url();

  recreate("app");
  await waitForApp(page);
  await page.goto(ticketUrl);
  await expect(page.getByRole("heading", { name: "You’re in the queue" })).toBeVisible({
    timeout: 30000,
  });

  const staff = await page.context().newPage();
  await staff.goto("/login");
  await staff.getByLabel("Username").fill("demo-staff-university");
  await staff.getByLabel("Password").fill("staff123");
  await staff.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(staff.getByRole("heading", { name: "Service desk" })).toBeVisible();
  await staff.getByRole("button", { name: "Call Next", exact: true }).click();
  await expect(page.getByRole("heading", { name: "It’s your turn!" })).toBeVisible({
    timeout: 15000,
  });

  recreate("db");
  await waitForApp(page);
  await page.goto(ticketUrl);
  await expect(page.getByRole("heading", { name: "It’s your turn!" })).toBeVisible({
    timeout: 45000,
  });
  await staff.reload();
  await expect(staff.getByRole("heading", { name: "Service desk" })).toBeVisible({
    timeout: 15000,
  });
  await staff.close();
});
