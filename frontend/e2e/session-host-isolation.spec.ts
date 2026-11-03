import { expect, test } from "@playwright/test";

const appOrigin = "http://127.0.0.1:15173";

test("staff session works on the Render hostname while customer pages stay available", async ({
  page,
  context,
}) => {
  await page.goto(`${appOrigin}/login`);
  await page.getByRole("textbox", { name: "Username" }).fill("admin");
  await page.getByLabel("Password").fill("admin123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(`${appOrigin}/admin`);
  await expect(page.getByRole("heading", { name: /admin/i }).first()).toBeVisible();

  const cookies = await context.cookies(`${appOrigin}/api`);
  expect(cookies.some((cookie) => cookie.name === "kezek_session")).toBe(true);

  await page.goto(appOrigin);
  await expect(
    page.getByRole("heading", { name: "Get your ticket online. Wait where it suits you." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /admin/i })).toBeVisible();
  const identityStatus = await page.evaluate(async () => (await fetch("/api/auth/me")).status);
  expect(identityStatus).toBe(200);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: /staff sign in/i })).toBeVisible();
  const anonymousIdentityStatus = await page.evaluate(
    async () => (await fetch("/api/auth/me")).status,
  );
  expect(anonymousIdentityStatus).toBe(401);
});
