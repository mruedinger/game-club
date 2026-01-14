import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "tests/e2e",
	timeout: 30_000,
	expect: {
		timeout: 5_000
	},
	use: {
		baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:4321",
		headless: true
	},
	reporter: "list"
});
