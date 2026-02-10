import { expect, test } from "@playwright/test";
import { createSessionCookie } from "./helpers/session-cookie";

function memberCookie() {
	return createSessionCookie({
		email: "member@example.com",
		role: "member",
		name: "Member User"
	});
}

function adminCookie() {
	return createSessionCookie({
		email: "admin@example.com",
		role: "admin",
		name: "Admin User"
	});
}

test("authenticated member can read /api/me", async ({ request }) => {
	const response = await request.get("/api/me", {
		headers: { Cookie: memberCookie() }
	});
	expect(response.status()).toBe(200);
	const payload = await response.json();
	expect(payload.email).toBe("member@example.com");
	expect(payload.role).toBe("member");
});

test("authenticated member cannot access admin summary", async ({ request }) => {
	const response = await request.get("/api/admin/summary", {
		headers: { Cookie: memberCookie() }
	});
	expect(response.status()).toBe(403);
	await expect(response.text()).resolves.toContain("Admin access required.");
});

test("authenticated admin can read /api/me", async ({ request }) => {
	const response = await request.get("/api/me", {
		headers: { Cookie: adminCookie() }
	});
	expect(response.status()).toBe(200);
	const payload = await response.json();
	expect(payload.email).toBe("admin@example.com");
	expect(payload.role).toBe("admin");
});

test("authenticated member cannot call admin member mutation", async ({ request }) => {
	const response = await request.post("/api/admin/members", {
		headers: {
			"Content-Type": "application/json",
			Cookie: memberCookie()
		},
		data: { email: "new-member@example.com", role: "member" }
	});
	expect(response.status()).toBe(403);
	await expect(response.text()).resolves.toContain("Admin access required.");
});

test("favorite toggle validates payload when authenticated", async ({ request }) => {
	const response = await request.post("/api/games/favorite", {
		headers: {
			"Content-Type": "application/json",
			Cookie: memberCookie()
		},
		data: { id: "x", favorite: "yes" }
	});
	expect(response.status()).toBe(400);
	await expect(response.text()).resolves.toContain("Game id and favorite flag are required.");
});

test("rating submit validates payload when authenticated", async ({ request }) => {
	const response = await request.post("/api/games/rating", {
		headers: {
			"Content-Type": "application/json",
			Cookie: memberCookie()
		},
		data: { id: "bad", rating: 7 }
	});
	expect(response.status()).toBe(400);
	await expect(response.text()).resolves.toContain("Game id and valid rating are required.");
});

test("admin member mutation enforces payload validation when authenticated", async ({ request }) => {
	const response = await request.post("/api/admin/members", {
		headers: {
			"Content-Type": "application/json",
			Cookie: adminCookie()
		},
		data: { email: "not-an-email", role: "member" }
	});
	expect(response.status()).toBe(400);
	await expect(response.text()).resolves.toContain("Email and role are required.");
});
