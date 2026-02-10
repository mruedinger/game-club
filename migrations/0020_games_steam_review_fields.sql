alter table games add column steam_review_score integer check (steam_review_score between 0 and 9);
alter table games add column steam_review_desc text;
