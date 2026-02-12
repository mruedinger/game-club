alter table games add column time_to_beat_seconds integer;

update games
set time_to_beat_seconds = case
	when time_to_beat_minutes is not null and time_to_beat_minutes > 0 then time_to_beat_minutes * 60
	else null
end
where time_to_beat_seconds is null;
