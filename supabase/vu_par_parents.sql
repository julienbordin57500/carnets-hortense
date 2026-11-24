-- « Vu par les parents » : quand un parent ouvre la page Garde, les notes des grands-parents sont marquées vues
-- (heure et prénom du parent). Les grands-parents le voient en haut de leur page.
alter table public.garde_evenements add column if not exists vu_le timestamptz;
alter table public.garde_evenements add column if not exists vu_par text check (char_length(vu_par) <= 40);
notify pgrst, 'reload schema';
