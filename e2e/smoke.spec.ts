import { expect, test } from "@playwright/test";

test("a player's correct group pick shows up on the leaderboard", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Player").selectOption("Player 1");
  await page.getByLabel("League PIN").fill("demo-league");
  await page.getByRole("button", { name: "Open picks" }).click();
  await expect(page.getByRole("heading", { name: "Group-stage picks" })).toBeVisible();

  const saved = page.waitForResponse((response) => response.url().endsWith("/api/picks") && response.ok());
  await page.getByRole("group", { name: "Mexico against South Africa" }).getByRole("button", { name: "1", exact: true }).click();
  await saved;

  await page.goto("/#/admin");
  await page.getByLabel("Admin PIN").fill("demo-admin");
  await page.getByRole("button", { name: "Unlock admin" }).click();
  const match = page.locator("div").filter({ has: page.getByText("Group A · A-1", { exact: true }) }).last();
  const resultSaved = page.waitForResponse((response) => response.url().endsWith("/api/admin/results") && response.ok());
  await match.getByRole("button", { name: "1", exact: true }).click();
  await resultSaved;

  await page.goto("/#/leaderboard");
  const leader = page.getByRole("row").filter({ hasText: "Player 1" });
  await expect(leader.getByRole("cell").last()).toHaveText("1");
});
