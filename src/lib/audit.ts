type D1Database = {
	prepare: (query: string) => {
		bind: (...args: unknown[]) => {
			run: () => Promise<{ success: boolean }>;
		};
	};
};

export async function writeAudit(
	env: Record<string, unknown>,
	actorEmail: string,
	action: string,
	entityType: string,
	entityId: number,
	before?: unknown,
	after?: unknown
) {
	if (!actorEmail) return;
	const db = getDb(env);
	if (!db) return;
	const beforeJson = before ? JSON.stringify(before) : null;
	const afterJson = after ? JSON.stringify(after) : null;
	await db
		.prepare(
			"insert into audit_logs (actor_email, action, entity_type, entity_id, before_json, after_json) values (?1, ?2, ?3, ?4, ?5, ?6)"
		)
		.bind(actorEmail.toLowerCase(), action, entityType, entityId, beforeJson, afterJson)
		.run();
}

function getDb(env: Record<string, unknown>): D1Database | undefined {
	const value = env.DB;
	if (value && typeof value === "object") {
		return value as D1Database;
	}
	return undefined;
}
