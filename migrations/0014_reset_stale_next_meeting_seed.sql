update site_settings
set value = ''
where key = 'next_meeting'
	and value = '2026-02-03T20:15:00-05:00';
