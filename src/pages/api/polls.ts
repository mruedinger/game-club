import type { APIRoute } from "astro";
import { getRuntimeEnv, readSession } from "../../lib/auth";

type D1Database = {
	prepare: (query: string) => {
		bind: (...args: unknown[]) => {
			all: <T>() => Promise<{ results: T[] }>;
			first: <T>() => Promise<T | null>;
			run: () => Promise<{ success: boolean }>;
		};
	};
};

type PollRow = {
	id: number;
	status: "active" | "closed";
	started_at: string;
	closed_at?: string;
};

type PollChoice = {
	id: number;
	title: string;
};

export const prerender = false;

export const GET: APIRoute = async ({ locals, request }) => {
	const env = getRuntimeEnv(locals.runtime?.env);
	const db = getDb(env);
	if (!db) {
		return new Response("Polls database not configured.", { status: 500 });
	}

	const activePoll = await db
		.prepare("select id, status, started_at, closed_at from polls where status = 'active' limit 1")
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
				"select games.id, games.title from poll_games join games on games.id = poll_games.game_id where poll_games.poll_id = ?1 order by games.title asc"
			)
			.bind(activePoll.id)
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
			"select id, status, started_at, closed_at from polls where status = 'closed' order by closed_at desc limit 1"
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
		.prepare("select id from games where status = 'backlog' order by title asc")
		.bind()
		.all<{ id: number }>();

	if (backlogGames.results.length === 0) {
		return new Response("No backlog games available.", { status: 400 });
	}

	await db.prepare("insert into polls (status) values ('active')").bind().run();
	const pollRow = await db
		.prepare("select id from polls where status = 'active' order by started_at desc limit 1")
		.bind()
		.first<{ id: number }>();
	if (!pollRow) {
		return new Response("Unable to create poll.", { status: 500 });
	}

	for (const game of backlogGames.results) {
		await db
			.prepare("insert into poll_games (poll_id, game_id) values (?1, ?2)")
			.bind(pollRow.id, game.id)
			.run();
	}

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

	await db
		.prepare("update polls set status = 'closed', closed_at = datetime('now') where id = ?1")
		.bind(activePoll.id)
		.run();

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

	return results.slice(0, 3);
}

function jsonResponse(payload: unknown, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" }
	});
}
