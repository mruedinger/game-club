import type { MiddlewareHandler } from "astro";
import { consumePendingSessionCookie } from "./lib/auth";

export const onRequest: MiddlewareHandler = async (context, next) => {
	const response = await next();
	const pendingCookie = consumePendingSessionCookie(context.request);
	if (!pendingCookie) {
		return response;
	}
	if (response.headers.has("Set-Cookie")) {
		return response;
	}

	const headers = new Headers(response.headers);
	headers.append("Set-Cookie", pendingCookie);
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers
	});
};
