-- Garde-fou : un dodo ne peut pas durer plus de 16 h (sinon c'est un réveil oublié qui fausse les stats).
-- L'appli demande alors l'heure du réveil (fenêtre « Réveil oublié ? »).
-- Ancien dodo resté ouvert 4 jours (garde du 10 novembre) : voir la correction appliquée à part.
alter table public.sommeils drop constraint if exists dodo_pas_trop_long;
alter table public.sommeils add constraint dodo_pas_trop_long
  check (fin is null or fin - debut <= interval '16 hours');
alter table public.garde_evenements drop constraint if exists dodo_pas_trop_long;
alter table public.garde_evenements add constraint dodo_pas_trop_long
  check (type <> 'sommeil' or fin is null or fin - quand <= interval '16 hours');
notify pgrst, 'reload schema';
