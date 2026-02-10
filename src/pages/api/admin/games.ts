import type { APIRoute } from "astro";
import { getRuntimeEnv, readSession } from "../../../lib/auth";

type GameRow = {
	id: number;
	title: string;
	submitted_by_email: string;
	status: "backlog" | "current" | "played";
	poll_eligible?: number | null;
	tags_json?: string;
	time_to_beat_minutes?: number;
	played_month?: string;
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
	const { session, db, error } = await requireAdmin(request, locals);
	if (!session || !db) return error!;

	const { results } = await db
		.prepare(
			"select id, title, submitted_by_email, status, poll_eligible, tags_json, time_to_beat_minutes, played_month from games order by lower(title) asc"
		)
		.bind()
		.all<GameRow>();

	return new Response(JSON.stringify(results), {
		status: 200,
		headers: { "Content-Type": "application/json" }
	});
};

export const PATCH: APIRoute = async ({ request, locals }) => {
	const { session, db, error } = await requireAdmin(request, locals);
	if (!session || !db) return error!;

	const body = await readJson(request);
	const id = normalizeId(body?.id);
	if (!id) {
		return new Response("Game id is required.", { status: 400 });
	}

	const existing = await db
		.prepare(
			"select id, title, submitted_by_email, status, poll_eligible, tags_json, time_to_beat_minutes, played_month from games where id = ?1"
		)
		.bind(id)
		.first<GameRow>();
	if (!existing) {
		return new Response("Game not found.", { status: 404 });
	}

	const updates: string[] = [];
	const values: unknown[] = [];
	let nextSubmittedByEmail = existing.submitted_by_email;
	let nextStatus = existing.status;
	let nextPollEligible: number | null =
		existing.poll_eligible === 1 ? 1 : existing.poll_eligible === 0 ? 0 : null;

	if (typeof body?.submitted_by_email === "string") {
		const email = body.submitted_by_email.trim().toLowerCase();
		if (!email) return new Response("Submitted by email is required.", { status: 400 });
		if (!isValidEmail(email)) {
			return new Response("User email address is malformed.", { status: 400 });
		}
		const member = await db
			.prepare("select email from members where email = ?1 limit 1")
			.bind(email)
			.first<{ email: string }>();
		if (!member) {
			return new Response("Submitted by email must belong to an existing member.", { status: 400 });
		}
		nextSubmittedByEmail = email;
	}

	if (typeof body?.status === "string") {
		if (!["backlog", "current", "played"].includes(body.status)) {
			return new Response("Invalid status.", { status: 400 });
		}
		nextStatus = body.status as "backlog" | "current" | "played";
	}

	if (body && Object.prototype.hasOwnProperty.call(body, "poll_eligible")) {
		const parsedPollEligible = parsePollEligible(body.poll_eligible);
		if (parsedPollEligible === null) {
			return new Response("Invalid poll eligibility value.", { status: 400 });
		}
		nextPollEligible = parsedPollEligible;
	}

	if (nextStatus !== "backlog") {
		nextPollEligible = null;
	} else if (nextPollEligible === null) {
		nextPollEligible = 0;
	}

	if (nextStatus === "backlog" && nextPollEligible === 1) {
		const eligibleCount = await db
			.prepare(
				"select count(*) as count from games where submitted_by_email = ?1 and status = 'backlog' and poll_eligible = 1 and id != ?2"
			)
			.bind(nextSubmittedByEmail, id)
			.first<{ count: number }>();
		if ((eligibleCount?.count ?? 0) >= 2) {
			return new Response("Member already has 2 poll-eligible backlog games.", { status: 409 });
		}
	}

	if (nextSubmittedByEmail !== existing.submitted_by_email) {
		updates.push(`submitted_by_email = ?${values.length + 1}`);
		values.push(nextSubmittedByEmail);
	}

	if (nextStatus !== existing.status) {
		updates.push(`status = ?${values.length + 1}`);
		values.push(nextStatus);
	}

	const existingPollEligible =
		existing.poll_eligible === 1 ? 1 : existing.poll_eligible === 0 ? 0 : null;
	if (nextPollEligible !== existingPollEligible) {
		updates.push(`poll_eligible = ?${values.length + 1}`);
		values.push(nextPollEligible);
	}

	if (typeof body?.played_month === "string") {
		const month = body.played_month.trim();
		if (month && !isValidPlayedMonth(month)) {
			return new Response("Invalid played month. Use YYYY-MM.", { status: 400 });
		}
		updates.push(`played_month = ?${values.length + 1}`);
		values.push(month || null);
	}

	if (typeof body?.time_to_beat_hours === "number") {
		const minutes = Math.max(0, Math.round(body.time_to_beat_hours * 60));
		updates.push(`time_to_beat_minutes = ?${values.length + 1}`);
		values.push(minutes || null);
	}

	if (typeof body?.tags === "string") {
		const tags = body.tags
			.split(",")
			.map((tag) => tag.trim())
			.filter(Boolean);
		const tagsJson = tags.length > 0 ? JSON.stringify(tags) : null;
		updates.push(`tags_json = ?${values.length + 1}`);
		values.push(tagsJson);
	}

	if (updates.length === 0) {
		return new Response("No updates provided.", { status: 400 });
	}

	const newStatus = nextStatus !== existing.status ? nextStatus : null;
	const sql = `update games set ${updates.join(", ")} where id = ?${values.length + 1}`;
	values.push(id);
	const updateStatement = db.prepare(sql).bind(...values);

		try {
			if (newStatus === "current") {
				const playedMonth = getCurrentMonth();
				await db.batch([
					db
						.prepare(
							"update games set status = 'played', poll_eligible = null, played_month = coalesce(played_month, ?1) where status = 'current' and id != ?2 and exists(select 1 from games where id = ?2)"
						)
						.bind(playedMonth, id),
					updateStatement
				]);
		} else {
			await updateStatement.run();
		}
	} catch (error) {
		const mapped = mapAdminGameConstraintError(error);
		if (mapped) {
			return mapped;
		}
		throw error;
	}

	const updated = await db
		.prepare(
			"select id, title, submitted_by_email, status, poll_eligible, tags_json, time_to_beat_minutes, played_month from games where id = ?1"
		)
		.bind(id)
		.first<GameRow>();

	await db
		.prepare(
			"insert into audit_logs (actor_email, action, entity_type, entity_id, before_json, after_json) values (?1, ?2, ?3, ?4, ?5, ?6)"
		)
		.bind(
			session.email.toLowerCase(),
			"game_edit",
			"game",
			id,
			JSON.stringify(existing),
			JSON.stringify(updated)
		)
		.run();

	if (existing.status !== "current" && updated?.status === "current") {
		await db
			.prepare(
				"insert into audit_logs (actor_email, action, entity_type, entity_id, before_json, after_json) values (?1, ?2, ?3, ?4, ?5, ?6)"
			)
			.bind(
				session.email.toLowerCase(),
				"game_set_current",
				"game",
				id,
				JSON.stringify(existing),
				JSON.stringify(updated)
			)
			.run();
	}

	return new Response(null, { status: 204 });
};

export const DELETE: APIRoute = async ({ request, locals }) => {
	const { session, db, error } = await requireAdmin(request, locals);
	if (!session || !db) return error!;

	const body = await readJson(request);
	const id = normalizeId(body?.id);
	if (!id) {
		return new Response("Game id is required.", { status: 400 });
	}

	const existing = await db
		.prepare(
			"select id, title, submitted_by_email, status, poll_eligible, tags_json, time_to_beat_minutes, played_month from games where id = ?1"
		)
		.bind(id)
		.first<GameRow>();
	if (!existing) {
		return new Response("Game not found.", { status: 404 });
	}

	await db.batch([
		db.prepare("delete from poll_votes where choice_1 = ?1 or choice_2 = ?1 or choice_3 = ?1").bind(
			id
		),
		db.prepare("delete from poll_games where game_id = ?1").bind(id),
		db.prepare("delete from games where id = ?1").bind(id)
	]);

	await db
		.prepare(
			"insert into audit_logs (actor_email, action, entity_type, entity_id, before_json, after_json) values (?1, ?2, ?3, ?4, ?5, ?6)"
		)
		.bind(
			session.email.toLowerCase(),
			"game_delete",
			"game",
			id,
			JSON.stringify(existing),
			null
		)
		.run();

	return new Response(null, { status: 204 });
};

async function requireAdmin(request: Request, locals: App.Locals) {
	const env = getRuntimeEnv(locals.runtime?.env);
	const session = await readSession(request, env);
	if (!session) {
		return { session: null, db: null, error: new Response("Authentication required.", { status: 401 }) };
	}
	if (session.role !== "admin") {
		return { session: null, db: null, error: new Response("Admin access required.", { status: 403 }) };
	}

	const db = getDb(env);
	if (!db) {
		return { session, db: null, error: new Response("Games database not configured.", { status: 500 }) };
	}
	return { session, db, error: null };
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

async function readJson(request: Request): Promise<{
	id?: unknown;
	submitted_by_email?: unknown;
	status?: unknown;
	poll_eligible?: unknown;
	tags?: unknown;
	time_to_beat_hours?: unknown;
	played_month?: unknown;
} | null> {
	const text = await request.text();
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

function getCurrentMonth() {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	return `${year}-${month}`;
}

function isValidPlayedMonth(value: string) {
	if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return false;
	return true;
}

function isValidEmail(value: string) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parsePollEligible(value: unknown): 0 | 1 | null {
	if (value === null || value === undefined) return null;
	if (typeof value === "boolean") {
		return value ? 1 : 0;
	}
	return null;
}

function mapAdminGameConstraintError(error: unknown): Response | null {
	const message = getErrorMessage(error).toLowerCase();
	if (!message.includes("constraint")) {
		return null;
	}
	if (message.includes("idx_games_single_current") || message.includes("games.status")) {
		return new Response("Another game is already set as current.", { status: 409 });
	}
	if (message.includes("foreign key")) {
		return new Response("Submitted by email must belong to an existing member.", { status: 400 });
	}
	return null;
}

function getErrorMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error ?? "");
}
