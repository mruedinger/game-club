update games
set price_checked_at = datetime(price_checked_at)
where price_checked_at is not null;
