import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "tests/e2e",
	timeout: 30_000,
	expect: {
		timeout: 5_000
	},
	use: {
		baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:4321",
		headless: true
	},
	webServer: {
		command:
			"HOME=/tmp XDG_CONFIG_HOME=/tmp XDG_DATA_HOME=/tmp WRANGLER_HOME=/tmp/wrangler npm run dev -- --host 127.0.0.1 --port 4321",
		url: "http://127.0.0.1:4321",
		reuseExistingServer: !process.env.CI,
		timeout: 120_000
	},
	reporter: "list"
});
