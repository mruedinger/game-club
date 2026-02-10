import { test, expect } from "@playwright/test";

test("home page loads", async ({ request }) => {
	const response = await request.get("/");
	expect(response.status()).toBe(200);
	const html = await response.text();
	expect(html).toContain("<header");
	expect(html).toContain("Game Club");
	expect(html).not.toContain(">Games<");
});

test("home page shows backlog and played sections", async ({ request }) => {
	const response = await request.get("/");
	expect(response.status()).toBe(200);
	const html = await response.text();
	expect(html).toContain("Backlog");
	expect(html).toContain("MC Score");
	expect(html).toContain("games-table");
	expect(html).toContain("Played");
});

test("denied page loads", async ({ request }) => {
	const response = await request.get("/auth/denied");
	expect(response.status()).toBe(200);
	const html = await response.text();
	expect(html).toContain("Return Home");
});
