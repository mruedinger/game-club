import { test, expect } from "@playwright/test";

test("home page loads", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByRole("banner")).toBeVisible();
	await expect(page.getByRole("navigation")).toContainText("Games");
});

test("games page loads", async ({ page }) => {
	await page.goto("/games");
	await expect(page.getByRole("heading", { name: /backlog/i })).toBeVisible();
	await expect(page.locator("table.games-table")).toBeVisible();
});

test("denied page loads", async ({ page }) => {
	await page.goto("/auth/denied");
	await expect(page.getByRole("button", { name: /return home/i })).toBeVisible();
});
