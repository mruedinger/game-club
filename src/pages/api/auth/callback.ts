import type { APIRoute } from "astro";
import {
	clearOAuthState,
	createSession,
	exchangeGoogleCode,
	getRedirectUri,
	getMember,
	getRuntimeEnv,
	readOAuthState,
	updateMemberProfile
} from "../../../lib/auth";
import { writeAudit } from "../../../lib/audit";

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
		if (!member && !env.DB) {
			return new Response("Members database not configured.", { status: 500 });
		}
		if (!member) {
			return new Response(null, {
				status: 302,
				headers: { Location: "/auth/denied" }
			});
		}

		const role = member.role;
		await updateMemberProfile(env, email, name, picture);
		const sessionCookie = await createSession(
			env,
			{
				email,
				name: member.name || name,
				alias: member.alias,
				picture,
				role
			},
			secureCookie
		);
		const clearCookie = await clearOAuthState(secureCookie);

		const headers = new Headers({ Location: "/" });
		headers.append("Set-Cookie", sessionCookie);
		headers.append("Set-Cookie", clearCookie);
		await writeAudit(env, email, "sign_in", "session", 0, null, { email });
		return new Response(null, {
			status: 302,
			headers
		});
	} catch (error) {
		console.error("OAuth callback failed", error);
		return new Response("Authentication failed.", { status: 500 });
	}
};
