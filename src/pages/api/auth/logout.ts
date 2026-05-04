import type { APIRoute } from "astro";
import { clearSession, getRuntimeEnv, readSession, requireSameOrigin } from "../../../lib/auth";
import { writeAudit } from "../../../lib/audit";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
	const env = getRuntimeEnv(locals.runtime?.env);
	const secureCookie = new URL(request.url).protocol === "https:";
	const session = await readSession(request, env);
	const csrf = requireSameOrigin(request);
	if (csrf) return csrf;
	const cookie = await clearSession(env, secureCookie);
	if (session?.email) {
		await writeAudit(env, session.email, "sign_out", "session", 0, null, { email: session.email });
	}
	return new Response(null, {
		status: 204,
		headers: {
			"Set-Cookie": cookie
		}
	});
};
