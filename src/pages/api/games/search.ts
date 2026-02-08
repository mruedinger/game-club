import type { APIRoute } from "astro";
import { fetchWithTimeoutRetry } from "../../../lib/http";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
	const term = url.searchParams.get("term");
	if (!term) {
		return new Response(JSON.stringify({ results: [] }), {
			status: 200,
			headers: { "Content-Type": "application/json" }
		});
	}

	let response: Response;
	try {
		response = await fetchWithTimeoutRetry(
			`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&l=en&cc=us`,
			{},
			{ timeoutMs: 1200, retries: 0 }
		);
	} catch {
		return new Response(JSON.stringify({ results: [] }), {
			status: 200,
			headers: { "Content-Type": "application/json" }
		});
	}

	if (!response.ok) {
		return new Response(JSON.stringify({ results: [] }), {
			status: 200,
			headers: { "Content-Type": "application/json" }
		});
	}

	const data = await response.json();
	const results = Array.isArray(data.items)
		? data.items
				.filter((item) => item.type === "app")
				.slice(0, 5)
				.map((item) => ({
					name: item.name,
					steamId: item.id,
					cover: item.tiny_image
				}))
		: [];

	return new Response(JSON.stringify({ results }), {
		status: 200,
		headers: { "Content-Type": "application/json" }
	});
};
