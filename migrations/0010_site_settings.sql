create table if not exists site_settings (
	key text primary key,
	value text not null,
	updated_at text not null default (datetime('now'))
);

insert or ignore into site_settings (key, value)
values ('next_meeting', '2026-02-03T20:15:00-05:00');
