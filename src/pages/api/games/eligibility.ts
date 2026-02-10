import type { APIRoute } from "astro";
import { getRuntimeEnv, readSession } from "../../../lib/auth";
import { writeAudit } from "../../../lib/audit";

type GameRow = {
	id: number;
	title: string;
	submitted_by_email: string;
	status: "backlog" | "current" | "played";
	poll_eligible?: number | null;
};

type D1Database = {
	prepare: (query: string) => {
		bind: (...args: unknown[]) => {
			first: <T>() => Promise<T | null>;
			run: () => Promise<{ success: boolean; meta?: { changes?: number } }>;
		};
	};
};

const MAX_ELIGIBLE_PER_MEMBER = 2;

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
	const env = getRuntimeEnv(locals.runtime?.env);
	const session = await readSession(request, env);
	if (!session) {
		return new Response("Authentication required.", { status: 401 });
	}

	const body = await readJson(request);
	const id = normalizeGameId(body?.id);
	const pollEligible = body?.poll_eligible;
	if (!id || typeof pollEligible !== "boolean") {
		return new Response("Game id and poll eligibility flag are required.", { status: 400 });
	}

	const db = getDb(env);
	if (!db) {
		return new Response("Games database not configured.", { status: 500 });
	}

	const game = await db
		.prepare("select id, title, submitted_by_email, status, poll_eligible from games where id = ?1")
		.bind(id)
		.first<GameRow>();
	if (!game) {
		return new Response("Game not found.", { status: 404 });
	}

	const actorEmail = session.email.toLowerCase();
	const isAdmin = session.role === "admin";
	const isOwner = game.submitted_by_email === actorEmail;
	if (!isOwner && !isAdmin) {
		return new Response("Not authorized.", { status: 403 });
	}

	if (pollEligible && game.status !== "backlog") {
		return new Response("Only backlog games can be marked poll eligible.", { status: 400 });
	}

	const beforeEligible = toEligibilityState(game.poll_eligible);
	const nextEligible = game.status === "backlog" ? (pollEligible ? 1 : 0) : null;

	if (nextEligible === 1) {
		const eligibleCount = await db
			.prepare(
				"select count(*) as count from games where submitted_by_email = ?1 and status = 'backlog' and poll_eligible = 1 and id != ?2"
			)
			.bind(game.submitted_by_email, id)
			.first<{ count: number }>();
		if ((eligibleCount?.count ?? 0) >= MAX_ELIGIBLE_PER_MEMBER) {
			return new Response("You already have 2 poll-eligible backlog games. Mark one ineligible first.", {
				status: 409
			});
		}
	}

	await db
		.prepare("update games set poll_eligible = ?1 where id = ?2")
		.bind(nextEligible, id)
		.run();

	const afterEligible = toEligibilityState(nextEligible);
	if (beforeEligible !== afterEligible) {
		await writeAudit(
			env,
			session.email,
			"game_poll_eligibility_update",
			"game",
			id,
			{ poll_eligible: beforeEligible },
			{ poll_eligible: afterEligible }
		);
	}

	return new Response(null, { status: 204 });
};

function toEligibilityState(value: number | null | undefined): boolean | null {
	if (value === 1) return true;
	if (value === 0) return false;
	return null;
}

function getDb(env: Record<string, unknown>): D1Database | undefined {
	const value = env.DB;
	if (value && typeof value === "object") {
		return value as D1Database;
	}
	return undefined;
}

async function readJson(
	request: Request
): Promise<{ id?: string | number; poll_eligible?: boolean } | null> {
	const text = await request.text();
	if (!text) return null;
	try {
		return JSON.parse(text) as { id?: string | number; poll_eligible?: boolean };
	} catch {
		return null;
	}
}

function normalizeGameId(value: unknown): number | null {
	if (typeof value === "number" && Number.isInteger(value)) return value;
	if (typeof value === "string") {
		const parsed = Number.parseInt(value, 10);
		if (!Number.isNaN(parsed)) return parsed;
	}
	return null;
}
