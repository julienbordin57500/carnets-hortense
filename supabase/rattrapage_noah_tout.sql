-- Rattrapage du carnet de Noah (à coller en une fois dans l'éditeur SQL de Supabase) : couleur et consistance du caca,
-- réactions des parents, « vu par les parents », dodo de 16 h maximum.
alter table public.couches add column if not exists caca_couleur text
  check (caca_couleur in ('jaune', 'orange', 'vert', 'marron', 'noir', 'rouge', 'blanc'));
notify pgrst, 'reload schema';
alter table public.couches add column if not exists caca_texture text
  check (caca_texture in ('liquide', 'molle', 'normale', 'moulee', 'dure'));

do $$
declare c record;
begin
  for c in
    select con.conname from pg_constraint con
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any (con.conkey)
    where con.conrelid = 'public.couches'::regclass and con.contype = 'c' and a.attname = 'caca_taille'
  loop
    execute format('alter table public.couches drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.couches add constraint couches_caca_taille_check
  check (caca_taille in ('trace', 'petit', 'moyen', 'gros'));

notify pgrst, 'reload schema';
alter table public.garde_evenements add column if not exists reaction text check (char_length(reaction) <= 16);
alter table public.garde_evenements add column if not exists reaction_par text check (char_length(reaction_par) <= 40);
alter table public.garde_evenements add column if not exists reaction_le timestamptz;

drop trigger if exists garde_vers_parents on public.garde_evenements;
create trigger garde_vers_parents after insert or update of type, quand, fin, ml, lait, pipi, caca, gardien
  on public.garde_evenements
  for each row execute function public.garde_vers_parents();

notify pgrst, 'reload schema';
alter table public.garde_evenements add column if not exists vu_le timestamptz;
alter table public.garde_evenements add column if not exists vu_par text check (char_length(vu_par) <= 40);
notify pgrst, 'reload schema';
alter table public.sommeils drop constraint if exists dodo_pas_trop_long;
alter table public.sommeils add constraint dodo_pas_trop_long
  check (fin is null or fin - debut <= interval '16 hours');
alter table public.garde_evenements drop constraint if exists dodo_pas_trop_long;
alter table public.garde_evenements add constraint dodo_pas_trop_long
  check (type <> 'sommeil' or fin is null or fin - quand <= interval '16 hours');
notify pgrst, 'reload schema';
