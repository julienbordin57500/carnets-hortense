-- Petit résumé pour les grands-parents : seulement l'essentiel de la journée, rien d'autre.
-- La fonction lit les tables des parents à leur place (security definer) mais ne renvoie que ces quelques infos.
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
    select b.pris_le as quand, b.type, b.quantite_ml as ml, b.lait, b.duree_min, 'maison' as ou from public.biberons b
    union all
    select g.quand, 'biberon', g.ml, g.lait, null, 'garde' from public.garde_evenements g where g.type = 'repas'
  ), couches as (
    select c.change_le as quand, c.pipi, c.caca, 'maison' as ou from public.couches c
    union all
    select g.quand, coalesce(g.pipi, false), coalesce(g.caca, false), 'garde' from public.garde_evenements g where g.type = 'couche'
  ), dodos as (
    select s.debut, s.fin from public.sommeils s
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
