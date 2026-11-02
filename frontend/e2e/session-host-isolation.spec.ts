import { expect, test } from "@playwright/test";

const customerOrigin = "http://127.0.0.1:15173";
const adminOrigin = "http://localhost:15173";

test("admin session stays on the staff hostname and customer pages remain public", async ({
  page,
  context,
}) => {
  await page.goto(`${customerOrigin}/login`);
  await expect(page).toHaveURL(`${adminOrigin}/login`);
  await page.getByRole("textbox", { name: "Username" }).fill("admin");
  await page.getByLabel("Password").fill("admin123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(`${adminOrigin}/admin`);
  await expect(page.getByRole("heading", { name: /admin/i }).first()).toBeVisible();

  const adminCookies = await context.cookies(adminOrigin);
  const customerCookies = await context.cookies(customerOrigin);
  expect(adminCookies.some((cookie) => cookie.name === "kezek_session")).toBe(true);
  expect(customerCookies.some((cookie) => cookie.name === "kezek_session")).toBe(false);

  const customerPage = await context.newPage();
  await customerPage.goto(customerOrigin);
  await expect(customerPage.getByRole("link", { name: /staff sign in/i })).toBeVisible();
  await expect(customerPage.getByRole("link", { name: /admin/i })).toHaveCount(0);
  const identityStatus = await customerPage.evaluate(
    async () => (await fetch("/api/auth/me")).status,
  );
  expect(identityStatus).toBe(401);
  const customerLoginStatus = await customerPage.evaluate(async () => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "admin123" }),
    });
    return response.status;
  });
  expect(customerLoginStatus).toBe(403);
  await customerPage.close();
});
