-- Kingdom Heights' academies (from the school's website), each with its main bulletin board on the Boards tab.
-- Grades are numbered as everywhere else: K2 = -3, K3 = -2, K4 = -1, Kindergarten = 0, then 1–12.
insert into public.academies (id, name, min_grade, max_grade, position) values
  ('early-learning', 'Early Learning Academy', -3, -1, 1),
  ('formation',      'Formation Academy',       0,  5, 2),
  ('presence',       'Presence Academy',        6,  8, 3),
  ('kingdom',        'Kingdom Academy',         9, 12, 4)
on conflict (id) do nothing;
