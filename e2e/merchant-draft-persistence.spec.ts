import { expect, test } from "@playwright/test";

const baseUrl = process.env.E2E_BASE_URL;
const merchantEmail = process.env.E2E_MERCHANT_EMAIL;
const merchantPassword = process.env.E2E_MERCHANT_PASSWORD;

test.describe("isolated merchant draft persistence", () => {
  test.skip(
    !baseUrl || !merchantEmail || !merchantPassword,
    "Requires E2E_BASE_URL and isolated E2E_MERCHANT_EMAIL/E2E_MERCHANT_PASSWORD credentials.",
  );

  test("persists a draft across reload, logout, and login", async ({ page }) => {
    const uniqueTitle = `Playwright draft ${Date.now()}`;
    let bucketId = "";

    const login = async () => {
      await page.goto("/auth");
      await page.getByLabel("Email").fill(merchantEmail!);
      await page.getByLabel("Password").fill(merchantPassword!);
      await page.getByRole("button", { name: "Log in" }).click();
      await expect(page).toHaveURL(/\/dashboard/);
    };

    await login();

    try {
      const createResponse = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/buckets/create") && response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Create Post" }).first().click();
      const createPayload = await (await createResponse).json();
      bucketId = createPayload?.data?.bucket?.id ?? "";
      expect(bucketId).not.toBe("");

      const titleInput = page.getByPlaceholder("Give your post a name");
      await titleInput.fill(uniqueTitle);
      const updateResponse = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/buckets/${bucketId}`) &&
          response.request().method() === "PATCH",
      );
      await titleInput.blur();
      expect((await updateResponse).ok()).toBe(true);

      await page.reload();
      await expect(page.getByPlaceholder("Give your post a name")).toHaveValue(uniqueTitle);

      await page.getByRole("button", { name: "Logout" }).click();
      await expect(page).toHaveURL(/\/auth/);
      await login();
      await page.goto(`/dashboard#bucket-${bucketId}`);
      await expect(page.getByPlaceholder("Give your post a name")).toHaveValue(uniqueTitle);
    } finally {
      if (bucketId) {
        const trash = await page.request.post(`/api/buckets/${bucketId}/trash`);
        if (trash.ok()) {
          await page.request.delete(`/api/buckets/${bucketId}`);
        }
      }
    }
  });
});
