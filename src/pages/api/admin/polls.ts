import type { APIRoute } from "astro";
import { getRuntimeEnv, readSession } from "../../../lib/auth";
import { writeAudit } from "../../../lib/audit";

type PollHistoryRow = {
	id: number;
	started_at: string;
	closed_at: string;
	history_valid?: number | null;
	voter_count: number;
	winner_title?: string | null;
};

type PollResultRow = {
	game_id: number;
	title: string;
	points: number;
};

type D1Database = {
	prepare: (query: string) => {
		bind: (...args: unknown[]) => {
			all: <T>() => Promise<{ results: T[] }>;
			first: <T>() => Promise<T | null>;
			run: () => Promise<{ success: boolean; meta?: { changes?: number } }>;
		};
	};
	batch: (
		statements: Array<{
			all: <T>() => Promise<{ results: T[] }>;
			first: <T>() => Promise<T | null>;
			run: () => Promise<{ success: boolean; meta?: { changes?: number } }>;
		}>
	) => Promise<unknown>;
};

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
	const { db, error } = await requireAdmin(request, locals);
	if (!db) return error!;

	const url = new URL(request.url);
	const id = normalizeId(url.searchParams.get("id"));
	if (id) {
		const poll = await getPollHistoryRow(db, id);
		if (!poll) {
			return new Response("Poll not found.", { status: 404 });
		}
		const results = await getPollResults(db, id);
		return jsonResponse({
			poll: {
				...poll,
				history_valid: poll.history_valid === 1
			},
			results
		});
	}

	const rows = await listPollHistory(db);
	return jsonResponse(
		rows.map((row) => ({
			...row,
			history_valid: row.history_valid === 1
		}))
	);
};

export const PATCH: APIRoute = async ({ request, locals }) => {
	const { session, db, env, error } = await requireAdmin(request, locals);
	if (!session || !db || !env) return error!;

	const body = await readJson(request);
	const id = normalizeId(body?.id);
	if (!id || typeof body?.history_valid !== "boolean") {
		return new Response("Poll id and validity are required.", { status: 400 });
	}

	const existing = await getPollHistoryRow(db, id);
	if (!existing) {
		return new Response("Poll not found.", { status: 404 });
	}

	const nextValid = body.history_valid ? 1 : 0;
	await db
		.prepare("update polls set history_valid = ?1 where id = ?2 and status = 'closed'")
		.bind(nextValid, id)
		.run();

	if ((existing.history_valid === 1 ? 1 : 0) !== nextValid) {
		await writeAudit(
			env,
			session.email,
			"poll_history_validity_update",
			"poll",
			id,
			{ history_valid: existing.history_valid === 1 },
			{ history_valid: nextValid === 1 }
		);
	}

	return new Response(null, { status: 204 });
};

export const DELETE: APIRoute = async ({ request, locals }) => {
	const { session, db, env, error } = await requireAdmin(request, locals);
	if (!session || !db || !env) return error!;

	const body = await readJson(request);
	const id = normalizeId(body?.id);
	if (!id) {
		return new Response("Poll id is required.", { status: 400 });
	}

	const existing = await getPollHistoryRow(db, id);
	if (!existing) {
		return new Response("Poll not found.", { status: 404 });
	}

	await db.batch([
		db.prepare("delete from poll_votes where poll_id = ?1").bind(id),
		db.prepare("delete from poll_games where poll_id = ?1").bind(id),
		db.prepare("delete from polls where id = ?1 and status = 'closed'").bind(id)
	]);

	await writeAudit(env, session.email, "poll_history_delete", "poll", id, existing, null);
	return new Response(null, { status: 204 });
};

async function listPollHistory(db: D1Database) {
	const { results } = await db
		.prepare(
			"select polls.id, polls.started_at, polls.closed_at, polls.history_valid, " +
				"(select count(distinct poll_votes.voter_email) from poll_votes where poll_votes.poll_id = polls.id) as voter_count, " +
				"(select games.title " +
					"from poll_games " +
					"join games on games.id = poll_games.game_id " +
					"left join poll_votes on poll_votes.poll_id = poll_games.poll_id " +
					"where poll_games.poll_id = polls.id " +
					"group by games.id " +
					"order by " +
					"sum(case when poll_votes.choice_1 = games.id then 3 else 0 end + " +
					"case when poll_votes.choice_2 = games.id then 2 else 0 end + " +
					"case when poll_votes.choice_3 = games.id then 1 else 0 end) desc, games.title asc " +
					"limit 1) as winner_title " +
				"from polls " +
				"where polls.status = 'closed' " +
				"order by polls.closed_at desc, polls.id desc"
		)
		.bind()
		.all<PollHistoryRow>();
	return results;
}

async function getPollHistoryRow(db: D1Database, id: number) {
	return db
		.prepare(
			"select polls.id, polls.started_at, polls.closed_at, polls.history_valid, " +
				"(select count(distinct poll_votes.voter_email) from poll_votes where poll_votes.poll_id = polls.id) as voter_count, " +
				"(select games.title " +
					"from poll_games " +
					"join games on games.id = poll_games.game_id " +
					"left join poll_votes on poll_votes.poll_id = poll_games.poll_id " +
					"where poll_games.poll_id = polls.id " +
					"group by games.id " +
					"order by " +
					"sum(case when poll_votes.choice_1 = games.id then 3 else 0 end + " +
					"case when poll_votes.choice_2 = games.id then 2 else 0 end + " +
					"case when poll_votes.choice_3 = games.id then 1 else 0 end) desc, games.title asc " +
					"limit 1) as winner_title " +
				"from polls " +
				"where polls.id = ?1 and polls.status = 'closed' " +
				"limit 1"
		)
		.bind(id)
		.first<PollHistoryRow>();
}

async function getPollResults(db: D1Database, pollId: number) {
	const { results } = await db
		.prepare(
			"select games.id as game_id, games.title as title, " +
				"sum(case when poll_votes.choice_1 = games.id then 3 else 0 end + " +
				"case when poll_votes.choice_2 = games.id then 2 else 0 end + " +
				"case when poll_votes.choice_3 = games.id then 1 else 0 end) as points " +
				"from poll_games " +
				"join games on games.id = poll_games.game_id " +
				"left join poll_votes on poll_votes.poll_id = poll_games.poll_id " +
				"where poll_games.poll_id = ?1 " +
				"group by games.id " +
				"order by points desc, games.title asc"
		)
		.bind(pollId)
		.all<PollResultRow>();
	return results.map((row) => ({ ...row, points: row.points ?? 0 }));
}

async function requireAdmin(request: Request, locals: App.Locals) {
	const env = getRuntimeEnv(locals.runtime?.env);
	const session = await readSession(request, env);
	if (!session) {
		return { session: null, db: null, env: null, error: new Response("Authentication required.", { status: 401 }) };
	}
	if (session.role !== "admin") {
		return { session: null, db: null, env: null, error: new Response("Admin access required.", { status: 403 }) };
	}
	const db = getDb(env);
	if (!db) {
		return { session, db: null, env, error: new Response("Poll database not configured.", { status: 500 }) };
	}
	return { session, db, env, error: null };
}

function getDb(env: Record<string, unknown>): D1Database | undefined {
	const value = env.DB;
	if (value && typeof value === "object") {
		return value as D1Database;
	}
	return undefined;
}

function normalizeId(value: unknown): number | null {
	if (typeof value === "number" && Number.isInteger(value)) return value;
	if (typeof value === "string") {
		const parsed = Number.parseInt(value, 10);
		return Number.isNaN(parsed) ? null : parsed;
	}
	return null;
}

async function readJson(
	request: Request
): Promise<{ id?: string | number; history_valid?: boolean } | null> {
	const text = await request.text();
	if (!text) return null;
	try {
		return JSON.parse(text) as { id?: string | number; history_valid?: boolean };
	} catch {
		return null;
	}
}

function jsonResponse(payload: unknown, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" }
	});
}
