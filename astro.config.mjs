// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
	adapter: cloudflare({
		imageService: "compile"
	}),
	output: "server",
	build: {
		client: "./",
		server: "./_worker.js"
	}
});
