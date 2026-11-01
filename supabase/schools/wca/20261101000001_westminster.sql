-- Westminster Christian Academy's own project: its names, contact details, car line spot and
-- Marketplace terms, on top of the shared migrations (which start out with Kingdom Heights'
-- values). Applied once, after the shared migrations, by scripts/supabase_setup.mjs with
-- SCHOOL=wca. Later changes for this school only go in a new file in this folder.

update app.settings set value = v.value
from (values
  ('app_name',         'WCA'),
  ('school_name',      'Westminster'),
  ('school_full_name', 'Westminster Christian Academy'),
  ('connect_name',     'Wildcats Connect'),
  ('news_name',        'WCA News'),
  ('web_app',          'https://royalrockinapps.github.io/khroyals/wca/'),
  ('email_from',       'WCA Car Line <noreply@wca-hsv.org>'),
  ('school_phone',     '(256) 705-8300'),
  -- The car line zone starts on the Lower Campus (375 Mt. Zion Rd., Madison); car line leads move it in the app.
  ('carline_latitude',  '34.7865'),
  ('carline_longitude', '-86.7247'),
  ('market_terms', $terms$The Westminster Marketplace is for Westminster families and staff to buy, sell and trade uniforms and other school-related items, like books, supplies, and sports and spirit gear.

1. Only post uniforms and school-related items. Anything else will be removed.
2. Westminster may remove any post at any time, for any reason.
3. Westminster isn't part of any sale: it doesn't handle payments, guarantee items or settle disputes. Buyers and sellers deal with each other and hand items off at school.
4. Describe items honestly, keep posts and offers respectful, and follow the Student/Parent Handbook.
5. Westminster may turn off Marketplace access for anyone who doesn't follow these terms.$terms$)
) as v(key, value)
where app.settings.key = v.key;

-- Kingdom Heights' Spirit Week and newsletter issue came in with the shared migrations; they aren't Westminster's.
delete from public.dress_days where week = 'Spirit Week' and on_date between '2026-10-26' and '2026-10-30';
delete from public.newsletters where source_url = 'https://app.smore.com/n/ms70g-royals-news';
