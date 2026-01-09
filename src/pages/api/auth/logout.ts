import type { APIRoute } from "astro";
import { clearSession, getRuntimeEnv } from "../../../lib/auth";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
	const env = getRuntimeEnv(locals.runtime?.env);
	const secureCookie = new URL(request.url).protocol === "https:";
	const cookie = await clearSession(env, secureCookie);
	return new Response(null, {
		status: 204,
		headers: {
			"Set-Cookie": cookie
		}
	});
};
