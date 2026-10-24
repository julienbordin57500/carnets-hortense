// 🧸 Mode découverte : une petite base de données simulée, gardée sur ce téléphone.
// Elle répond aux mêmes demandes que la vraie base (Supabase / PostgREST) utilisée par l'appli,
// pour que tout fonctionne avant que la vraie base soit branchée.
(() => {
  if (!CONFIG.demo) return;

  const CLE = "demo-base";
  const maintenant = () => new Date().toISOString();
  const aujourdhui = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  // Valeurs par défaut de chaque table (comme dans la vraie base)
  const DEFAUTS = {
    biberons: () => ({ type: "biberon", pris_le: maintenant(), quantite_ml: null, cote: null, duree_min: null, lait: null, reprise_sommeil: false }),
    couches: () => ({ change_le: maintenant(), pipi: false, caca: false, caca_taille: null }),
    sommeils: () => ({ debut: maintenant(), fin: null }),
    sante_profil: () => ({}),
    rendez_vous: () => ({ type: "pediatre", titre: null, lieu: null, notes: null, fait: false }),
    mesures: () => ({ mesure_le: aujourdhui(), poids_kg: null, taille_cm: null, pc_cm: null }),
    suivi_calendrier: () => ({ fait_le: aujourdhui() }),
    garde_jours: () => ({ gardien: null, note: null, updated_at: maintenant() }),
    garde_evenements: () => ({ quand: maintenant(), fin: null, ml: null, lait: null, pipi: null, caca: null, gardien: null }),
    medicaments_prises: () => ({ dose: null, pris_le: maintenant(), par: null }),
    premieres_fois: () => ({ le: aujourdhui(), note: null }),
  };
  // Clés uniques (pour les mises à jour « ajouter ou remplacer »)
  const CLES = { suivi_calendrier: ["cle"], garde_jours: ["jour", "gardien"], sante_profil: ["id"] };

  const vide = () => ({
    tables: Object.fromEntries(Object.keys(DEFAUTS).map((t) => [t, []])),
    seq: {},
  });
  function charger() {
    const b = lire(CLE, null, (v) => v && v.tables);
    const base = b || vide();
    Object.keys(DEFAUTS).forEach((t) => (base.tables[t] = base.tables[t] || []));
    if (!base.tables.sante_profil.length) base.tables.sante_profil.push({ id: 1 });
    return base;
  }
  const sauver = (base) => ecrire(CLE, base);

  // ---------- Filtres façon PostgREST ----------
  const estDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);
  function comparer(a, b) {
    if (a === null || a === undefined) return NaN;
    if (typeof a === "number") return a - Number(b);
    if (typeof a === "boolean") return Number(a) - Number(b === "true");
    if (estDate(a) && estDate(b)) return Date.parse(a) - Date.parse(b);
    return String(a).localeCompare(String(b));
  }
  function condition(ligne, col, expr) {
    const neg = expr.startsWith("not.");
    if (neg) expr = expr.slice(4);
    const i = expr.indexOf(".");
    const op = expr.slice(0, i);
    const val = expr.slice(i + 1);
    const v = ligne[col];
    let ok;
    switch (op) {
      case "eq":
        ok = typeof v === "boolean" ? v === (val === "true") : String(v) === val;
        break;
      case "neq":
        ok = String(v) !== val;
        break;
      case "gte":
        ok = comparer(v, val) >= 0;
        break;
      case "gt":
        ok = comparer(v, val) > 0;
        break;
      case "lte":
        ok = comparer(v, val) <= 0;
        break;
      case "lt":
        ok = comparer(v, val) < 0;
        break;
      case "is":
        ok = val === "null" ? v === null || v === undefined : v === (val === "true");
        break;
      default:
        ok = true;
    }
    return neg ? !ok : ok;
  }
  function filtrer(lignes, params) {
    const filtres = [];
    for (const [k, v] of params) {
      if (["select", "order", "limit", "on_conflict", "offset"].includes(k)) continue;
      if (k === "or") {
        const parts = v.replace(/^\(|\)$/g, "").split(",");
        filtres.push((l) =>
          parts.some((p) => {
            const j = p.indexOf(".");
            return condition(l, p.slice(0, j), p.slice(j + 1));
          })
        );
      } else filtres.push((l) => condition(l, k, v));
    }
    return lignes.filter((l) => filtres.every((f) => f(l)));
  }
  function trier(lignes, order) {
    if (!order) return lignes;
    const crit = order.split(",").map((o) => {
      const [col, sens] = o.split(".");
      return { col, desc: sens === "desc" };
    });
    return [...lignes].sort((a, b) => {
      for (const { col, desc } of crit) {
        const x = a[col], y = b[col];
        if (x === y) continue;
        if (x === null || x === undefined) return 1;
        if (y === null || y === undefined) return -1;
        const c = typeof x === "number" ? x - y : estDate(x) ? Date.parse(x) - Date.parse(y) : String(x).localeCompare(String(y));
        if (c) return desc ? -c : c;
      }
      return 0;
    });
  }

  const reponse = (corps, statut = 200, entetes = {}) =>
    new Response(corps === null ? null : JSON.stringify(corps), {
      status: statut,
      headers: { "Content-Type": "application/json", ...entetes },
    });

  // Même calcul que la fonction resume_famille() de la vraie base
  function resumeFamille(t) {
    const debutJour = new Date();
    debutJour.setHours(0, 0, 0, 0);
    const maintenantMs = Date.now();
    const repas = [
      ...t.biberons.map((b) => ({ quand: b.pris_le, type: b.type, ml: b.quantite_ml, lait: b.lait, duree_min: b.duree_min, ou: "maison" })),
      ...t.garde_evenements.filter((g) => g.type === "repas").map((g) => ({ quand: g.quand, type: "biberon", ml: g.ml, lait: g.lait, duree_min: null, ou: "garde" })),
    ];
    const couches = [
      ...t.couches.map((c) => ({ quand: c.change_le, pipi: c.pipi, caca: c.caca, ou: "maison" })),
      ...t.garde_evenements.filter((g) => g.type === "couche").map((g) => ({ quand: g.quand, pipi: !!g.pipi, caca: !!g.caca, ou: "garde" })),
    ];
    const dodos = [...t.sommeils.map((s) => ({ debut: s.debut, fin: s.fin })), ...t.garde_evenements.filter((g) => g.type === "sommeil").map((g) => ({ debut: g.quand, fin: g.fin }))];
    const dernier = (l) => l.slice().sort((a, b) => new Date(b.quand) - new Date(a.quand))[0] || null;
    const max = (l) => (l.length ? l.reduce((a, b) => (new Date(b) > new Date(a) ? b : a)) : null);
    const minutes = dodos.reduce((tot, d) => {
      const fin = Math.min(d.fin ? new Date(d.fin).getTime() : maintenantMs, maintenantMs);
      const debut = Math.max(new Date(d.debut).getTime(), debutJour.getTime());
      return tot + Math.max(0, fin - debut);
    }, 0) / 60000;
    return {
      dernier_repas: dernier(repas),
      derniere_couche: dernier(couches),
      dernier_caca_aujourdhui: max(couches.filter((c) => c.caca && new Date(c.quand) >= debutJour).map((c) => c.quand)),
      sommeil_aujourdhui_min: Math.round(minutes),
      dort_depuis: max(dodos.filter((d) => !d.fin).map((d) => d.debut)),
      dernier_reveil: max(dodos.filter((d) => d.fin).map((d) => d.fin)),
    };
  }

  // ---------- Traitement d'une demande ----------
  function traiter(url, options = {}) {
    const methode = (options.method || "GET").toUpperCase();
    const u = new URL(url);
    const chemin = u.pathname.replace(/^\/rest\/v1\/?/, "");
    if (!chemin) return reponse({}); // vérification « le serveur répond-il ? »
    if (chemin === "rpc/resume_famille") return reponse(resumeFamille(charger().tables));
    const table = chemin.split("/")[0];
    if (!DEFAUTS[table]) return reponse({ message: "table inconnue" }, 404);
    const base = charger();
    const lignes = base.tables[table];
    const params = [...u.searchParams.entries()];
    const entetes = new Headers(options.headers || {});
    const prefer = entetes.get("Prefer") || "";

    if (methode === "GET" || methode === "HEAD") {
      let res = trier(filtrer(lignes, params), u.searchParams.get("order"));
      const total = res.length;
      const limite = Number(u.searchParams.get("limit"));
      if (limite) res = res.slice(0, limite);
      const extra = prefer.includes("count=exact") ? { "Content-Range": `0-${Math.max(0, res.length - 1)}/${total}` } : {};
      return reponse(methode === "HEAD" ? null : res, 200, extra);
    }

    if (methode === "POST") {
      const corps = JSON.parse(options.body || "{}");
      const nouvelles = Array.isArray(corps) ? corps : [corps];
      const cles = (u.searchParams.get("on_conflict") || "").split(",").filter(Boolean);
      const cleUnique = cles.length ? cles : CLES[table];
      const sortie = [];
      for (const n of nouvelles) {
        // Une seule sieste en cours à la fois (comme dans la vraie base)
        const sommeilOuvert =
          (table === "sommeils" && !n.fin && lignes.some((l) => !l.fin)) ||
          (table === "garde_evenements" && n.type === "sommeil" && !n.fin && lignes.some((l) => l.type === "sommeil" && !l.fin));
        if (sommeilOuvert) return reponse({ message: "déjà en cours" }, 409);
        const existante = cleUnique && lignes.find((l) => cleUnique.every((c) => String(l[c]) === String(n[c])));
        if (existante) {
          if (prefer.includes("ignore-duplicates")) continue;
          if (prefer.includes("merge-duplicates")) {
            Object.assign(existante, n);
            sortie.push(existante);
            continue;
          }
          return reponse({ message: "existe déjà" }, 409);
        }
        const ligne = { ...DEFAUTS[table](), ...n, created_at: maintenant() };
        if (!CLES[table] || table === "sante_profil") {
          base.seq[table] = (base.seq[table] || lignes.reduce((m, l) => Math.max(m, l.id || 0), 0)) + 1;
          if (ligne.id === undefined) ligne.id = base.seq[table];
        }
        lignes.push(ligne);
        sortie.push(ligne);
      }
      sauver(base);
      return reponse(sortie, 201);
    }

    if (methode === "PATCH") {
      const champs = JSON.parse(options.body || "{}");
      const cibles = filtrer(lignes, params);
      cibles.forEach((l) => Object.assign(l, champs));
      sauver(base);
      return reponse(cibles);
    }

    if (methode === "DELETE") {
      const cibles = new Set(filtrer(lignes, params));
      base.tables[table] = lignes.filter((l) => !cibles.has(l));
      sauver(base);
      return reponse([...cibles]);
    }
    return reponse({ message: "non pris en charge" }, 400);
  }

  // Toutes les demandes vers la base passent par ici en mode découverte
  const fetchOrigine = window.fetch.bind(window);
  window.fetch = async (entree, options) => {
    const url = typeof entree === "string" ? entree : entree.url;
    if (url.startsWith(SUPABASE_URL)) {
      await new Promise((r) => setTimeout(r, 60)); // petite pause, comme un vrai réseau
      return traiter(url, options);
    }
    return fetchOrigine(entree, options);
  };

  // ---------- Exemple et remise à zéro ----------
  function remplirExemple() {
    const base = vide();
    const t = base.tables;
    const H = 3600000;
    const now = Date.now();
    let id = 1;
    const iso = (ms) => new Date(ms).toISOString();
    const jour = (d) => {
      const x = new Date(now - d * 86400000);
      x.setHours(0, 0, 0, 0);
      return x.getTime();
    };
    for (let d = 6; d >= 0; d--) {
      const j = jour(d);
      [2.5, 6, 9.5, 13, 16.5, 20].forEach((h, k) => {
        const quand = j + h * H + ((d * 7 + k * 11) % 20) * 60000;
        if (quand > now) return;
        const allaitement = k === 0 || k === 5;
        t.biberons.push({ id: id++, type: allaitement ? "allaitement" : "biberon", pris_le: iso(quand), quantite_ml: allaitement ? null : [90, 100, 110, 120][(d + k) % 4], cote: allaitement ? ["gauche", "droite"][d % 2] : null, duree_min: allaitement ? 15 : null, lait: allaitement ? null : "maternel", reprise_sommeil: false, created_at: iso(quand) });
        t.couches.push({ id: id++, change_le: iso(quand + 20 * 60000), pipi: true, caca: k % 2 === 0, caca_taille: k % 2 === 0 ? ["petit", "moyen"][d % 2] : null, created_at: iso(quand) });
      });
      [[10, 1.5], [14, 2], [21, 5 + (d % 3)]].forEach(([h, duree]) => {
        const debut = j + h * H;
        if (debut + duree * H < now) t.sommeils.push({ id: id++, debut: iso(debut), fin: iso(debut + duree * H), created_at: iso(debut) });
      });
    }
    const naissance = new Date(now - 62 * 86400000);
    t.sante_profil = [{ id: 1, date_naissance: `${naissance.getFullYear()}-${String(naissance.getMonth() + 1).padStart(2, "0")}-${String(naissance.getDate()).padStart(2, "0")}`, poids_naissance_g: 3250, taille_naissance_cm: 49, groupe_sanguin: null, allergies: null, pediatre_nom: "Dr Exemple", notes: "Données d'exemple du mode découverte" }];
    t.mesures.push({ id: id++, mesure_le: aujourdhui(), poids_kg: 4.9, taille_cm: 56, pc_cm: 38, created_at: maintenant() });
    t.rendez_vous.push({ id: id++, quand: iso(jour(-3) + 10.5 * H), type: "pediatre", titre: "Visite du 2e mois", lieu: null, notes: null, fait: false, created_at: maintenant() });
    t.garde_jours.push({ jour: aujourdhui(), gardien: "Grands-parents", note: "Belle balade au jardin, elle a souri en voyant les fleurs 🌸", updated_at: iso(now - 2 * H), created_at: iso(now - 2 * H) });
    t.garde_evenements.push({ id: id++, type: "repas", quand: iso(now - 3 * H), ml: 110, lait: "maternel", gardien: "Grands-parents", created_at: iso(now - 3 * H) });
    t.medicaments_prises.push({ id: id++, nom: "Vitamine D", dose: "1 goutte", pris_le: iso(jour(0) + 9 * H), par: "Parents", created_at: iso(jour(0) + 9 * H) });
    t.premieres_fois.push({ id: id++, quoi: "Premier sourire", le: aujourdhui(), note: null, created_at: maintenant() });
    base.seq = Object.fromEntries(Object.keys(t).map((k) => [k, id]));
    sauver(base);
  }

  window.demo = {
    remplirExemple() {
      remplirExemple();
      toast("🧸 Exemple chargé");
      rechargerTout();
    },
    toutEffacer() {
      sauver(vide());
      toast("🧸 Carnet remis à zéro");
      rechargerTout();
    },
  };

  // Petit bouton « 🧸 Mode découverte » sous le nom, et indice sur l'écran de connexion
  $("login-demo").hidden = false;
  window.addEventListener("connecte", () => ($("demo-ouvrir").hidden = !estParent()));
  $("demo-ouvrir").addEventListener("click", () => $("demo-dialog").showModal());
  $("demo-exemple").addEventListener("click", () => {
    window.demo.remplirExemple();
    $("demo-dialog").close();
  });
  $("demo-effacer").addEventListener("click", async () => {
    if (!(await demanderConfirmation("Effacer tout ce qui a été noté sur ce téléphone ?", "Effacer"))) return;
    window.demo.toutEffacer();
    $("demo-dialog").close();
  });
})();
