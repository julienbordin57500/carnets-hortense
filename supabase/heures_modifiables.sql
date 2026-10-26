-- On peut corriger l'heure d'une note après coup (même plus tard que le moment où elle a été notée) :
-- la seule règle gardée est « pas dans le futur » (5 min de marge), vérifiée au moment de l'enregistrement.
alter table public.biberons drop constraint if exists pris_le_pas_futur;
alter table public.couches drop constraint if exists change_pas_futur;
alter table public.sommeils drop constraint if exists debut_pas_futur;
alter table public.garde_evenements drop constraint if exists quand_pas_futur;
alter table public.medicaments_prises drop constraint if exists prise_pas_futur;

create or replace function public.pas_dans_le_futur() returns trigger
language plpgsql set search_path = ''
as $f$
begin
  if (to_jsonb(new) ->> tg_argv[0])::timestamptz > now() + interval '5 minutes' then
    raise exception 'Heure dans le futur' using errcode = '23514';
  end if;
  return new;
end $f$;

drop trigger if exists pas_dans_le_futur on public.biberons;
create trigger pas_dans_le_futur before insert or update on public.biberons for each row execute function public.pas_dans_le_futur('pris_le');
drop trigger if exists pas_dans_le_futur on public.couches;
create trigger pas_dans_le_futur before insert or update on public.couches for each row execute function public.pas_dans_le_futur('change_le');
drop trigger if exists pas_dans_le_futur on public.sommeils;
create trigger pas_dans_le_futur before insert or update on public.sommeils for each row execute function public.pas_dans_le_futur('debut');
drop trigger if exists pas_dans_le_futur on public.garde_evenements;
create trigger pas_dans_le_futur before insert or update on public.garde_evenements for each row execute function public.pas_dans_le_futur('quand');
drop trigger if exists pas_dans_le_futur on public.medicaments_prises;
create trigger pas_dans_le_futur before insert or update on public.medicaments_prises for each row execute function public.pas_dans_le_futur('pris_le');
