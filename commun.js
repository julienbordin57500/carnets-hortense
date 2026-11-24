// Outils partagés par les pages Repas, Couches et Sommeil

// Connexion Supabase (clé publique : la sécurité est gérée par les règles RLS des tables)
// Adresse et clé publique de la base (voir config.js). En mode découverte, une base simulée répond (demo.js).
const SUPABASE_URL = CONFIG.demo ? "https://demo.carnets-hortense.local" : CONFIG.supabaseUrl;
const SUPABASE_KEY = CONFIG.demo ? "demo" : CONFIG.supabaseKey;

const DAY_MS = 24 * 60 * 60 * 1000;
const $ = (id) => document.getElementById(id);

// Version de l'appli : quand elle change sur le serveur, les téléphones se mettent à jour tout seuls
const VERSION_APPLI = "12";

// Jeton de connexion (fourni par auth.js une fois le profil connecté)
let obtenirJeton = async () => null;
let surNonConnecte = () => {};

// ---------- File d'attente hors ligne ----------
// Sans réseau, les ajouts / modifications sont gardés sur le téléphone puis envoyés au retour du réseau.
// On ne se fie pas à navigator.onLine (sur iPhone il reste parfois faux après une mise en veille) :
// « hors ligne » = une vraie demande au serveur vient d'échouer ; la première qui réussit l'efface.
const FILE = "file-attente";
const lireFile = () => lire(FILE, [], Array.isArray);
let horsLigne = false;
let verifReseau = null;
// Journal pour le diagnostic (toucher le badge)
const journal = { derniereErreur: null, dernierSucces: null, echecsDeSuite: 0 };
function noterErreur(ou, e) {
  journal.derniereErreur = { quand: new Date(), ou, message: String(e?.message || e) };
}
function signalerReseau(ok) {
  if (ok) {
    journal.dernierSucces = new Date();
    journal.echecsDeSuite = 0;
  } else {
    journal.echecsDeSuite++;
  }
  // Une seule demande ratée (appli mise en veille, changement de wifi…) ne suffit pas : il en faut 2 de suite
  const nouveau = !ok && journal.echecsDeSuite >= 2;
  if (horsLigne === nouveau) return;
  horsLigne = nouveau;
  majBadgeAttente();
  // Hors ligne : on revérifie toutes les 10 s, le badge s'efface dès que le serveur répond
  clearInterval(verifReseau);
  if (horsLigne) verifReseau = setInterval(verifierServeur, 10000);
}
async function verifierServeur() {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/`, { headers: { apikey: SUPABASE_KEY } });
    signalerReseau(true);
    envoyerFile();
  } catch (e) {
    noterErreur("vérification", e);
  }
}
function majBadgeAttente() {
  const n = lireFile().length;
  const b = document.getElementById("sync-badge");
  if (!b) return;
  b.hidden = n === 0 && !horsLigne;
  b.textContent = n ? `📶 ${n} en attente · toucher` : "📶 Hors ligne · toucher";
}
function mettreEnAttente(table, path, options) {
  const file = lireFile();
  file.push({ table, path, method: options.method, body: options.body, headers: options.headers || {}, le: Date.now(), essais: 0 });
  ecrire(FILE, file);
  majBadgeAttente();
  toast("📶 Pas de réseau : ce sera envoyé dès qu'il revient");
}
let envoiEnCours = null;
// Envoie les ajouts en attente, dans l'ordre. Renvoie true si la file est vide à la fin.
function envoyerFile() {
  if (!envoiEnCours) envoiEnCours = viderFile().finally(() => (envoiEnCours = null));
  return envoiEnCours;
}
async function viderFile() {
  let file = lireFile();
  if (!file.length) {
    majBadgeAttente();
    return true;
  }
  let envoye = 0;
  while (file.length) {
    const it = file[0];
    let res;
    try {
      res = await fetch(`${SUPABASE_URL}/rest/v1/${it.table}${it.path}`, {
        method: it.method,
        body: it.body,
        headers: await entetes(it.headers),
      });
    } catch (e) {
      noterErreur(`envoi ${it.table}`, e);
      signalerReseau(false);
      break; // toujours pas de réseau : on réessaiera
    }
    signalerReseau(true);
    it.essais = (it.essais || 0) + 1;
    // Connexion à refaire : on garde l'envoi, mais jamais plus de 5 essais (sinon il bloquerait tout)
    if (res.status === 401 && it.essais < 5) {
      noterErreur(`envoi ${it.table}`, "connexion expirée (401)");
      ecrire(FILE, file);
      break;
    }
    // Réussi, ou refusé pour de bon : on retire de la file
    if (!res.ok) noterErreur(`envoi ${it.table}`, `refusé par le serveur (${res.status})`);
    file.shift();
    ecrire(FILE, file);
    if (res.ok) envoye++;
  }
  majBadgeAttente();
  if (envoye) {
    toast(`📶 ${envoye} ajout${envoye > 1 ? "s" : ""} en attente envoyé${envoye > 1 ? "s" : ""}`);
    rechargerTout();
  }
  return file.length === 0;
}
window.addEventListener("online", () => {
  verifierServeur();
  envoyerFile();
});

// ---------- Diagnostic (toucher le badge) ----------
async function ouvrirDiagnostic() {
  await verifierServeur();
  await envoyerFile();
  const f = lireFile();
  const e = journal.derniereErreur;
  const fmt = (d) => (d ? d.toLocaleTimeString("fr-FR") : "jamais");
  const lignes = [
    `Version : v${VERSION_APPLI}`,
    `Réseau d'après le téléphone : ${navigator.onLine ? "oui" : "non"}`,
    `Dernière réponse du serveur : ${fmt(journal.dernierSucces)}`,
    `En attente d'envoi : ${f.length}${f.length ? " (" + f.map((x) => x.table).join(", ") + ")" : ""}`,
    `Dernier souci : ${e ? `${fmt(e.quand)} · ${e.ou} · ${e.message}` : "aucun"}`,
  ];
  $("diag-texte").textContent = lignes.join("\n");
  $("diag-vider").hidden = f.length === 0;
  majBadgeAttente();
  $("diag").showModal();
}
document.addEventListener("click", (e) => {
  if (e.target.closest("#sync-badge")) ouvrirDiagnostic();
  if (e.target.closest("#diag-vider"))
    demanderConfirmation("Effacer les ajouts en attente ? Ils ne seront jamais envoyés.", "Effacer").then((ok) => {
      if (!ok) return;
      ecrire(FILE, []);
      $("diag").close();
      majBadgeAttente();
      toast("File d'attente vidée");
    });
});

async function entetes(extra = {}) {
  // Un souci pour rafraîchir la connexion ne doit pas faire croire à une coupure réseau
  let jeton = null;
  try {
    jeton = await obtenirJeton();
  } catch (e) {}
  return {
    apikey: SUPABASE_KEY,
    ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
    "Content-Type": "application/json",
    Prefer: "return=representation",
    ...extra,
  };
}

// Clé de cache stable : les « depuis 24 h » changent à chaque appel, on les remplace par *
const cleCache = (url) => "cache:" + url.replace(/\d{4}-\d{2}-\d{2}T[^&),]*?Z/g, "*");

async function api(table, path = "", options = {}) {
  const methode = (options.method || "GET").toUpperCase();
  const ecriture = methode !== "GET";
  const url = `${SUPABASE_URL}/rest/v1/${table}${path}`;
  // D'autres ajouts attendent : on essaie d'abord de les envoyer, pour garder l'ordre
  if (ecriture && lireFile().length && !(await envoyerFile())) {
    mettreEnAttente(table, path, options);
    return [];
  }
  let res;
  try {
    res = await fetch(url, { ...options, headers: await entetes(options.headers) });
  } catch (e) {
    noterErreur(table, e);
    signalerReseau(false);
    if (ecriture) {
      mettreEnAttente(table, path, options);
      return [];
    }
    // Lecture sans réseau : on montre les dernières données connues
    const cache = lire(cleCache(url), null, () => true);
    if (cache !== null) return cache;
    throw e;
  }
  signalerReseau(true);
  if (res.status === 401) surNonConnecte();
  if (!res.ok) {
    const err = new Error(`Erreur ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const data = res.status === 204 ? null : await res.json();
  if (!ecriture) ecrire(cleCache(url), data);
  return data;
}

const ilYa24h = () => new Date(Date.now() - DAY_MS).toISOString();
function minuit() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ---------- Heures et durées ----------
const pad = (n) => String(n).padStart(2, "0");
const fmtHeure = (d) => new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

// Minuteur : « 2:14:05 » ou « 1 j 3 h »
function fmtDuree(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const j = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (j > 0) return `${j} j ${h} h`;
  return `${h}:${pad(m)}:${pad(s % 60)}`;
}

// Durée lisible : « 45 min » ou « 2 h 05 »
function fmtMinutes(ms) {
  const min = Math.floor(Math.max(0, ms) / 60000);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${pad(min % 60)}`;
}

function fmtIlYa(ms) {
  const min = Math.floor(ms / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  return `il y a ${h} h${min % 60 ? " " + pad(min % 60) : ""}`;
}

// « (lundi) » quand ce n'est pas aujourd'hui
function jourSiPasAujourdhui(d) {
  d = new Date(d);
  return d.toDateString() === new Date().toDateString() ? "" : ` (${d.toLocaleDateString("fr-FR", { weekday: "long" })})`;
}

// Heure saisie dans un champ, ou maintenant si le champ est vide
function heureChoisie(inputId) {
  const v = $(inputId).value;
  if (!v) return new Date();
  const [h, m] = v.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  // Une heure « dans le futur » veut dire hier (ex. 23h30 saisi à 1h du matin)
  if (d.getTime() > Date.now() + 60 * 1000) d.setDate(d.getDate() - 1);
  return d;
}

// Vert, puis orange, puis rouge selon le temps écoulé
function couleurMinuteur(el, ecart, warnMs, lateMs) {
  el.classList.toggle("warn", ecart >= warnMs && ecart < lateMs);
  el.classList.toggle("late", ecart >= lateMs);
}

// ---------- Interface ----------
function afficherErreur(msg) {
  $("error").hidden = !msg;
  $("error").textContent = msg || "";
}

let toastTimer;
function toast(msg, annuler) {
  const t = $("toast");
  t.textContent = msg;
  // Petit bouton « Annuler » pendant 5 secondes (un appui en trop se corrige tout de suite)
  if (annuler) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "toast-annuler";
    b.textContent = "Annuler";
    b.addEventListener("click", async () => {
      t.hidden = true;
      try {
        await annuler();
        toast("↩️ Annulé");
      } catch (e) {
        afficherErreur("Impossible d'annuler. Supprime-le dans la liste.");
      }
    });
    t.append(" ", b);
  }
  t.classList.toggle("avec-action", !!annuler);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), annuler ? 5000 : 2200);
}

// Petite fenêtre « Oui / Annuler » de l'appli (la fenêtre confirm() du navigateur peut être bloquée)
function demanderConfirmation(texte, oui = "Oui") {
  const d = $("confirmer");
  $("confirmer-texte").textContent = texte;
  $("confirmer-oui").textContent = oui;
  d.returnValue = "non";
  return new Promise((r) => {
    d.addEventListener("close", () => r(d.returnValue === "oui"), { once: true });
    d.showModal();
  });
}

// Ajoute une ligne et renvoie son id (null si elle part dans la file d'attente hors ligne)
async function ajouterLigne(table, ligne) {
  const r = await api(table, "", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(ligne) });
  return Array.isArray(r) && r[0] ? r[0].id : null;
}
// Retire une ligne qu'on vient d'ajouter (bouton « Annuler ») puis recharge les pages
const annulerAjout = (table, id) =>
  id
    ? async () => {
        await api(table, `?id=eq.${id}`, { method: "DELETE" });
        await rechargerTout();
      }
    : null;

// « Tu viens déjà de noter… » : Non, c'était en trop / Oui, en ajouter un autre
function demanderDoublon(message) {
  return new Promise((ok) => {
    const d = $("g-doublon");
    $("g-doublon-texte").textContent = message;
    d.onclose = () => ok(d.returnValue === "oui");
    d.returnValue = "";
    d.showModal();
  });
}
// Même chose notée il y a moins de 5 minutes (et l'heure n'a pas été changée à la main)
const recemment = (date) => Math.abs(Date.now() - new Date(date).getTime()) < 5 * 60000;

// C'est noté : petite vibration (Android ; l'iPhone ne le permet pas), rebond et coche verte
function animerBouton(btn) {
  if (!btn) return;
  try {
    navigator.vibrate?.(35);
  } catch (e) {}
  btn.classList.remove("pop");
  void btn.offsetWidth;
  btn.classList.add("pop");
  btn.querySelector(".coche-ok")?.remove();
  const coche = document.createElement("span");
  coche.className = "coche-ok";
  coche.setAttribute("aria-hidden", "true");
  coche.textContent = "✓";
  btn.append(coche);
  setTimeout(() => coche.remove(), 1100);
}

// Listes du jour : un petit titre « ☀️ Matin », « 🌤️ Après-midi », « 🌆 Soirée », « 🌙 Nuit »
// chaque fois qu'on change de moment (la nuit de 22 h à 6 h compte pour un seul bloc)
const MOMENTS = [
  [6, "☀️ Matin"],
  [12, "🌤️ Après-midi"],
  [18, "🌆 Soirée"],
  [22, "🌙 Nuit"],
];
function avecMoments(liste, dateDe, creerLigne) {
  const noeuds = [];
  let avant = null;
  liste.forEach((x) => {
    const d = new Date(dateDe(x));
    const h = d.getHours();
    // La nuit après minuit appartient à la soirée de la veille
    const jour = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (h < 6 ? 1 : 0));
    const i = h < 6 ? 3 : MOMENTS.findLastIndex(([debut]) => h >= debut);
    const cle = `${jour.toDateString()}-${i}`;
    if (cle !== avant) {
      const li = document.createElement("li");
      li.className = "h-moment";
      li.setAttribute("aria-hidden", "true");
      const hier = new Date(minuit().getTime() - 86400000).toDateString() === jour.toDateString();
      const aujourdhui = minuit().toDateString() === jour.toDateString();
      // La nuit qui a commencé hier soir, c'est « cette nuit »
      li.textContent = i === 3 && hier ? "🌙 Cette nuit" : MOMENTS[i][1] + (aujourdhui ? "" : " · hier");
      noeuds.push(li);
      avant = cle;
    }
    noeuds.push(creerLigne(x));
  });
  return noeuds;
}

// Bouton ✕ : deux appuis pour supprimer, pour éviter les erreurs
function boutonSupprimer(label, onConfirm) {
  const del = document.createElement("button");
  if (typeof peutModifier === "function" && !peutModifier()) {
    del.hidden = true;
    return del;
  }
  del.type = "button";
  del.className = "del";
  del.textContent = "✕";
  del.setAttribute("aria-label", label);
  del.addEventListener("click", () => {
    if (del.classList.contains("confirm")) return onConfirm();
    del.classList.add("confirm");
    del.textContent = "Supprimer ?";
    setTimeout(() => {
      del.classList.remove("confirm");
      del.textContent = "✕";
    }, 3000);
  });
  return del;
}

// Groupe de pastilles à choix unique
function rendreChips(conteneurId, options, getValeur, setValeur, libelle, avecInconnu = true) {
  const valeurs = avecInconnu ? [...options, null] : options;
  const rendre = () =>
    $(conteneurId).replaceChildren(
      ...valeurs.map((v) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "chip";
        b.setAttribute("role", "radio");
        b.setAttribute("aria-checked", String(v === getValeur()));
        b.textContent = v === null ? "Je ne sais pas" : libelle(v);
        b.addEventListener("click", () => {
          setValeur(v);
          rendre();
        });
        return b;
      })
    );
  rendre();
  return rendre;
}

// Préférences retenues sur ce téléphone
// Toutes les données gardées sur le téléphone portent le préfixe « hortense: »,
// pour ne jamais se mélanger avec une autre appli hébergée à la même adresse (ex. le carnet de Noah)
const PREFIXE_MEMOIRE = "hortense:";
function lire(cle, defaut, valide) {
  try {
    const brut = localStorage.getItem(PREFIXE_MEMOIRE + cle);
    if (brut !== null) {
      const v = JSON.parse(brut);
      if (valide(v)) return v;
    }
  } catch (e) {}
  return defaut;
}
function ecrire(cle, v) {
  try {
    localStorage.setItem(PREFIXE_MEMOIRE + cle, JSON.stringify(v));
  } catch (e) {}
}

// Liens « Maintenant » : vident le champ heure associé
document.querySelectorAll("[data-now]").forEach((b) =>
  b.addEventListener("click", () => ($(b.dataset.now).value = ""))
);

// ---------- Rafraîchissement ----------
// Chaque page s'enregistre ici : tick() chaque seconde, charger() chaque minute
const rubriques = [];
function enregistrerRubrique(r) {
  rubriques.push(r);
}
// Recharge toutes les pages (quand une action sur l'une change les données d'une autre)
const rechargerTout = () => Promise.all(rubriques.map((r) => r.charger()));

// La nuit, pour l'appli : de 23 h à 7 h
const estLaNuit = (d = new Date()) => d.getHours() >= 23 || d.getHours() < 7;
// Le décor suit l'heure (vérifié chaque minute) :
// aube rosée 6 h – 9 h, coucher de soleil 17 h – 20 h, crépuscule 20 h – 22 h,
// mode nuit doux 22 h – 6 h (couleurs sombres et chaudes), l'ourson bâille de 19 h à 23 h
function majNuitDouce() {
  const h = new Date().getHours();
  const c = document.documentElement.classList;
  c.toggle("nuit-douce", h >= 22 || h < 6);
  c.toggle("ciel-aube", h >= 6 && h < 9);
  c.toggle("ciel-couchant", h >= 17 && h < 20);
  c.toggle("ciel-crepuscule", h >= 20 && h < 22);
  c.toggle("soir", h >= 19 && h < 23);
}
majNuitDouce();
setInterval(majNuitDouce, 60 * 1000);

// Les totaux (nombre de repas, de couches…) défilent jusqu'à leur nouvelle valeur
(() => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const connus = new WeakMap();
  const enCours = new WeakSet();
  function defiler(el, de, a) {
    enCours.add(el);
    const debut = performance.now();
    const duree = Math.min(900, 250 + Math.abs(a - de) * 60);
    (function image(t) {
      const p = Math.min(1, (t - debut) / duree);
      const v = Math.round(de + (a - de) * (1 - Math.pow(1 - p, 3)));
      el.textContent = String(v);
      if (p < 1) requestAnimationFrame(image);
      else {
        el.textContent = String(a);
        connus.set(el, a);
        queueMicrotask(() => enCours.delete(el));
      }
    })(debut);
  }
  const obs = new MutationObserver((changes) => {
    new Set(changes.map((m) => (m.target.nodeType === 3 ? m.target.parentElement : m.target))).forEach((el) => {
      if (!el || enCours.has(el)) return;
      const n = Number(el.textContent);
      const avant = connus.get(el) ?? 0;
      if (!Number.isInteger(n) || n === avant) return connus.set(el, n);
      el.textContent = String(avant); // repart de l'ancienne valeur
      defiler(el, avant, n);
    });
  });
  document.querySelectorAll('[id$="-count"]').forEach((el) => {
    connus.set(el, 0);
    obs.observe(el, { childList: true, characterData: true, subtree: true });
  });
})();

// En arrivant sur une page, ses cartes glissent doucement en place l'une après l'autre
let derniereVue = null;
window.addEventListener("page-vue", (e) => {
  if (e.detail === derniereVue) return;
  derniereVue = e.detail;
  const page = $(e.detail);
  if (!page || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  [...page.querySelectorAll(":scope > section, :scope > .card")].filter((c) => !c.hidden).slice(0, 8).forEach((c, i) => {
    c.classList.remove("arrive");
    void c.offsetWidth;
    c.style.animationDelay = `${i * 60}ms`;
    c.classList.add("arrive");
  });
});
async function demarrerRafraichissement() {
  await connexionPrete; // fourni par auth.js
  const toutCharger = () => {
    envoyerFile();
    rubriques.forEach((r) => r.charger());
  };
  toutCharger();
  majBadgeAttente();
  setInterval(() => rubriques.forEach((r) => r.tick && r.tick()), 1000);
  setInterval(toutCharger, 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) toutCharger();
  });
}

// Prévient pages.js que la hauteur d'une page a pu changer
const contenuChange = () => window.dispatchEvent(new Event("contenu-change"));

// Échappe un texte saisi avant de l'insérer dans du HTML
const esc = (t) =>
  String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Petite étiquette « 👵 par Mamou » sur ce que les grands-parents ont noté (recopié depuis la page Garde)
const parGardien = (x) => (x && x.gardien ? `<span class="h-par">👵 par ${esc(x.gardien)}</span>` : "");

// ---------- Fenêtre de modification ----------
// champs : [{ cle, label, type: "time" | "select" | "check", valeur, options: [[valeur, libellé], …] }]
// Renvoie les nouvelles valeurs, ou null si on annule.
function editer(titre, champs) {
  const dlg = $("edit-dialog");
  $("edit-title").textContent = titre;
  $("edit-fields").replaceChildren(
    ...champs.map((c) => {
      const label = document.createElement("label");
      label.className = "field" + (c.type === "check" ? " check-field" : " wide");
      const span = document.createElement("span");
      span.textContent = c.label;
      let input;
      if (c.type === "select") {
        input = document.createElement("select");
        c.options.forEach(([v, l]) => {
          const o = document.createElement("option");
          o.value = v === null ? "" : String(v);
          o.textContent = l;
          input.append(o);
        });
        input.value = c.valeur === null || c.valeur === undefined ? "" : String(c.valeur);
      } else if (c.type === "date") {
        // Date en trois menus (jour, mois, année) plutôt que le calendrier d'Apple (même souci que la roue d'heure)
        input = document.createElement("input");
        input.type = "hidden";
        input.value = c.valeur || "";
        const [a0, m0, j0] = (c.valeur || "").split("-");
        const an = new Date().getFullYear();
        const menu = (options, valeur, nom) => {
          const sel = document.createElement("select");
          sel.setAttribute("aria-label", nom);
          options.forEach(([v, l]) => {
            const o = document.createElement("option");
            o.value = v;
            o.textContent = l;
            sel.append(o);
          });
          sel.value = valeur;
          return sel;
        };
        const MOIS = ["janv.", "févr.", "mars", "avril", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
        const jours = menu(Array.from({ length: 31 }, (_, i) => [pad(i + 1), String(i + 1)]), j0, "Jour");
        const mois = menu(MOIS.map((m, i) => [pad(i + 1), m]), m0, "Mois");
        const annees = [...new Set([Number(a0) || an, an - 1, an, an + 1, an + 2])].sort();
        const annee = menu(annees.map((a) => [String(a), String(a)]), a0 || String(an), "Année");
        const maj = () => {
          // 31 février → dernier jour du mois
          const dernier = new Date(Number(annee.value), Number(mois.value), 0).getDate();
          if (Number(jours.value) > dernier) jours.value = pad(dernier);
          input.value = `${annee.value}-${mois.value}-${jours.value}`;
        };
        [jours, mois, annee].forEach((s) => s.addEventListener("change", maj));
        const boite = document.createElement("span");
        boite.className = "heure-menus date-menus";
        boite.append(jours, mois, annee);
        input.dataset.cle = c.cle;
        label.append(span, boite, input);
        return label;
      } else if (c.type === "textarea") {
        input = document.createElement("textarea");
        input.rows = 4;
        input.maxLength = c.max || 1000;
        if (c.placeholder) input.placeholder = c.placeholder;
        input.value = c.valeur || "";
      } else if (c.type === "time") {
        // Heure en deux menus (heures, minutes) plutôt que la roue d'Apple :
        // dans cette fenêtre, la roue bloquait voire faisait planter certains iPhone (iOS 26)
        input = document.createElement("input");
        input.type = "hidden";
        input.value = c.valeur || "";
        const [h0, m0] = (c.valeur || "00:00").split(":");
        const menu = (max, valeur, nom) => {
          const sel = document.createElement("select");
          sel.setAttribute("aria-label", nom);
          for (let i = 0; i < max; i++) {
            const o = document.createElement("option");
            o.value = o.textContent = pad(i);
            sel.append(o);
          }
          sel.value = valeur;
          return sel;
        };
        const heures = menu(24, h0, "Heures");
        const minutes = menu(60, m0, "Minutes");
        const maj = () => (input.value = `${heures.value}:${minutes.value}`);
        heures.addEventListener("change", maj);
        minutes.addEventListener("change", maj);
        const boite = document.createElement("span");
        boite.className = "heure-menus";
        const deuxPoints = document.createElement("span");
        deuxPoints.textContent = ":";
        boite.append(heures, deuxPoints, minutes);
        input.dataset.cle = c.cle;
        label.append(span, boite, input);
        return label;
      } else {
        input = document.createElement("input");
        input.type = c.type === "check" ? "checkbox" : c.type;
        if (c.type === "check") input.checked = !!c.valeur;
        else input.value = c.valeur || "";
      }
      input.dataset.cle = c.cle;
      if (c.type === "check") label.append(input, span);
      else label.append(span, input);
      return label;
    })
  );
  // Les deux boutons ferment la fenêtre eux-mêmes (sans passer par l'envoi du formulaire,
  // que certains iPhone gèrent mal dans une fenêtre) : « valide » dit si on enregistre.
  let valide = false;
  return new Promise((resolve) => {
    dlg.addEventListener(
      "close",
      () => {
        if (!valide) return resolve(null);
        const r = {};
        $("edit-fields").querySelectorAll("[data-cle]").forEach((el) => {
          r[el.dataset.cle] = el.type === "checkbox" ? el.checked : el.value.trim() === "" ? null : el.value.trim();
        });
        resolve(r);
      },
      { once: true }
    );
    $("edit-erreur").textContent = "";
    const enregistrer = () => {
      // Heure à moitié effacée (« --:32 ») : on le dit au lieu de bloquer sans rien afficher
      const incomplet = [...$("edit-fields").querySelectorAll("input")].find((el) => el.validity.badInput);
      if (incomplet) {
        $("edit-erreur").textContent = incomplet.type === "time" ? "L'heure est incomplète : complète-la, ou touche Annuler." : "Un champ est incomplet.";
        incomplet.focus();
        return;
      }
      valide = true;
      dlg.close("ok");
    };
    $("edit-ok").onclick = enregistrer;
    $("edit-annuler").onclick = () => dlg.close("annuler");
    // Touche « OK / Entrée » du clavier : même chose que le bouton Enregistrer
    $("edit-form").onsubmit = (e) => {
      e.preventDefault();
      enregistrer();
    };
    dlg.showModal();
  });
}

// « 14:05 » d'une date
const hhmm = (d) => {
  d = new Date(d);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Remplace l'heure d'une date en gardant son jour ; si ça tombe dans le futur, c'est la veille
function memeJourA(dateOrigine, heure) {
  const [h, m] = heure.split(":").map(Number);
  const d = new Date(dateOrigine);
  d.setHours(h, m, 0, 0);
  if (d.getTime() > Date.now() + 60 * 1000) d.setDate(d.getDate() - 1);
  return d;
}

// Rend une ligne d'historique touchable pour la modifier (le bouton ✕ garde son rôle)
function rendreModifiable(li, onEdit) {
  if (typeof peutModifier === "function" && !peutModifier()) return;
  li.classList.add("editable");
  li.setAttribute("title", "Toucher pour modifier");
  li.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    onEdit();
  });
}

// ---------- Mise à jour automatique ----------
// En revenant sur l'appli (et toutes les 10 min), on regarde si une nouvelle version est en ligne.
let rechargementPrevu = false;
async function verifierMiseAJour() {
  if (rechargementPrevu || location.hostname === "localhost") return;
  try {
    const res = await fetch(`version.txt?${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;
    const v = (await res.text()).trim();
    if (!v || v === VERSION_APPLI) return;
    // Pas pendant qu'on écrit ou qu'une fenêtre est ouverte
    const occupe = document.querySelector("dialog[open]") || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
    if (occupe) return;
    rechargementPrevu = true;
    toast("✨ Nouvelle version, mise à jour…");
    setTimeout(() => location.reload(), 900);
  } catch (e) {}
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) verifierMiseAJour();
});
setInterval(verifierMiseAJour, 10 * 60 * 1000);
setTimeout(verifierMiseAJour, 3000);

// ---------- Fenêtres : le fond ne bouge plus quand une fenêtre est ouverte ----------
// (sur iPhone, « overflow: hidden » ne suffit pas : on fige la page à sa position puis on la rend à la fermeture)
(() => {
  let ouvertes = 0;
  let y = 0;
  const bloquer = () => {
    if (ouvertes++ > 0) return;
    y = window.scrollY;
    document.body.style.top = `-${y}px`;
    document.body.classList.add("fond-bloque");
  };
  const debloquer = () => {
    ouvertes = Math.max(0, ouvertes - 1);
    if (ouvertes > 0) return;
    document.body.classList.remove("fond-bloque");
    document.body.style.top = "";
    window.scrollTo({ top: y, behavior: "instant" });
  };
  const ouvrirOrigine = HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal = function () {
    if (this.open) return;
    ouvrirOrigine.call(this);
    bloquer();
    this.addEventListener("close", debloquer, { once: true });
  };
})();

// Une ligne recopiée depuis la garde se modifie à la source (garde_evenements) :
// sinon la prochaine modification des grands-parents effacerait la correction des parents.
// « champs » : { colonne du carnet: colonne de la garde }
async function modifierLigne(table, ligne, maj, champs = {}) {
  if (!ligne.garde_id) return api(table, `?id=eq.${ligne.id}`, { method: "PATCH", body: JSON.stringify(maj) });
  const source = {};
  const reste = {};
  Object.entries(maj).forEach(([k, v]) => (k in champs ? (source[champs[k]] = v) : (reste[k] = v)));
  if (Object.keys(source).length) await api("garde_evenements", `?id=eq.${ligne.garde_id}`, { method: "PATCH", body: JSON.stringify(source) });
  if (Object.keys(reste).length) await api(table, `?id=eq.${ligne.id}`, { method: "PATCH", body: JSON.stringify(reste) });
}
const CHAMPS_GARDE = {
  biberons: { pris_le: "quand", quantite_ml: "ml", lait: "lait" },
  couches: { change_le: "quand", pipi: "pipi", caca: "caca" },
  sommeils: { debut: "quand", fin: "fin" },
};

// ---------- Dodo oublié ----------
// Un dodo de plus de 12 h, c'est presque sûrement un réveil qu'on a oublié de noter.
const DODO_OUBLIE_MS = 12 * 60 * 60 * 1000;
const dodoOublie = (debut) => Date.now() - new Date(debut).getTime() > DODO_OUBLIE_MS;
// Grande fenêtre simple : « À quelle heure s'est-elle réveillée ? » ou « Je ne sais plus, effacer ».
// Renvoie { fin: Date }, { effacer: true } ou null (plus tard).
function demanderReveilOublie(debut) {
  const d0 = new Date(debut);
  const dlg = $("oubli-dialog");
  const jour = d0.toDateString() === new Date().toDateString() ? "aujourd'hui" : d0.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  $("oubli-texte").textContent = `Le dodo commencé ${jour} à ${fmtHeure(d0)} n'a pas été arrêté. À quelle heure Hortense s'est-elle réveillée ?`;
  // Proposition : 1 h après l'endormissement
  const propose = new Date(d0.getTime() + 60 * 60 * 1000);
  const remplir = (sel, max, valeur) => {
    sel.replaceChildren(...Array.from({ length: max }, (_, i) => new Option(pad(i), pad(i))));
    sel.value = pad(valeur);
  };
  remplir($("oubli-h"), 24, propose.getHours());
  remplir($("oubli-m"), 60, Math.floor(propose.getMinutes() / 5) * 5);
  $("oubli-erreur").textContent = "";
  return new Promise((ok) => {
    const fermer = (r) => {
      dlg.close();
      ok(r);
    };
    $("oubli-ok").onclick = () => {
      const fin = new Date(d0);
      fin.setHours(Number($("oubli-h").value), Number($("oubli-m").value), 0, 0);
      if (fin <= d0) fin.setDate(fin.getDate() + 1); // ex. endormi à 23:00, réveillé à 01:30
      if (fin > new Date()) return ($("oubli-erreur").textContent = "Cette heure est dans le futur : vérifie.");
      if (fin - d0 > DODO_OUBLIE_MS) return ($("oubli-erreur").textContent = "Ça ferait plus de 12 h de dodo : vérifie l'heure.");
      fermer({ fin });
    };
    $("oubli-effacer").onclick = () => fermer({ effacer: true });
    $("oubli-plus-tard").onclick = () => fermer(null);
    dlg.showModal();
  });
}
