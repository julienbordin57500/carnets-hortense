// Page Couches : quand la couche a été changée, pipi, caca et taille du caca
(() => {
  const TABLE = "couches";
  const COLONNES = "id,change_le,pipi,caca,caca_taille,gardien";
  const TAILLES = ["petit", "moyen", "gros"];
  const WARN_MS = 3 * 60 * 60 * 1000;
  const LATE_MS = 4 * 60 * 60 * 1000;

  let couches = []; // dernières 24 h, de la plus récente à la plus ancienne
  let derniere = null;
  let dernierCaca = null;

  // Choix pour la prochaine couche (remis à zéro après chaque ajout)
  const choix = { pipi: true, caca: false, taille: "moyen" };

  async function charger() {
    if (!estParent()) return; // réservé aux parents (la famille n'y a pas accès)
    try {
      couches = await api(TABLE, `?select=${COLONNES}&change_le=gte.${encodeURIComponent(ilYa24h())}&order=change_le.desc`);
      derniere = couches[0] || (await api(TABLE, `?select=${COLONNES}&order=change_le.desc&limit=1`))[0] || null;
      dernierCaca =
        couches.find((c) => c.caca) ||
        (await api(TABLE, `?select=${COLONNES}&caca=is.true&order=change_le.desc&limit=1`))[0] ||
        null;
      afficherErreur(null);
    } catch (e) {
      afficherErreur("Impossible de charger les données. Vérifie la connexion internet.");
    }
    rendre();
  }

  async function ajouter() {
    const btn = $("couche-btn");
    btn.disabled = true;
    try {
      const ligne = {
        change_le: heureChoisie("couche-heure").toISOString(),
        pipi: choix.pipi,
        caca: choix.caca,
        caca_taille: choix.caca ? choix.taille : null,
      };
      await api(TABLE, "", { method: "POST", body: JSON.stringify(ligne) });
      animerBouton(btn);
      toast(`👶 Couche changée${choix.caca ? " 💩" : choix.pipi ? " 💧" : ""}`);
      $("couche-heure").value = "";
      choix.pipi = true;
      choix.caca = false;
      choix.taille = "moyen";
      rendreChoix();
      await charger();
    } catch (e) {
      afficherErreur("La couche n'a pas pu être enregistrée. Réessaie.");
    } finally {
      btn.disabled = false;
    }
  }

  async function modifier(c) {
    const v = await editer("👶 Modifier la couche", [
      { cle: "heure", label: "Heure", type: "time", valeur: hhmm(c.change_le) },
      { cle: "pipi", label: "💧 Pipi", type: "check", valeur: c.pipi },
      { cle: "caca", label: "💩 Caca", type: "check", valeur: c.caca },
      { cle: "caca_taille", label: "Taille du caca", type: "select", valeur: c.caca_taille, options: [[null, "—"], ...TAILLES.map((t) => [t, t[0].toUpperCase() + t.slice(1)])] },
    ]);
    if (!v) return;
    const maj = {
      change_le: v.heure ? memeJourA(c.change_le, v.heure).toISOString() : c.change_le,
      pipi: v.pipi,
      caca: v.caca,
      caca_taille: v.caca ? v.caca_taille || "moyen" : null,
    };
    try {
      await api(TABLE, `?id=eq.${c.id}`, { method: "PATCH", body: JSON.stringify(maj) });
      toast("✏️ Couche modifiée");
      await charger();
    } catch (e) {
      afficherErreur("Modification impossible. Réessaie.");
    }
  }

  async function supprimer(id) {
    try {
      await api(TABLE, `?id=eq.${id}`, { method: "DELETE" });
      toast("Couche supprimée");
      await charger();
    } catch (e) {
      afficherErreur("Suppression impossible. Réessaie.");
    }
  }

  // « Pipi + caca moyen », « Caca gros », « Pipi », « Couche propre »
  function contenu(c) {
    const morceaux = [];
    if (c.pipi) morceaux.push("pipi");
    if (c.caca) morceaux.push("caca" + (c.caca_taille ? ` ${c.caca_taille}` : ""));
    if (!morceaux.length) return "Couche propre";
    const txt = morceaux.join(" + ");
    return txt[0].toUpperCase() + txt.slice(1);
  }
  const emoji = (c) => (c.caca ? "💩" : c.pipi ? "💧" : "✨");

  function tick() {
    const el = $("couche-timer");
    if (derniere) {
      const ecart = Date.now() - new Date(derniere.change_le).getTime();
      el.textContent = fmtDuree(ecart);
      couleurMinuteur(el, ecart, WARN_MS, LATE_MS);
    } else {
      el.textContent = "--:--";
    }
    $("caca-timer").textContent = dernierCaca ? fmtDuree(Date.now() - new Date(dernierCaca.change_le).getTime()) : "--:--";
  }

  function rendre() {
    $("couche-info").textContent = derniere
      ? `${emoji(derniere)} ${contenu(derniere)} à ${fmtHeure(derniere.change_le)}${jourSiPasAujourdhui(derniere.change_le)}`
      : "Pas encore de couche enregistrée";
    $("caca-info").textContent = dernierCaca
      ? `à ${fmtHeure(dernierCaca.change_le)}${jourSiPasAujourdhui(dernierCaca.change_le)}` +
        (dernierCaca.caca_taille ? ` · ${dernierCaca.caca_taille}` : "")
      : "Pas encore de caca enregistré";
    tick();

    const debutJour = minuit();
    remplirStat("today", couches.filter((c) => new Date(c.change_le) >= debutJour));
    remplirStat("day", couches);

    $("couche-list").replaceChildren(...couches.map(ligneHistorique));
    $("couche-empty").hidden = couches.length > 0;
    contenuChange();
  }

  function ligneHistorique(c) {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="h-emoji" aria-hidden="true">${emoji(c)}</span>
      <span class="h-time">${fmtHeure(c.change_le)}</span>
      <span class="h-info"><span class="h-type">${contenu(c)}</span>${parGardien(c)}</span>
      <span class="h-ago">${fmtIlYa(Date.now() - new Date(c.change_le).getTime())}</span>`;
    li.append(boutonSupprimer(`Supprimer la couche de ${fmtHeure(c.change_le)}`, () => supprimer(c.id)));
    rendreModifiable(li, () => modifier(c));
    return li;
  }

  function remplirStat(prefix, liste) {
    const pipis = liste.filter((c) => c.pipi).length;
    const cacas = liste.filter((c) => c.caca).length;
    $(`couche-${prefix}-count`).textContent = liste.length;
    $(`couche-${prefix}-pipi`).textContent = `💧 ${pipis} pipi${pipis > 1 ? "s" : ""}`;
    $(`couche-${prefix}-caca`).textContent = `💩 ${cacas} caca${cacas > 1 ? "s" : ""}`;
  }

  // ---------- Choix pipi / caca / taille ----------
  let rendreTailles;
  function rendreChoix() {
    $("t-pipi").setAttribute("aria-pressed", String(choix.pipi));
    $("t-caca").setAttribute("aria-pressed", String(choix.caca));
    $("panel-caca").hidden = !choix.caca;
    $("couche-btn-label").textContent = choix.pipi || choix.caca ? "Couche changée" : "Couche propre changée";
    rendreTailles && rendreTailles();
    contenuChange();
  }

  $("t-pipi").addEventListener("click", () => {
    choix.pipi = !choix.pipi;
    rendreChoix();
  });
  $("t-caca").addEventListener("click", () => {
    choix.caca = !choix.caca;
    rendreChoix();
  });
  rendreTailles = rendreChips(
    "chips-taille",
    TAILLES,
    () => choix.taille,
    (v) => (choix.taille = v),
    (v) => v[0].toUpperCase() + v.slice(1),
    false
  );
  $("couche-btn").addEventListener("click", ajouter);
  rendreChoix();

  enregistrerRubrique({ charger, tick });
})();
