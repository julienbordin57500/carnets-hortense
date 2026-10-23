-- =====================================================================
-- Les Carnets d'Hortense : base de données complète (à exécuter une fois)
-- 2 comptes : parents.hortense@example.com (tout) et
--             grandsparents.hortense@example.com (Garde et Santé)
-- =====================================================================

-- ---------- Repas (biberons et allaitements) ----------
create table public.biberons (
  id bigint generated always as identity primary key,
  type text not null default 'biberon' check (type in ('biberon', 'allaitement')),
  pris_le timestamptz not null default now(),
  quantite_ml integer check (quantite_ml is null or (quantite_ml > 0 and quantite_ml <= 500)),
  lait text check (lait in ('poudre', 'maternel')),
  cote text check (cote in ('gauche', 'droite', 'les deux')),
  duree_min integer check (duree_min is null or (duree_min > 0 and duree_min <= 120)),
  reprise_sommeil boolean not null default false,
  created_at timestamptz not null default now(),
  constraint pris_le_pas_futur check (pris_le <= created_at + interval '5 minutes')
);
create index biberons_pris_le_idx on public.biberons (pris_le desc);

-- ---------- Couches ----------
create table public.couches (
  id bigint generated always as identity primary key,
  change_le timestamptz not null default now(),
  pipi boolean not null default false,
  caca boolean not null default false,
  caca_taille text check (caca_taille in ('petit', 'moyen', 'gros')),
  created_at timestamptz not null default now(),
  constraint taille_si_caca check (caca or caca_taille is null),
  constraint change_pas_futur check (change_le <= created_at + interval '5 minutes')
);
create index couches_change_le_idx on public.couches (change_le desc);

-- ---------- Sommeil ----------
create table public.sommeils (
  id bigint generated always as identity primary key,
  debut timestamptz not null default now(),
  fin timestamptz,
  created_at timestamptz not null default now(),
  constraint fin_apres_debut check (fin is null or fin > debut),
  constraint debut_pas_futur check (debut <= created_at + interval '5 minutes')
);
create index sommeils_debut_idx on public.sommeils (debut desc);
create unique index sommeils_un_en_cours on public.sommeils ((true)) where fin is null;

-- ---------- Santé ----------
create table public.sante_profil (
  id integer primary key default 1 check (id = 1),
  date_naissance date,
  heure_naissance time,
  poids_naissance_g integer check (poids_naissance_g is null or poids_naissance_g between 300 and 7000),
  taille_naissance_cm numeric(4,1) check (taille_naissance_cm is null or taille_naissance_cm between 20 and 70),
  pc_naissance_cm numeric(4,1) check (pc_naissance_cm is null or pc_naissance_cm between 20 and 50),
  groupe_sanguin text check (groupe_sanguin is null or groupe_sanguin in ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  allergies text check (char_length(allergies) <= 500),
  traitements text check (char_length(traitements) <= 500),
  pediatre_nom text check (char_length(pediatre_nom) <= 120),
  pediatre_tel text check (char_length(pediatre_tel) <= 30),
  pediatre_adresse text check (char_length(pediatre_adresse) <= 200),
  notes text check (char_length(notes) <= 1000),
  updated_at timestamptz not null default now()
);
insert into public.sante_profil (id) values (1);

create table public.rendez_vous (
  id bigint generated always as identity primary key,
  quand timestamptz not null,
  type text not null default 'pediatre' check (type in ('pediatre', 'vaccin', 'examen', 'specialiste', 'autre')),
  titre text check (char_length(titre) <= 120),
  lieu text check (char_length(lieu) <= 200),
  notes text check (char_length(notes) <= 1000),
  fait boolean not null default false,
  created_at timestamptz not null default now()
);
create index rendez_vous_quand_idx on public.rendez_vous (quand);

create table public.mesures (
  id bigint generated always as identity primary key,
  mesure_le date not null default current_date,
  poids_kg numeric(5,3) check (poids_kg is null or poids_kg between 0.3 and 40),
  taille_cm numeric(4,1) check (taille_cm is null or taille_cm between 20 and 130),
  pc_cm numeric(4,1) check (pc_cm is null or pc_cm between 20 and 60),
  created_at timestamptz not null default now(),
  constraint au_moins_une_mesure check (poids_kg is not null or taille_cm is not null or pc_cm is not null)
);
create index mesures_le_idx on public.mesures (mesure_le desc);

create table public.suivi_calendrier (
  cle text primary key check (char_length(cle) <= 40),
  fait_le date not null default current_date
);

create table public.medicaments_prises (
  id bigint generated always as identity primary key,
  nom text not null check (char_length(nom) between 1 and 60),
  dose text check (char_length(dose) <= 40),
  pris_le timestamptz not null default now(),
  par text check (char_length(par) <= 40),
  created_at timestamptz not null default now(),
  constraint prise_pas_futur check (pris_le <= created_at + interval '5 minutes')
);
create index medicaments_prises_le_idx on public.medicaments_prises (pris_le desc);

create table public.premieres_fois (
  id bigint generated always as identity primary key,
  quoi text not null check (char_length(quoi) between 1 and 80),
  le date not null default current_date,
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now()
);
create index premieres_fois_le_idx on public.premieres_fois (le desc);

-- ---------- Garde (grands-parents) ----------
create table public.garde_jours (
  jour date not null,
  gardien text not null check (char_length(gardien) <= 40),
  note text check (char_length(note) <= 2000),
  updated_at timestamptz not null default now(),
  primary key (jour, gardien)
);

create table public.garde_evenements (
  id bigint generated always as identity primary key,
  type text not null check (type in ('repas', 'couche', 'sommeil')),
  quand timestamptz not null default now(),
  fin timestamptz,
  ml integer check (ml is null or (ml > 0 and ml <= 500)),
  lait text check (lait in ('poudre', 'maternel')),
  pipi boolean,
  caca boolean,
  gardien text check (char_length(gardien) <= 40),
  created_at timestamptz not null default now(),
  constraint fin_sommeil check (fin is null or (type = 'sommeil' and fin > quand)),
  constraint quand_pas_futur check (quand <= created_at + interval '5 minutes')
);
create index garde_evenements_quand_idx on public.garde_evenements (quand desc);
create unique index garde_un_dodo_en_cours on public.garde_evenements ((true)) where type = 'sommeil' and fin is null;

-- =====================================================================
-- Droits : qui peut lire / écrire quoi (vérifié par le serveur)
-- =====================================================================
create or replace function public.role_carnet() returns text
language sql stable security invoker set search_path = ''
as $f$
  select case auth.jwt() ->> 'email'
    when 'parents.hortense@example.com' then 'parents'
    when 'grandsparents.hortense@example.com' then 'famille'
  end
$f$;

-- Personne sans connexion n'a accès à quoi que ce soit
revoke all on all tables in schema public from anon;
alter table public.biberons enable row level security;
alter table public.couches enable row level security;
alter table public.sommeils enable row level security;
alter table public.sante_profil enable row level security;
alter table public.rendez_vous enable row level security;
alter table public.mesures enable row level security;
alter table public.suivi_calendrier enable row level security;
alter table public.medicaments_prises enable row level security;
alter table public.premieres_fois enable row level security;
alter table public.garde_jours enable row level security;
alter table public.garde_evenements enable row level security;

-- Pages des parents : seuls les parents lisent et écrivent
do $d$ declare t text; begin
  foreach t in array array['biberons','couches','sommeils','rendez_vous','mesures','suivi_calendrier','premieres_fois'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format($p$create policy "lecture parents" on public.%I for select to authenticated using ((select public.role_carnet()) = 'parents')$p$, t);
    execute format($p$create policy "ajout parents" on public.%I for insert to authenticated with check ((select public.role_carnet()) = 'parents')$p$, t);
    execute format($p$create policy "modif parents" on public.%I for update to authenticated using ((select public.role_carnet()) = 'parents') with check ((select public.role_carnet()) = 'parents')$p$, t);
    execute format($p$create policy "suppression parents" on public.%I for delete to authenticated using ((select public.role_carnet()) = 'parents')$p$, t);
  end loop;
end $d$;

-- Fiche santé : les grands-parents la lisent, seuls les parents la modifient
grant select, update on public.sante_profil to authenticated;
create policy "lecture fiche" on public.sante_profil for select to authenticated using ((select public.role_carnet()) in ('parents','famille'));
create policy "modif fiche parents" on public.sante_profil for update to authenticated using ((select public.role_carnet()) = 'parents') with check ((select public.role_carnet()) = 'parents');

-- Médicaments : tout le monde lit et note une prise ; seuls les parents modifient / suppriment
grant select, insert, update, delete on public.medicaments_prises to authenticated;
create policy "lecture medicaments" on public.medicaments_prises for select to authenticated using ((select public.role_carnet()) in ('parents','famille'));
create policy "ajout medicaments" on public.medicaments_prises for insert to authenticated with check ((select public.role_carnet()) in ('parents','famille'));
create policy "modif medicaments parents" on public.medicaments_prises for update to authenticated using ((select public.role_carnet()) = 'parents') with check ((select public.role_carnet()) = 'parents');
create policy "suppression medicaments parents" on public.medicaments_prises for delete to authenticated using ((select public.role_carnet()) = 'parents');

-- Garde : grands-parents et parents lisent et écrivent
do $d$ declare t text; begin
  foreach t in array array['garde_jours','garde_evenements'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format($p$create policy "garde lecture" on public.%I for select to authenticated using ((select public.role_carnet()) in ('parents','famille'))$p$, t);
    execute format($p$create policy "garde ajout" on public.%I for insert to authenticated with check ((select public.role_carnet()) in ('parents','famille'))$p$, t);
    execute format($p$create policy "garde modif" on public.%I for update to authenticated using ((select public.role_carnet()) in ('parents','famille')) with check ((select public.role_carnet()) in ('parents','famille'))$p$, t);
    execute format($p$create policy "garde suppression" on public.%I for delete to authenticated using ((select public.role_carnet()) in ('parents','famille'))$p$, t);
  end loop;
end $d$;

-- Petit « réveil » appelé chaque semaine pour que le projet gratuit ne se mette pas en pause
create or replace function public.reveil() returns timestamptz
language sql stable security invoker set search_path = ''
as $f$ select now() $f$;
revoke all on function public.reveil() from public;
grant execute on function public.reveil() to anon, authenticated;
