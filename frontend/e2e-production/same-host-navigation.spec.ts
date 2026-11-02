import { expect, test } from "@playwright/test";

test("production build keeps staff and admin navigation on one host, including refreshes", async ({
  page,
}) => {
  const failedRequests: string[] = [];
  page.on("requestfailed", (request) => failedRequests.push(request.url()));

  const root = await page.goto("/");
  expect(root?.status()).toBe(200);
  const origin = new URL(page.url()).origin;

  const staffSignIn = page.getByRole("link", { name: "Staff sign in" });
  await expect(staffSignIn).toBeVisible();
  await expect(staffSignIn).toHaveAttribute("href", "/login");
  await staffSignIn.click();
  await expect(page).toHaveURL(`${origin}/login`);
  await expect(page.getByRole("heading", { name: "Staff sign in" })).toBeVisible();

  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password").fill("admin123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(`${origin}/admin`);
  await expect(page.getByRole("heading", { name: "Administration" })).toBeVisible();

  const staffNavigation = page.getByRole("link", { name: "Staff", exact: true });
  await staffNavigation.click();
  await expect(page).toHaveURL(`${origin}/staff`);
  await expect(page.getByRole("heading", { name: "Service desk" })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(`${origin}/staff`);
  await expect(page.getByRole("heading", { name: "Service desk" })).toBeVisible();

  await page.goto("/admin");
  await expect(page).toHaveURL(`${origin}/admin`);
  await expect(page.getByRole("heading", { name: "Administration" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Administration" })).toBeVisible();

  const organization = await page.goto("/organizations/demo-university");
  expect(organization?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: /University/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: /University/ })).toBeVisible();

  const unknownApi = await page.request.get("/api/unknown-production-route", {
    headers: { Accept: "text/html" },
  });
  expect(unknownApi.status()).toBe(404);
  expect(unknownApi.headers()["content-type"]).toContain("application/json");
  expect(await unknownApi.json()).toMatchObject({ code: "NOT_FOUND", message: "Not found" });
  expect(failedRequests).toEqual([]);
});
