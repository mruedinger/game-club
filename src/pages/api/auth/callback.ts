import type { APIRoute } from "astro";
import {
	clearOAuthState,
	createSession,
	exchangeGoogleCode,
	getRedirectUri,
	getMember,
	getRole,
	getRuntimeEnv,
	isAllowedEmail,
	readOAuthState
} from "../../../lib/auth";

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
	const env = getRuntimeEnv(locals.runtime?.env);
	const url = new URL(request.url);
	const secureCookie = url.protocol === "https:";
	const error = url.searchParams.get("error");
	if (error) {
		return new Response(`OAuth error: ${error}`, { status: 400 });
	}

	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");
	if (!code || !state) {
		return new Response("Missing OAuth parameters.", { status: 400 });
	}

	const oauthState = await readOAuthState(request, env);
	if (!oauthState || oauthState.state !== state) {
		return new Response("Invalid OAuth state.", { status: 400 });
	}

	try {
		const redirectUri = getRedirectUri(env);
		const { email, name, picture, emailVerified } = await exchangeGoogleCode(
			env,
			redirectUri,
			code,
			oauthState
		);

		if (!email || !emailVerified) {
			return new Response("Email not verified.", { status: 403 });
		}

		const member = await getMember(env, email);
		if (!member && !isAllowedEmail(env, email)) {
			return new Response(null, {
				status: 302,
				headers: { Location: "/auth/denied" }
			});
		}

		const role = member?.role ?? getRole(env, email);
		const sessionCookie = await createSession(
			env,
			{
				email,
				name: member?.name || name,
				picture,
				role,
				exp: Date.now() + 1000 * 60 * 60 * 24 * 7
			},
			secureCookie
		);
		const clearCookie = await clearOAuthState(secureCookie);

		const headers = new Headers({ Location: "/" });
		headers.append("Set-Cookie", sessionCookie);
		headers.append("Set-Cookie", clearCookie);
		return new Response(null, {
			status: 302,
			headers
		});
	} catch (error) {
		console.error("OAuth callback failed", error);
		return new Response("Authentication failed.", { status: 500 });
	}
};
