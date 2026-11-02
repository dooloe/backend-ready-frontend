import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

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
      "compose.yaml",
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
