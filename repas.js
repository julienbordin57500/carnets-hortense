// Page Repas : biberons et allaitements (table « biberons »)
(() => {
  const TABLE = "biberons";
  const COLONNES = "id,type,pris_le,quantite_ml,cote,duree_min,lait,reprise_sommeil,gardien,garde_id";
  const REPRISE_MAX_MS = 3 * 60 * 60 * 1000; // au-delà, on ne propose plus de relancer le dodo
  // De 10 à 300 ml, de 10 en 10 (la roue de l'iPhone s'ouvre en touchant « Combien ? »)
  const QUANTITES = Array.from({ length: 30 }, (_, i) => (i + 1) * 10);
  const PAS_ML = 10;
  const LAITS = ["poudre", "maternel"];
  const LAIT_NOM = { poudre: "lait en poudre", maternel: "lait maternel" };
  const COTES = ["gauche", "droite", "les deux"];
  const DUREES = [5, 10, 15, 20, 30];
  const WARN_MS = 2.5 * 60 * 60 * 1000;
  const LATE_MS = 3.5 * 60 * 60 * 1000;

  const MODES = {
    biberon: { emoji: "🍼", bouton: "Nouveau biberon", nom: "Biberon" },
    allaitement: { emoji: "🤱", bouton: "Nouvel allaitement", nom: "Allaitement" },
  };

  let repas = []; // dernières 24 h, du plus récent au plus ancien
  let dernier = null; // le tout dernier repas, même s'il date de plus de 24 h

  const choix = {
    lait: lire("lait", "poudre", (v) => LAITS.includes(v)),
    quantite: lire("quantite", 150, (v) => v === null || QUANTITES.includes(v)),
    cote: lire("cote", null, (v) => v === null || COTES.includes(v)),
    duree: lire("duree", null, (v) => v === null || DUREES.includes(v)),
  };
  // La nuit (23 h – 7 h), on propose l'allaitement par défaut
  let mode = estLaNuit() ? "allaitement" : "biberon";

  async function charger() {
    if (!estParent()) return; // réservé aux parents (la famille n'y a pas accès)
    try {
      repas = await api(TABLE, `?select=${COLONNES}&pris_le=gte.${encodeURIComponent(ilYa24h())}&order=pris_le.desc`);
      if (repas.length) {
        dernier = repas[0];
      } else {
        const [d] = await api(TABLE, `?select=${COLONNES}&order=pris_le.desc&limit=1`);
        dernier = d || null;
      }
      afficherErreur(null);
      reprendreDerniereQuantite();
    } catch (e) {
      afficherErreur("Impossible de charger les données. Vérifie la connexion internet.");
    }
    rendre();
  }

  // Le compteur de ml démarre sur la quantité du dernier biberon (noté par n'importe qui,
  // garde comprise) : une seule fois par nouveau biberon, pour ne pas défaire un réglage en cours
  function reprendreDerniereQuantite() {
    const bib = repas.find((r) => r.type !== "allaitement" && QUANTITES.includes(r.quantite_ml));
    if (!bib || bib.id === lire("quantite-de", null, (v) => typeof v === "number")) return;
    ecrire("quantite-de", bib.id);
    if (bib.quantite_ml !== choix.quantite) majQuantite(bib.quantite_ml);
  }

  // « Prochain repas vers 15:40 » : dernier repas + écart habituel (médiane des dernières 24 h)
  function prochainRepas() {
    if (!dernier) return null;
    const heures = repas.map((r) => new Date(r.pris_le).getTime());
    const ecarts = heures
      .slice(1)
      .map((h, i) => heures[i] - h)
      .filter((e) => e >= 45 * 60000 && e <= 6 * 3600000)
      .sort((a, b) => a - b);
    if (ecarts.length < 2) return null;
    const milieu = ecarts.length >> 1;
    const habituel = ecarts.length % 2 ? ecarts[milieu] : (ecarts[milieu - 1] + ecarts[milieu]) / 2;
    return new Date(new Date(dernier.pris_le).getTime() + Math.round(habituel / 300000) * 300000);
  }

  async function ajouter() {
    const btn = $("repas-btn");
    btn.disabled = true;
    try {
      const ligne =
        mode === "biberon"
          ? { type: "biberon", lait: choix.lait, quantite_ml: choix.quantite }
          : { type: "allaitement", cote: choix.cote, duree_min: choix.duree };
      const quand = heureChoisie("repas-heure");
      ligne.pris_le = quand.toISOString();
      // Même biberon noté il y a moins de 5 minutes : sans doute un appui en trop
      const pareil = !$("repas-heure").value && repas.find((r) => recemment(r.pris_le) && r.type === ligne.type && (r.quantite_ml ?? null) === (ligne.quantite_ml ?? null) && (r.cote ?? null) === (ligne.cote ?? null));
      if (pareil && !(await demanderDoublon(`Tu as déjà noté ce ${ligne.type === "biberon" ? `biberon${ligne.quantite_ml ? ` de ${ligne.quantite_ml} ml` : ""}` : "repas"} ${fmtIlYa(Date.now() - new Date(pareil.pris_le))}. C'est bien un deuxième ?`))) {
        toast("Pas ajouté 👍");
        return;
      }
      // La nuit, si Hortense dormait, le repas met le dodo en pause
      const pause = estLaNuit(quand) && (await mettreDodoEnPause(quand));
      if (pause) ligne.reprise_sommeil = true;
      const id = await ajouterLigne(TABLE, ligne);
      animerBouton(btn);
      toast(pause ? "🌙 Dodo en pause pendant le repas" : `${MODES[mode].emoji} ${MODES[mode].nom} ajouté !`, pause ? null : annulerAjout(TABLE, id));
      $("repas-heure").value = "";
      await (pause ? rechargerTout() : charger());
    } catch (e) {
      afficherErreur("Le repas n'a pas pu être enregistré. Réessaie.");
    } finally {
      btn.disabled = false;
    }
  }

  // Arrête le dodo en cours à l'heure du repas. Renvoie true si un dodo a été arrêté.
  async function mettreDodoEnPause(quand) {
    const [enCours] = await api("sommeils", "?select=id,debut&fin=is.null&limit=1");
    if (!enCours || quand <= new Date(enCours.debut)) return false;
    await api("sommeils", `?id=eq.${enCours.id}`, { method: "PATCH", body: JSON.stringify({ fin: quand.toISOString() }) });
    return true;
  }

  // Repas de nuit en attente : le dernier repas a mis le dodo en pause il y a moins de 3 h
  const repasDeNuit = () =>
    dernier && dernier.reprise_sommeil && Date.now() - new Date(dernier.pris_le).getTime() < REPRISE_MAX_MS ? dernier : null;

  // « Fin du repas » : le dodo reprend tout de suite
  async function finRepasNuit(rendort) {
    const r = repasDeNuit();
    if (!r) return;
    const champs = { reprise_sommeil: false };
    // Allaitement sans durée notée : on prend la durée réelle du repas
    const minutes = Math.round((Date.now() - new Date(r.pris_le).getTime()) / 60000);
    if (r.type === "allaitement" && !r.duree_min) champs.duree_min = Math.min(120, Math.max(1, minutes));
    try {
      await api(TABLE, `?id=eq.${r.id}`, { method: "PATCH", body: JSON.stringify(champs) });
      if (rendort) {
        try {
          await api("sommeils", "", { method: "POST", body: JSON.stringify({ debut: new Date().toISOString() }) });
        } catch (e) {
          if (e.status !== 409) throw e; // 409 : le dodo a déjà été relancé ailleurs
        }
        toast("😴 Bonne nuit Hortense, le dodo reprend");
      }
      await rechargerTout();
    } catch (e) {
      afficherErreur("Impossible de relancer le dodo. Réessaie.");
    }
  }

  async function modifier(r) {
    const champs =
      r.type === "allaitement"
        ? [
            { cle: "heure", label: "Heure", type: "time", valeur: hhmm(r.pris_le) },
            { cle: "cote", label: "Côté", type: "select", valeur: r.cote, options: [[null, "Je ne sais pas"], ...COTES.map((c) => [c, c[0].toUpperCase() + c.slice(1)])] },
            { cle: "duree_min", label: "Durée", type: "select", valeur: r.duree_min, options: [[null, "Je ne sais pas"], ...[...new Set([...DUREES, 25, 40, 45, 60, r.duree_min].filter(Boolean))].sort((a, b) => a - b).map((d) => [d, `${d} min`])] },
          ]
        : [
            { cle: "heure", label: "Heure", type: "time", valeur: hhmm(r.pris_le) },
            { cle: "quantite_ml", label: "Quantité", type: "select", valeur: r.quantite_ml, options: [[null, "Je ne sais pas"], ...[...new Set([...QUANTITES, r.quantite_ml].filter(Boolean))].sort((a, b) => a - b).map((q) => [q, `${q} ml`])] },
            { cle: "lait", label: "Type de lait", type: "select", valeur: r.lait, options: [[null, "Non précisé"], ["poudre", "Lait en poudre"], ["maternel", "Lait maternel"]] },
          ];
    const v = await editer(`${(MODES[r.type] || MODES.biberon).emoji} Modifier le repas`, champs);
    if (!v) return;
    const maj = { pris_le: v.heure ? memeJourA(r.pris_le, v.heure).toISOString() : r.pris_le };
    if (r.type === "allaitement") {
      maj.cote = v.cote;
      maj.duree_min = v.duree_min === null ? null : Number(v.duree_min);
    } else {
      maj.quantite_ml = v.quantite_ml === null ? null : Number(v.quantite_ml);
      maj.lait = v.lait;
    }
    try {
      await modifierLigne(TABLE, r, maj, CHAMPS_GARDE.biberons);
      toast("✏️ Repas modifié");
      await charger();
    } catch (e) {
      afficherErreur("Modification impossible. Réessaie.");
    }
  }

  // Une note venue de la garde s'efface à la source (et donc aussi chez les grands-parents)
  async function supprimer(id, gardeId) {
    try {
      await api(gardeId ? "garde_evenements" : TABLE, `?id=eq.${gardeId || id}`, { method: "DELETE" });
      toast("Repas supprimé");
      await charger();
    } catch (e) {
      afficherErreur("Suppression impossible. Réessaie.");
    }
  }

  // « 150 ml » ou « gauche · 15 min »
  function details(r) {
    if (r.type === "allaitement") return [r.cote, r.duree_min && `${r.duree_min} min`].filter(Boolean).join(" · ");
    return [r.quantite_ml && `${r.quantite_ml} ml`, LAIT_NOM[r.lait]].filter(Boolean).join(" · ");
  }

  function tick() {
    const nuit = repasDeNuit();
    if (nuit) $("nuit-timer").textContent = fmtDuree(Date.now() - new Date(nuit.pris_le).getTime());
    const el = $("repas-timer");
    if (!dernier) {
      el.textContent = "--:--";
      return;
    }
    const ecart = Date.now() - new Date(dernier.pris_le).getTime();
    el.textContent = fmtDuree(ecart);
    couleurMinuteur(el, ecart, WARN_MS, LATE_MS);
    const p = $("repas-prochain");
    const prochain = repasDeNuit() ? null : prochainRepas();
    p.hidden = !prochain;
    if (prochain) p.textContent = prochain > Date.now() ? `Prochain repas vers ${fmtHeure(prochain)}` : `Prochain repas : c'était prévu vers ${fmtHeure(prochain)}`;
  }

  function rendre() {
    const nuit = repasDeNuit();
    $("nuit-card").hidden = !nuit;
    if (nuit) {
      const m = MODES[nuit.type] || MODES.biberon;
      $("nuit-info").textContent = `${m.emoji} ${m.nom} depuis ${fmtHeure(nuit.pris_le)}`;
    }
    if (dernier) {
      const m = MODES[dernier.type] || MODES.biberon;
      const det = details(dernier);
      $("repas-info").textContent =
        `${m.emoji} ${m.nom} à ${fmtHeure(dernier.pris_le)}${jourSiPasAujourdhui(dernier.pris_le)}` + (det ? ` · ${det}` : "");
    } else {
      $("repas-info").textContent = "Pas encore de repas enregistré";
    }
    tick();

    const debutJour = minuit();
    remplirStat("today", repas.filter((r) => new Date(r.pris_le) >= debutJour));
    remplirStat("day", repas);

    $("repas-list").replaceChildren(...avecMoments(repas, (x) => x.pris_le, ligneHistorique));
    $("repas-empty").hidden = repas.length > 0;
    contenuChange();
  }

  function ligneHistorique(r) {
    const li = document.createElement("li");
    const m = MODES[r.type] || MODES.biberon;
    const det = details(r);
    li.innerHTML = `
      <span class="h-emoji" aria-hidden="true">${m.emoji}</span>
      <span class="h-time">${fmtHeure(r.pris_le)}</span>
      <span class="h-info"><span class="h-type">${m.nom}</span>${det ? `<span class="h-det">${det}</span>` : ""}${parGardien(r)}</span>
      <span class="h-ago">${fmtIlYa(Date.now() - new Date(r.pris_le).getTime())}</span>`;
    li.append(boutonSupprimer(`Supprimer le repas de ${fmtHeure(r.pris_le)}`, () => supprimer(r.id, r.garde_id)));
    rendreModifiable(li, () => modifier(r));
    return li;
  }

  function remplirStat(prefix, liste) {
    const bib = liste.filter((r) => r.type !== "allaitement");
    const all = liste.filter((r) => r.type === "allaitement");
    const ml = bib.reduce((t, r) => t + (r.quantite_ml || 0), 0);
    const min = all.reduce((t, r) => t + (r.duree_min || 0), 0);
    $(`repas-${prefix}-count`).textContent = liste.length;
    $(`repas-${prefix}-bib`).textContent = `🍼 ${bib.length}` + (ml ? ` · ${ml} ml` : "");
    $(`repas-${prefix}-all`).textContent = `🤱 ${all.length}` + (min ? ` · ${min} min` : "");
  }

  function rendreMode() {
    document.querySelectorAll("#page-repas .mode-btn").forEach((b) => {
      b.setAttribute("aria-selected", String(b.dataset.mode === mode));
    });
    $("panel-biberon").hidden = mode !== "biberon";
    $("panel-allaitement").hidden = mode !== "allaitement";
    $("repas-btn-emoji").textContent = MODES[mode].emoji;
    $("repas-btn-label").textContent = MODES[mode].bouton;
    $("repas-btn").dataset.mode = mode;
    contenuChange();
  }

  document.querySelectorAll("#page-repas .mode-btn").forEach((b) =>
    b.addEventListener("click", () => {
      mode = b.dataset.mode;
      rendreMode();
    })
  );
  $("repas-btn").addEventListener("click", ajouter);
  $("nuit-rendort").addEventListener("click", () => finRepasNuit(true));
  $("nuit-eveille").addEventListener("click", () => finRepasNuit(false));

  const setter = (cle) => (v) => {
    choix[cle] = v;
    ecrire(cle, v);
  };
  rendreChips("chips-lait", LAITS, () => choix.lait, setter("lait"), (v) => (v === "poudre" ? "🥄 Lait en poudre" : "🥛 Lait maternel"), false);
  // Sélecteur de quantité : roue native + boutons − / +
  const selectMl = $("ml-select");
  selectMl.innerHTML =
    `<option value="">Je ne sais pas</option>` + QUANTITES.map((q) => `<option value="${q}">${q} ml</option>`).join("");
  function majQuantite(q) {
    choix.quantite = q;
    ecrire("quantite", q);
    selectMl.value = q === null ? "" : String(q);
    $("ml-value").textContent = q === null ? "? ml" : `${q} ml`;
    $("ml-moins").disabled = q !== null && q <= QUANTITES[0];
    $("ml-plus").disabled = q !== null && q >= QUANTITES[QUANTITES.length - 1];
    const v = $("ml-value");
    v.classList.remove("bump");
    void v.offsetWidth;
    v.classList.add("bump");
  }
  selectMl.addEventListener("change", () => majQuantite(selectMl.value ? Number(selectMl.value) : null));
  $("ml-moins").addEventListener("click", () => majQuantite(Math.max(QUANTITES[0], (choix.quantite ?? 150) - PAS_ML)));
  $("ml-plus").addEventListener("click", () => majQuantite(Math.min(QUANTITES[QUANTITES.length - 1], (choix.quantite ?? 150) + PAS_ML)));
  majQuantite(choix.quantite);
  rendreChips("chips-cote", COTES, () => choix.cote, setter("cote"), (v) => v[0].toUpperCase() + v.slice(1));
  rendreChips("chips-duree", DUREES, () => choix.duree, setter("duree"), (v) => `${v} min`);
  rendreMode();

  enregistrerRubrique({ charger, tick });
})();
