-- Ce que notent les grands-parents (garde_evenements) est recopié tout seul dans le carnet des parents :
-- repas → biberons, couche → couches, dodo → sommeils. Les minuteurs, les 24 h et les courbes des parents
-- en tiennent donc compte. Une modification ou un effacement côté garde suit aussi.
-- Les grands-parents ne voient toujours pas le carnet des parents : la copie se fait sur le serveur.

alter table public.biberons add column if not exists garde_id bigint unique references public.garde_evenements (id) on delete cascade;
alter table public.biberons add column if not exists gardien text check (char_length(gardien) <= 40);
alter table public.couches add column if not exists garde_id bigint unique references public.garde_evenements (id) on delete cascade;
alter table public.couches add column if not exists gardien text check (char_length(gardien) <= 40);
alter table public.sommeils add column if not exists garde_id bigint unique references public.garde_evenements (id) on delete cascade;
alter table public.sommeils add column if not exists gardien text check (char_length(gardien) <= 40);

create or replace function public.garde_vers_parents() returns trigger
language plpgsql security definer set search_path = ''
as $f$
begin
  if new.type = 'repas' then
    insert into public.biberons (type, pris_le, quantite_ml, lait, garde_id, gardien, created_at)
    values ('biberon', new.quand, new.ml, new.lait, new.id, new.gardien, new.created_at)
    on conflict (garde_id) do update set pris_le = excluded.pris_le, quantite_ml = excluded.quantite_ml,
      lait = excluded.lait, gardien = excluded.gardien;
  elsif new.type = 'couche' then
    insert into public.couches (change_le, pipi, caca, garde_id, gardien, created_at)
    values (new.quand, coalesce(new.pipi, false), coalesce(new.caca, false), new.id, new.gardien, new.created_at)
    on conflict (garde_id) do update set change_le = excluded.change_le, pipi = excluded.pipi,
      caca = excluded.caca, caca_taille = case when excluded.caca then public.couches.caca_taille end,
      gardien = excluded.gardien;
  elsif new.type = 'sommeil' then
    begin
      insert into public.sommeils (debut, fin, garde_id, gardien, created_at)
      values (new.quand, new.fin, new.id, new.gardien, new.created_at)
      on conflict (garde_id) do update set debut = excluded.debut, fin = excluded.fin, gardien = excluded.gardien;
    exception when unique_violation then
      -- Un dodo est déjà en cours dans le carnet des parents : on ne bloque pas la note des grands-parents
      null;
    end;
  end if;
  return new;
end $f$;
revoke all on function public.garde_vers_parents() from public, anon, authenticated;

drop trigger if exists garde_vers_parents on public.garde_evenements;
create trigger garde_vers_parents after insert or update on public.garde_evenements
  for each row execute function public.garde_vers_parents();

-- Le résumé des grands-parents ne doit pas compter deux fois ce qui est recopié
create or replace function public.resume_famille() returns json
language plpgsql stable security definer set search_path = ''
as $f$
declare
  debut_jour timestamptz := date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
  r json;
begin
  if (select public.role_carnet()) is null then
    raise exception 'interdit' using errcode = '42501';
  end if;
  with repas as (
    select b.pris_le as quand, b.type, b.quantite_ml as ml, b.lait, b.duree_min, 'maison' as ou from public.biberons b where b.garde_id is null
    union all
    select g.quand, 'biberon', g.ml, g.lait, null, 'garde' from public.garde_evenements g where g.type = 'repas'
  ), couches as (
    select c.change_le as quand, c.pipi, c.caca, 'maison' as ou from public.couches c where c.garde_id is null
    union all
    select g.quand, coalesce(g.pipi, false), coalesce(g.caca, false), 'garde' from public.garde_evenements g where g.type = 'couche'
  ), dodos as (
    select s.debut, s.fin from public.sommeils s where s.garde_id is null
    union all
    select g.quand, g.fin from public.garde_evenements g where g.type = 'sommeil'
  )
  select json_build_object(
    'dernier_repas', (select row_to_json(x) from (select * from repas order by quand desc limit 1) x),
    'derniere_couche', (select row_to_json(x) from (select * from couches order by quand desc limit 1) x),
    'dernier_caca_aujourdhui', (select max(quand) from couches where caca and quand >= debut_jour),
    'sommeil_aujourdhui_min', (select coalesce(round(sum(extract(epoch from (least(coalesce(fin, now()), now()) - greatest(debut, debut_jour))) / 60)), 0)::int
                               from dodos where coalesce(fin, now()) > debut_jour and debut < now()),
    'dort_depuis', (select max(debut) from dodos where fin is null),
    'dernier_reveil', (select max(fin) from dodos where fin is not null)
  ) into r;
  return r;
end $f$;
revoke all on function public.resume_famille() from public, anon;
grant execute on function public.resume_famille() to authenticated;

-- Reprise de ce que les grands-parents ont déjà noté aujourd'hui
update public.garde_evenements set gardien = gardien
where quand >= date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
