import type { APIRoute } from "astro";
import {
	buildGoogleAuthRedirect,
	getRedirectUri,
	getRuntimeEnv
} from "../../../lib/auth";

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
	const env = getRuntimeEnv(locals.runtime?.env);
	const redirectUri = getRedirectUri(env);
	const secureCookie = new URL(request.url).protocol === "https:";
	const { url, cookie } = await buildGoogleAuthRedirect(env, redirectUri, secureCookie);

	return new Response(null, {
		status: 302,
		headers: {
			Location: url.toString(),
			"Set-Cookie": cookie
		}
	});
};
