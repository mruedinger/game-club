import { test, expect } from "@playwright/test";

test("home page loads", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByRole("banner")).toBeVisible();
	await expect(page.getByRole("navigation")).toContainText("Games");
});

test("games page loads", async ({ page }) => {
	await page.goto("/games");
	await expect(page.getByRole("heading", { name: "Backlog", exact: true })).toBeVisible();
	await expect(page.locator("table.games-table")).toBeVisible();
});

test("denied page loads", async ({ page }) => {
	await page.goto("/auth/denied");
	await expect(page.getByRole("link", { name: /return home/i })).toBeVisible();
});
