-- Consistance du caca (page Couches, parents seulement) et nouvelle taille « trace » (juste une trace dans la couche)
alter table public.couches add column if not exists caca_texture text
  check (caca_texture in ('liquide', 'molle', 'normale', 'moulee', 'dure'));

-- La taille accepte maintenant « trace » en plus de petit / moyen / gros
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
