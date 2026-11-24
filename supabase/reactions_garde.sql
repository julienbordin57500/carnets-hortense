-- Réactions des parents (❤️ 😊 😕…) sur ce que les grands-parents notent pendant la garde.
-- Une réaction par note : l'émoji, qui l'a mise et quand (pour prévenir les grands-parents).
alter table public.garde_evenements add column if not exists reaction text check (char_length(reaction) <= 16);
alter table public.garde_evenements add column if not exists reaction_par text check (char_length(reaction_par) <= 40);
alter table public.garde_evenements add column if not exists reaction_le timestamptz;

-- La recopie vers le carnet des parents ne se relance que si la note elle-même change
-- (pas quand on ajoute une réaction) : un doublon effacé par les parents ne revient donc pas.
drop trigger if exists garde_vers_parents on public.garde_evenements;
create trigger garde_vers_parents after insert or update of type, quand, fin, ml, lait, pipi, caca, gardien
  on public.garde_evenements
  for each row execute function public.garde_vers_parents();

notify pgrst, 'reload schema';
