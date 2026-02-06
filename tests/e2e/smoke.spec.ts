import { test, expect } from "@playwright/test";

test("home page loads", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByRole("banner")).toBeVisible();
	await expect(page.getByRole("navigation")).not.toContainText("Games");
});

test("home page shows backlog and played sections", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByRole("heading", { name: "Backlog", exact: true })).toBeVisible();
	await expect(page.locator("table.games-table")).toBeVisible();
	await expect(page.getByRole("heading", { name: "Played", exact: true })).toBeVisible();
});

test("denied page loads", async ({ page }) => {
	await page.goto("/auth/denied");
	await expect(page.getByRole("link", { name: /return home/i })).toBeVisible();
});
