create table if not exists polls (
	id integer primary key autoincrement,
	status text not null check (status in ('active', 'closed')) default 'active',
	started_at text not null default (datetime('now')),
	closed_at text
);

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
