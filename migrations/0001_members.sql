create table if not exists members (
	email text primary key,
	name text,
	role text not null check (role in ('admin', 'member')) default 'member',
	active integer not null default 1,
	created_at text not null default (datetime('now'))
);

create index if not exists idx_members_active on members(active);
