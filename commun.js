// Outils partagés par les pages Repas, Couches et Sommeil

// Connexion Supabase (clé publique : la sécurité est gérée par les règles RLS des tables)
// Adresse et clé publique de la base (voir config.js). En mode découverte, une base simulée répond (demo.js).
const SUPABASE_URL = CONFIG.demo ? "https://demo.carnets-hortense.local" : CONFIG.supabaseUrl;
const SUPABASE_KEY = CONFIG.demo ? "demo" : CONFIG.supabaseKey;

const DAY_MS = 24 * 60 * 60 * 1000;
const $ = (id) => document.getElementById(id);

// Version de l'appli : quand elle change sur le serveur, les téléphones se mettent à jour tout seuls
const VERSION_APPLI = "4";

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
  if (e.target.closest("#diag-vider") && confirm("Effacer les ajouts en attente ? Ils ne seront jamais envoyés.")) {
    ecrire(FILE, []);
    $("diag").close();
    majBadgeAttente();
    toast("File d'attente vidée");
  }
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
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2200);
}

function animerBouton(btn) {
  btn.classList.remove("pop");
  void btn.offsetWidth;
  btn.classList.add("pop");
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
  return new Promise((resolve) => {
    dlg.addEventListener(
      "close",
      () => {
        if (dlg.returnValue !== "ok") return resolve(null);
        const r = {};
        $("edit-fields").querySelectorAll("[data-cle]").forEach((el) => {
          r[el.dataset.cle] = el.type === "checkbox" ? el.checked : el.value === "" ? null : el.value;
        });
        resolve(r);
      },
      { once: true }
    );
    dlg.returnValue = "";
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
