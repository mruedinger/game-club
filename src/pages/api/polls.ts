import type { APIRoute } from "astro";
import { getRuntimeEnv, readSession } from "../../lib/auth";
import { writeAudit } from "../../lib/audit";

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

type PollRow = {
	id: number;
	status: "active" | "closed";
	started_at: string;
	closed_at?: string;
	history_valid?: number | null;
};

type PollChoice = {
	id: number;
	title: string;
	is_favorite?: number;
};

export const prerender = false;

export const GET: APIRoute = async ({ locals, request }) => {
	const env = getRuntimeEnv(locals.runtime?.env);
	const db = getDb(env);
	if (!db) {
		return new Response("Polls database not configured.", { status: 500 });
	}

	const activePoll = await db
		.prepare("select id, status, started_at, closed_at, history_valid from polls where status = 'active' limit 1")
		.bind()
		.first<PollRow>();

	if (activePoll) {
		const session = await readSession(request, env);
		const voterEmail = session?.email?.toLowerCase() ?? "";
		const existingVote = voterEmail
			? await db
					.prepare("select id from poll_votes where poll_id = ?1 and voter_email = ?2")
					.bind(activePoll.id, voterEmail)
					.first<{ id: number }>()
			: null;
		const hasVoted = Boolean(existingVote);
		const choices = await db
			.prepare(
				"select games.id, games.title, case when game_favorites.game_id is null then 0 else 1 end as is_favorite " +
					"from poll_games " +
					"join games on games.id = poll_games.game_id " +
					"left join game_favorites on game_favorites.game_id = games.id and game_favorites.member_email = ?2 " +
					"where poll_games.poll_id = ?1 " +
					"order by games.title asc"
			)
			.bind(activePoll.id, voterEmail)
			.all<PollChoice>();

		const results = hasVoted
			? await getPollResults(db, activePoll.id)
			: [];

		return jsonResponse({
			active: true,
			poll: activePoll,
			hasVoted,
			choices: choices.results,
			results
		});
	}

	const lastPoll = await db
		.prepare(
			"select id, status, started_at, closed_at, history_valid from polls where status = 'closed' order by closed_at desc limit 1"
		)
		.bind()
		.first<PollRow>();

	const lastResults = lastPoll ? await getPollResults(db, lastPoll.id) : [];

	return jsonResponse({
		active: false,
		poll: lastPoll,
		results: lastResults
	});
};

export const POST: APIRoute = async ({ locals, request }) => {
	const env = getRuntimeEnv(locals.runtime?.env);
	const session = await readSession(request, env);
	if (!session) {
		return new Response("Authentication required.", { status: 401 });
	}

	const db = getDb(env);
	if (!db) {
		return new Response("Polls database not configured.", { status: 500 });
	}

	const existing = await db
		.prepare("select id from polls where status = 'active' limit 1")
		.bind()
		.first<{ id: number }>();
	if (existing) {
		return new Response("Poll already active.", { status: 409 });
	}

	const backlogGames = await db
		.prepare("select id from games where status = 'backlog' and poll_eligible = 1 order by title asc")
		.bind()
		.all<{ id: number }>();

	if (backlogGames.results.length === 0) {
		return new Response("No poll-eligible backlog games available.", { status: 400 });
	}

	try {
		await db.batch([
			db.prepare("insert into polls (status) values ('active')").bind(),
			db
				.prepare(
					"insert into poll_games (poll_id, game_id) " +
						"select polls.id, games.id from polls join games on games.status = 'backlog' and games.poll_eligible = 1 " +
						"where polls.status = 'active'"
				)
				.bind()
		]);
	} catch (error) {
		const mapped = mapPollConstraintError(error);
		if (mapped) {
			return mapped;
		}
		throw error;
	}

	const pollRow = await db
		.prepare("select id from polls where status = 'active' order by started_at desc limit 1")
		.bind()
		.first<{ id: number }>();
	if (!pollRow) {
		return new Response("Unable to create poll.", { status: 500 });
	}

	await writeAudit(
		env,
		session.email,
		"poll_start",
		"poll",
		pollRow.id,
		null,
		{ poll_id: pollRow.id, game_count: backlogGames.results.length }
	);

	return jsonResponse({ active: true, pollId: pollRow.id }, 201);
};

export const PATCH: APIRoute = async ({ locals, request }) => {
	const env = getRuntimeEnv(locals.runtime?.env);
	const session = await readSession(request, env);
	if (!session) {
		return new Response("Authentication required.", { status: 401 });
	}

	const db = getDb(env);
	if (!db) {
		return new Response("Polls database not configured.", { status: 500 });
	}

	const body = await readJson(request);
	if (body?.action !== "close") {
		return new Response("Unsupported action.", { status: 400 });
	}

	const activePoll = await db
		.prepare("select id from polls where status = 'active' limit 1")
		.bind()
		.first<{ id: number }>();
	if (!activePoll) {
		return new Response("No active poll.", { status: 404 });
	}

	const voteCount = await db
		.prepare("select count(distinct voter_email) as voter_count from poll_votes where poll_id = ?1")
		.bind(activePoll.id)
		.first<{ voter_count: number }>();
	const uniqueVoters = voteCount?.voter_count ?? 0;
	const historyValid = uniqueVoters >= 3 ? 1 : 0;

	await db
		.prepare("update polls set status = 'closed', closed_at = datetime('now'), history_valid = ?1 where id = ?2")
		.bind(historyValid, activePoll.id)
		.run();

	await writeAudit(
		env,
		session.email,
		"poll_close",
		"poll",
		activePoll.id,
		null,
		{ poll_id: activePoll.id, unique_voters: uniqueVoters, history_valid: historyValid === 1 }
	);

	return new Response(null, { status: 204 });
};

function getDb(env: Record<string, unknown>): D1Database | undefined {
	const value = env.DB;
	if (value && typeof value === "object") {
		return value as D1Database;
	}
	return undefined;
}

async function readJson(
	request: Request
): Promise<{ action?: string } | null> {
	const text = await request.text();
	if (!text) return null;
	try {
		return JSON.parse(text) as { action?: string };
	} catch {
		return null;
	}
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
		.all<{ game_id: number; title: string; points: number }>();

	return results.filter((result) => result.points > 0);
}

function jsonResponse(payload: unknown, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" }
	});
}

function mapPollConstraintError(error: unknown): Response | null {
	const message = getErrorMessage(error).toLowerCase();
	if (!message.includes("constraint")) {
		return null;
	}
	if (message.includes("idx_polls_single_active") || message.includes("polls.status")) {
		return new Response("Poll already active.", { status: 409 });
	}
	return null;
}

function getErrorMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error ?? "");
}
