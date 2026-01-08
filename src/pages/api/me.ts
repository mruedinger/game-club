import type { APIRoute } from "astro";
import { getRuntimeEnv, readSession } from "../../lib/auth";

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
	const env = getRuntimeEnv(locals.runtime?.env);
	const session = await readSession(request, env);
	if (!session) {
		return new Response("Authentication required.", { status: 401 });
	}
	return new Response(
		JSON.stringify({
			email: session.email,
			name: session.name,
			role: session.role,
			picture: session.picture
		}),
		{
			status: 200,
			headers: { "Content-Type": "application/json" }
		}
	);
};
