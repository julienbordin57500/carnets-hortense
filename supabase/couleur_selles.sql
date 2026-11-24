-- Couleur du caca (page Couches, parents seulement), d'après la carte des selles du carnet de santé
alter table public.couches add column if not exists caca_couleur text
  check (caca_couleur in ('jaune', 'orange', 'vert', 'marron', 'noir', 'rouge', 'blanc'));
notify pgrst, 'reload schema';
