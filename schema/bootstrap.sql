pragma foreign_keys = on;

create table if not exists members (
	email text primary key,
	name text,
	role text not null check (role in ('admin', 'member')) default 'member',
	active integer not null default 1,
	created_at text not null default (datetime('now')),
	alias text,
	picture text
);

create index if not exists idx_members_active on members(active);

create table if not exists games (
	id integer primary key autoincrement,
	title text not null,
	submitted_by_email text not null,
	status text not null check (status in ('backlog', 'current', 'played')) default 'backlog',
	created_at text not null default (datetime('now')),
	cover_art_url text,
	tags_json text,
	description text,
	time_to_beat_minutes integer,
	current_price_cents integer,
	best_price_cents integer,
	played_month text,
	steam_app_id integer,
	itad_game_id text,
	price_checked_at text,
	itad_slug text,
	itad_boxart_url text,
	poll_eligible integer check (poll_eligible in (0, 1)),
	foreign key (submitted_by_email) references members(email)
);

create index if not exists idx_games_status on games(status);
create index if not exists idx_games_played_month on games(played_month);
create index if not exists idx_games_steam_app_id on games(steam_app_id);
create index if not exists idx_games_price_checked_at on games(price_checked_at);
create index if not exists idx_games_backlog_poll_eligible on games(status, poll_eligible);

create unique index if not exists idx_games_single_current
	on games(status)
	where status = 'current';

create unique index if not exists idx_games_steam_app_id_unique
	on games(steam_app_id)
	where steam_app_id is not null;

create unique index if not exists idx_games_title_normalized_unique
	on games(lower(title));

create table if not exists game_favorites (
	game_id integer not null,
	member_email text not null,
	created_at text not null default (datetime('now')),
	primary key (game_id, member_email),
	foreign key (game_id) references games(id) on delete cascade,
	foreign key (member_email) references members(email) on delete cascade
);

create index if not exists idx_game_favorites_member on game_favorites(member_email);

create table if not exists game_ratings (
	game_id integer not null,
	member_email text not null,
	rating integer not null check (rating between 1 and 5),
	created_at text not null default (datetime('now')),
	updated_at text not null default (datetime('now')),
	primary key (game_id, member_email),
	foreign key (game_id) references games(id) on delete cascade,
	foreign key (member_email) references members(email) on delete cascade
);

create index if not exists idx_game_ratings_game on game_ratings(game_id);
create index if not exists idx_game_ratings_member on game_ratings(member_email);

create table if not exists polls (
	id integer primary key autoincrement,
	status text not null check (status in ('active', 'closed')) default 'active',
	started_at text not null default (datetime('now')),
	closed_at text
);

create unique index if not exists idx_polls_single_active
	on polls(status)
	where status = 'active';

create table if not exists poll_games (
	poll_id integer not null,
	game_id integer not null,
	primary key (poll_id, game_id),
	foreign key (poll_id) references polls(id),
	foreign key (game_id) references games(id)
);

create table if not exists poll_votes (
	id integer primary key autoincrement,
	poll_id integer not null,
	voter_email text not null,
	choice_1 integer not null,
	choice_2 integer,
	choice_3 integer,
	created_at text not null default (datetime('now')),
	foreign key (poll_id) references polls(id),
	foreign key (choice_1) references games(id),
	foreign key (choice_2) references games(id),
	foreign key (choice_3) references games(id)
);

create unique index if not exists idx_poll_votes_unique on poll_votes(poll_id, voter_email);
create index if not exists idx_poll_games_poll on poll_games(poll_id);

create table if not exists site_settings (
	key text primary key,
	value text not null,
	updated_at text not null default (datetime('now'))
);

insert or ignore into site_settings (key, value)
values ('next_meeting', '');

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
