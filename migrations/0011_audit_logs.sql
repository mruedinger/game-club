create table if not exists audit_logs (
	id integer primary key autoincrement,
	actor_email text not null,
	action text not null,
	entity_type text not null,
	entity_id integer not null,
	before_json text,
	after_json text,
	created_at text not null default (datetime('now'))
);
