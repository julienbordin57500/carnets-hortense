// 🎉 Les petites fêtes : confettis plein écran pour les grands moments d'Hortense
// - détectés tout seuls : son âge (1 semaine, chaque mois, 100 jours, anniversaires), son poids
//   (doublé depuis la naissance, chaque kilo), sa taille, sa première nuit de 6 h puis de 8 h,
//   le 100e / 500e / 1000e repas ou couche
// - notés à la main : « Ses premières fois » (premier sourire, première dent, premiers pas…) dans Santé
// Chaque fête n'est montrée qu'une fois par téléphone.
(() => {
  const VUES = "fetes-vues";
  const PREMIERES = [
    ["😊", "Premier sourire"],
    ["😂", "Premier éclat de rire"],
    ["💪", "Tient sa tête"],
    ["🔄", "Se retourne"],
    ["✋", "Attrape un objet"],
    ["🦷", "Première dent"],
    ["🥕", "Premier repas solide"],
    ["🪑", "S'assoit toute seule"],
    ["🐾", "Fait du 4 pattes"],
    ["🧍", "Tient debout"],
    ["👣", "Premiers pas"],
    ["💬", "Premier mot"],
    ["👋", "Fait coucou"],
    ["🛁", "Premier bain"],
    ["🌳", "Première sortie"],
  ];
  const emojiPremiere = (quoi) => (PREMIERES.find(([, q]) => q === quoi) || ["🌟"])[0];

  let premieres = [];
  let derniereVerif = 0;

  // ---------- Confettis ----------
  const COULEURS = ["#f3b3c2", "#e9a3b2", "#c9a7d8", "#a9bb9c", "#f6c9a8", "#e2b86f", "#fbe3e8"];
  const ANIMAUX = ["🧸", "🌸", "🦋", "🐰", "💗", "⭐"];
  function confettis() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const c = document.createElement("canvas");
    c.className = "confettis";
    document.body.append(c);
    const ctx = c.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = (c.width = innerWidth * dpr);
    const H = (c.height = innerHeight * dpr);
    const morceaux = Array.from({ length: 170 }, (_, i) => ({
      x: W / 2 + (Math.random() - 0.5) * W * 0.3,
      y: H * 0.55,
      vx: (Math.random() - 0.5) * 26 * dpr,
      vy: (-Math.random() * 22 - 12) * dpr,
      r: (Math.random() * 6 + 4) * dpr,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      couleur: COULEURS[i % COULEURS.length],
      forme: i % 9 === 0 ? "animal" : i % 3 === 0 ? "rond" : "carre",
      animal: ANIMAUX[i % ANIMAUX.length],
    }));
    const debut = performance.now();
    (function image(t) {
      const age = t - debut;
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = Math.max(0, Math.min(1, (4200 - age) / 900));
      morceaux.forEach((m) => {
        m.vy += 0.55 * dpr; // gravité
        m.vx *= 0.985;
        m.x += m.vx;
        m.y += m.vy;
        m.rot += m.vr;
        ctx.save();
        ctx.translate(m.x, m.y);
        ctx.rotate(m.rot);
        if (m.forme === "animal") {
          ctx.font = `${m.r * 3.2}px serif`;
          ctx.fillText(m.animal, -m.r, m.r);
        } else {
          ctx.fillStyle = m.couleur;
          if (m.forme === "rond") {
            ctx.beginPath();
            ctx.arc(0, 0, m.r * 0.6, 0, Math.PI * 2);
            ctx.fill();
          } else ctx.fillRect(-m.r / 2, -m.r / 4, m.r, m.r / 2);
        }
        ctx.restore();
      });
      if (age < 4200) requestAnimationFrame(image);
      else c.remove();
    })(debut);
  }

  // ---------- File des fêtes (une à la fois) ----------
  const aFeter = [];
  function feter(fete, { force = false } = {}) {
    const vues = lire(VUES, [], Array.isArray);
    if (!force && vues.includes(fete.cle)) return;
    if (!vues.includes(fete.cle)) ecrire(VUES, [...vues, fete.cle].slice(-300));
    aFeter.push(fete);
    if (aFeter.length === 1) montrer();
  }
  window.feter = feter;

  function montrer() {
    const f = aFeter[0];
    if (!f) return;
    // Une autre fenêtre est ouverte (tuto, modification…) : on attend qu'elle se ferme
    if (document.querySelector("dialog[open]") || document.body.classList.contains("verrouille")) return setTimeout(montrer, 1500);
    $("fete-emoji").textContent = f.emoji;
    $("fete-titre").textContent = f.titre;
    $("fete-texte").textContent = f.texte || "";
    $("fete").showModal();
    confettis();
  }
  $("fete").addEventListener("close", () => {
    aFeter.shift();
    if (aFeter.length) setTimeout(montrer, 400);
  });

  // ---------- Grands moments détectés tout seuls ----------
  const recent = (d, jours) => d && Date.now() - new Date(d).getTime() < jours * DAY_MS && new Date(d) <= new Date(Date.now() + DAY_MS);
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dateLocale = (s) => {
    const [y, m, j] = s.split("-").map(Number);
    return new Date(y, m - 1, j);
  };

  // Nombre total de lignes d'une table (sans tout télécharger)
  async function compter(table) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id&limit=1`, {
      headers: await entetes({ Prefer: "count=exact" }),
    });
    if (!res.ok) return null;
    const total = Number((res.headers.get("content-range") || "").split("/")[1]);
    return Number.isFinite(total) ? total : null;
  }

  async function verifier() {
    if (!profil || !estParent()) return;
    try {
      const [p, mesures, dodos, nbRepas, nbCouches] = await Promise.all([
        api("sante_profil", "?select=date_naissance,poids_naissance_g,taille_naissance_cm&id=eq.1"),
        api("mesures", "?select=mesure_le,poids_kg,taille_cm&order=mesure_le.desc,id.desc&limit=20"),
        api("sommeils", "?select=debut,fin&fin=not.is.null&order=debut.asc&limit=5000"),
        compter("biberons"),
        compter("couches"),
      ]);
      const fiche = p[0] || {};
      verifierAge(fiche);
      verifierCroissance(fiche, mesures);
      verifierNuits(dodos);
      verifierCompteurs(nbRepas, nbCouches);
    } catch (e) {}
  }

  function verifierAge(fiche) {
    if (!fiche.date_naissance) return;
    const n = dateLocale(fiche.date_naissance);
    const aujourdhui = minuit();
    const dans3Jours = (d) => aujourdhui >= d && aujourdhui - d < 3 * DAY_MS;
    const j7 = new Date(n);
    j7.setDate(j7.getDate() + 7);
    if (dans3Jours(j7)) feter({ cle: "age-1s", emoji: "🍼", titre: "Hortense a 1 semaine !", texte: "Sept jours de câlins, de biberons et de petites nuits. Bravo les parents !" });
    const j100 = new Date(n);
    j100.setDate(j100.getDate() + 100);
    if (dans3Jours(j100)) feter({ cle: "age-100j", emoji: "💯", titre: "100 jours d'Hortense !", texte: "Un cap que beaucoup de familles fêtent : déjà 100 jours de bonheur." });
    for (let m = 1; m <= 11; m++) {
      const d = new Date(n);
      d.setMonth(d.getMonth() + m);
      if (dans3Jours(d))
        feter({
          cle: `age-${m}m`,
          emoji: m === 6 ? "🌗" : "🎂",
          titre: `Hortense a ${m} mois !`,
          texte: m === 6 ? "La moitié de sa première année ! Elle a tellement grandi." : `Joyeux ${m === 1 ? "premier mois" : m + " mois"}, petite oursonne 🧸`,
        });
    }
    for (let a = 1; a <= 18; a++) {
      const d = new Date(n);
      d.setFullYear(d.getFullYear() + a);
      if (dans3Jours(d)) feter({ cle: `age-${a}a`, emoji: "🎂", titre: `Joyeux anniversaire Hortense !`, texte: `${a} an${a > 1 ? "s" : ""} déjà ! 🎈🧸🎈` });
    }
  }

  function verifierCroissance(fiche, mesures) {
    const poids = mesures.filter((m) => m.poids_kg !== null);
    const taille = mesures.filter((m) => m.taille_cm !== null);
    const naissanceKg = fiche.poids_naissance_g ? fiche.poids_naissance_g / 1000 : null;
    if (poids[0] && recent(dateLocale(poids[0].mesure_le), 7)) {
      const actuel = Number(poids[0].poids_kg);
      const avant = poids[1] ? Number(poids[1].poids_kg) : naissanceKg;
      if (naissanceKg && actuel >= naissanceKg * 2 && (avant === null || avant < naissanceKg * 2))
        feter({ cle: "poids-double", emoji: "💪", titre: "Hortense a doublé son poids de naissance !", texte: `De ${fr(naissanceKg)} kg à ${fr(actuel)} kg : elle grandit à merveille.` });
      for (let kg = 4; kg <= 20; kg++)
        if (actuel >= kg && avant !== null && avant < kg)
          feter({ cle: `poids-${kg}kg`, emoji: "⚖️", titre: `Hortense pèse ${kg} kg !`, texte: `${fr(actuel)} kg à la dernière pesée. Ça pousse !` });
    }
    if (taille[0] && recent(dateLocale(taille[0].mesure_le), 7)) {
      const actuel = Number(taille[0].taille_cm);
      const avant = taille[1] ? Number(taille[1].taille_cm) : fiche.taille_naissance_cm ? Number(fiche.taille_naissance_cm) : null;
      for (const cm of [60, 70, 80, 90, 100, 110])
        if (actuel >= cm && avant !== null && avant < cm)
          feter({ cle: `taille-${cm}cm`, emoji: "📏", titre: `Hortense mesure ${cm} cm !`, texte: `${fr(actuel)} cm : une vraie petite grande.` });
    }
  }
  const fr = (n) => Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 2 });

  function verifierNuits(dodos) {
    // Une « nuit » : un dodo commencé entre 18 h et 4 h
    const nuits = dodos.filter((s) => {
      const h = new Date(s.debut).getHours();
      return h >= 18 || h < 4;
    });
    for (const [heures, emoji, titre, texte] of [
      [6, "🌙", "Première nuit de 6 h !", "Hortense a dormi 6 heures d'affilée. Une vraie nuit pour toute la famille !"],
      [8, "😴", "Première nuit de 8 h !", "8 heures d'affilée : on appelle ça « faire ses nuits ». Bravo Hortense !"],
    ]) {
      const premiere = nuits.find((s) => new Date(s.fin) - new Date(s.debut) >= heures * 3600000);
      if (premiere && recent(premiere.fin, 2)) feter({ cle: `nuit-${heures}h`, emoji, titre, texte });
    }
  }

  function verifierCompteurs(nbRepas, nbCouches) {
    for (const t of [100, 250, 500, 1000, 2000, 5000]) {
      if (nbRepas !== null && nbRepas >= t && nbRepas - t < 6)
        feter({ cle: `repas-${t}`, emoji: "🍼", titre: `${t}e repas noté !`, texte: `${t} biberons et tétées dans le carnet. Quel appétit !` });
      if (nbCouches !== null && nbCouches >= t && nbCouches - t < 6)
        feter({ cle: `couches-${t}`, emoji: "👶", titre: `${t}e couche changée !`, texte: "Médaille d'or du change pour les parents 🥇" });
    }
  }

  // ---------- « Ses premières fois » (Santé) ----------
  async function chargerPremieres() {
    try {
      premieres = await api("premieres_fois", "?select=*&order=le.desc,id.desc");
    } catch (e) {}
    rendrePremieres();
  }

  function rendrePremieres() {
    $("firsts-list").replaceChildren(
      ...(premieres.length
        ? premieres.map((p) => {
            const li = document.createElement("li");
            li.innerHTML = `<span class="first-emoji" aria-hidden="true">${emojiPremiere(p.quoi)}</span>
              <span class="h-info"><span class="h-type">${esc(p.quoi)}</span><span class="h-det">${dateLocale(p.le).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</span></span>`;
            const fete = document.createElement("button");
            fete.type = "button";
            fete.className = "del plan";
            fete.textContent = "🎉";
            fete.setAttribute("aria-label", "Refaire la fête");
            fete.addEventListener("click", () => feter({ cle: `premiere-${p.id}`, emoji: emojiPremiere(p.quoi), titre: `${p.quoi} !`, texte: "Un souvenir pour toujours 💛" }, { force: true }));
            li.append(fete, boutonSupprimer(`Supprimer « ${p.quoi} »`, () => supprimerPremiere(p.id)));
            return li;
          })
        : [Object.assign(document.createElement("li"), { className: "first-vide", textContent: "Premier sourire, première dent, premiers pas… note-les ici !" })])
    );
    const dejaNotees = new Set(premieres.map((p) => p.quoi));
    $("firsts-choix").replaceChildren(
      ...PREMIERES.map(([emoji, quoi]) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "chip" + (dejaNotees.has(quoi) ? " fait" : "");
        b.textContent = `${emoji} ${quoi}`;
        b.addEventListener("click", () => {
          $("first-quoi").value = quoi;
          $("firsts-choix").querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-checked", String(c === b)));
        });
        return b;
      })
    );
    contenuChange();
  }

  async function ajouterPremiere() {
    const quoi = $("first-quoi").value.trim();
    if (!quoi) {
      afficherErreur("Choisis ou écris ce qu'elle a fait pour la première fois.");
      return;
    }
    const le = $("first-date").value || iso(new Date());
    try {
      const [ligne] = await api("premieres_fois", "", { method: "POST", body: JSON.stringify({ quoi: quoi.slice(0, 80), le }) });
      afficherErreur(null);
      $("first-quoi").value = "";
      $("first-date").value = "";
      ouvrirForm(false);
      await chargerPremieres();
      feter({ cle: `premiere-${ligne?.id || quoi}`, emoji: emojiPremiere(quoi), titre: `${quoi} !`, texte: "C'est noté dans ses premières fois. Un souvenir pour toujours 💛" });
    } catch (e) {
      afficherErreur("Impossible d'enregistrer. Réessaie.");
    }
  }

  async function supprimerPremiere(id) {
    try {
      await api("premieres_fois", `?id=eq.${id}`, { method: "DELETE" });
      toast("Supprimé");
      await chargerPremieres();
    } catch (e) {
      afficherErreur("Suppression impossible. Réessaie.");
    }
  }

  function ouvrirForm(ouvert) {
    $("firsts-form").hidden = !ouvert;
    $("firsts-toggle").textContent = ouvert ? "Fermer" : "+ Ajouter";
    $("firsts-toggle").setAttribute("aria-expanded", String(ouvert));
    contenuChange();
  }
  $("firsts-toggle").addEventListener("click", () => ouvrirForm($("firsts-form").hidden));
  $("first-btn").addEventListener("click", ajouterPremiere);

  // Vaccins cochés dans le calendrier : petite fête d'encouragement
  window.addEventListener("vaccin-fait", (e) =>
    feter({ cle: `vaccin-${e.detail}`, emoji: "💉", titre: "Vaccin fait, bravo Hortense !", texte: "Un grand courage aujourd'hui. Un gros câlin s'impose 🤗" })
  );

  async function charger() {
    if (!estParent()) return; // la famille n'a pas accès à ces données
    await chargerPremieres();
    // Les grands moments : au démarrage puis toutes les 15 minutes
    if (Date.now() - derniereVerif > 15 * 60 * 1000) {
      derniereVerif = Date.now();
      setTimeout(verifier, 2500);
    }
  }
  enregistrerRubrique({ charger });
})();
