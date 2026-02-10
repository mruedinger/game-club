import { expect, test } from "@playwright/test";

test("unauthenticated /api/me returns 401", async ({ request }) => {
	const response = await request.get("/api/me");
	expect(response.status()).toBe(401);
	await expect(response.text()).resolves.toContain("Authentication required.");
});

test("unauthenticated admin summary returns 401", async ({ request }) => {
	const response = await request.get("/api/admin/summary");
	expect(response.status()).toBe(401);
	await expect(response.text()).resolves.toContain("Authentication required.");
});

test("unauthenticated game create returns 401", async ({ request }) => {
	const response = await request.post("/api/games", {
		headers: { "Content-Type": "application/json" },
		data: { title: "Portal 2" }
	});
	expect(response.status()).toBe(401);
	await expect(response.text()).resolves.toContain("Authentication required.");
});

test("unauthenticated poll start returns 401", async ({ request }) => {
	const response = await request.post("/api/polls");
	expect(response.status()).toBe(401);
	await expect(response.text()).resolves.toContain("Authentication required.");
});

test("unauthenticated favorite toggle returns 401", async ({ request }) => {
	const response = await request.post("/api/games/favorite", {
		headers: { "Content-Type": "application/json" },
		data: { id: 1, favorite: true }
	});
	expect(response.status()).toBe(401);
	await expect(response.text()).resolves.toContain("Authentication required.");
});

test("unauthenticated rating submit returns 401", async ({ request }) => {
	const response = await request.post("/api/games/rating", {
		headers: { "Content-Type": "application/json" },
		data: { id: 1, rating: 5 }
	});
	expect(response.status()).toBe(401);
	await expect(response.text()).resolves.toContain("Authentication required.");
});

test("unauthenticated poll eligibility toggle returns 401", async ({ request }) => {
	const response = await request.post("/api/games/eligibility", {
		headers: { "Content-Type": "application/json" },
		data: { id: 1, poll_eligible: true }
	});
	expect(response.status()).toBe(401);
	await expect(response.text()).resolves.toContain("Authentication required.");
});

test("unauthenticated member admin mutation returns 401", async ({ request }) => {
	const response = await request.post("/api/admin/members", {
		headers: { "Content-Type": "application/json" },
		data: { email: "member@example.com", role: "member" }
	});
	expect(response.status()).toBe(401);
	await expect(response.text()).resolves.toContain("Authentication required.");
});
