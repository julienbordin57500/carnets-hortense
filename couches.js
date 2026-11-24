// Page Couches : quand la couche a été changée, pipi, caca et taille du caca
(() => {
  const TABLE = "couches";
  const COLONNES = "id,change_le,pipi,caca,caca_taille,caca_couleur,caca_texture,gardien,garde_id";
  const TAILLES = ["trace", "petit", "moyen", "gros"];
  // « trace » : juste une trace dans la couche (le petit raté qu'on ne compte pas vraiment comme un caca)
  const nomTaille = (t) => (t === "trace" ? "Juste une trace" : t[0].toUpperCase() + t.slice(1));
  const motTaille = (t) => (t === "trace" ? "juste une trace" : t);
  // Consistance (facultative) : de la plus liquide à la plus dure
  const TEXTURES = [
    { v: "liquide", nom: "Liquide" },
    { v: "molle", nom: "Molle" },
    { v: "normale", nom: "Normale" },
    { v: "moulee", nom: "Moulée" },
    { v: "dure", nom: "Dure" },
  ];
  const texture = (v) => TEXTURES.find((t) => t.v === v);
  // Une simple trace reste dans la liste mais ne compte pas comme un caca (compteurs, « dernier caca »)
  const vraiCaca = (c) => c.caca && c.caca_taille !== "trace";
  // Couleurs de la carte des selles du carnet de santé (« alerte » : à montrer au pédiatre)
  const COULEURS = [
    { v: "jaune", nom: "Jaune", hex: "#e2b51f" },
    { v: "orange", nom: "Orange", hex: "#e58a2e" },
    { v: "vert", nom: "Vert", hex: "#6f9a3a" },
    { v: "marron", nom: "Marron", hex: "#7a4b2a" },
    { v: "noir", nom: "Noir", hex: "#2b2522", alerte: true },
    { v: "rouge", nom: "Rouge", hex: "#c23b30", alerte: true },
    { v: "blanc", nom: "Blanc / gris", hex: "#dcd8cc", alerte: true },
  ];
  const couleur = (v) => COULEURS.find((c) => c.v === v);
  const WARN_MS = 3 * 60 * 60 * 1000;
  const LATE_MS = 4 * 60 * 60 * 1000;

  let couches = []; // dernières 24 h, de la plus récente à la plus ancienne
  let derniere = null;
  let dernierCaca = null;

  // Choix pour la prochaine couche (remis à zéro après chaque ajout)
  const choix = { pipi: true, caca: false, taille: "moyen", couleur: null, texture: null };

  async function charger() {
    if (!estParent()) return; // réservé aux parents (la famille n'y a pas accès)
    try {
      couches = await api(TABLE, `?select=${COLONNES}&change_le=gte.${encodeURIComponent(ilYa24h())}&order=change_le.desc`);
      derniere = couches[0] || (await api(TABLE, `?select=${COLONNES}&order=change_le.desc&limit=1`))[0] || null;
      dernierCaca =
        couches.find(vraiCaca) ||
        (await api(TABLE, `?select=${COLONNES}&caca=is.true&or=(caca_taille.is.null,caca_taille.neq.trace)&order=change_le.desc&limit=1`))[0] ||
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
        caca_couleur: choix.caca ? choix.couleur : null,
        caca_texture: choix.caca ? choix.texture : null,
      };
      const pareille = !$("couche-heure").value && couches.find((c) => recemment(c.change_le) && c.pipi === ligne.pipi && c.caca === ligne.caca);
      if (pareille && !(await demanderDoublon(`Tu as déjà noté cette couche ${fmtIlYa(Date.now() - new Date(pareille.change_le))}. C'est bien une deuxième ?`))) {
        toast("Pas ajouté 👍");
        return;
      }
      const id = await ajouterLigne(TABLE, ligne);
      animerBouton(btn);
      toast(`👶 Couche changée${choix.caca ? " 💩" : choix.pipi ? " 💧" : ""}`, annulerAjout(TABLE, id));
      $("couche-heure").value = "";
      choix.pipi = true;
      choix.caca = false;
      choix.taille = "moyen";
      choix.couleur = null;
      choix.texture = null;
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
      { cle: "caca_taille", label: "Taille du caca", type: "select", valeur: c.caca_taille, options: [[null, "—"], ...TAILLES.map((t) => [t, nomTaille(t)])] },
      { cle: "caca_texture", label: "Consistance", type: "select", valeur: c.caca_texture, options: [[null, "Non précisée"], ...TEXTURES.map((x) => [x.v, x.nom])] },
      { cle: "caca_couleur", label: "Couleur du caca", type: "select", valeur: c.caca_couleur, options: [[null, "Non précisée"], ...COULEURS.map((x) => [x.v, x.nom])] },
    ]);
    if (!v) return;
    const maj = {
      change_le: v.heure ? memeJourA(c.change_le, v.heure).toISOString() : c.change_le,
      pipi: v.pipi,
      caca: v.caca,
      caca_taille: v.caca ? v.caca_taille || "moyen" : null,
      caca_couleur: v.caca ? v.caca_couleur : null,
      caca_texture: v.caca ? v.caca_texture : null,
    };
    try {
      await modifierLigne(TABLE, c, maj, CHAMPS_GARDE.couches);
      toast("✏️ Couche modifiée");
      await charger();
    } catch (e) {
      afficherErreur("Modification impossible. Réessaie.");
    }
  }

  // Une note venue de la garde s'efface à la source (et donc aussi chez les grands-parents)
  async function supprimer(id, gardeId) {
    try {
      await api(gardeId ? "garde_evenements" : TABLE, `?id=eq.${gardeId || id}`, { method: "DELETE" });
      toast("Couche supprimée");
      await charger();
    } catch (e) {
      afficherErreur("Suppression impossible. Réessaie.");
    }
  }

  // « · molle · jaune » : consistance et couleur, si elles ont été choisies
  const details = (c) =>
    (texture(c.caca_texture) ? ` · ${texture(c.caca_texture).nom.toLowerCase()}` : "") +
    (couleur(c.caca_couleur) ? ` · ${couleur(c.caca_couleur).nom.toLowerCase()}` : "");

  // « Pipi + caca moyen », « Caca gros », « Pipi », « Couche propre »
  function contenu(c) {
    const morceaux = [];
    if (c.pipi) morceaux.push("pipi");
    if (c.caca) morceaux.push((c.caca_taille === "trace" ? "trace de caca" : "caca" + (c.caca_taille ? ` ${c.caca_taille}` : "")) + details(c));
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
        (dernierCaca.caca_taille ? ` · ${motTaille(dernierCaca.caca_taille)}` : "") +
        details(dernierCaca)
      : "Pas encore de caca enregistré";
    tick();

    const debutJour = minuit();
    remplirStat("today", couches.filter((c) => new Date(c.change_le) >= debutJour));
    remplirStat("day", couches);

    $("couche-list").replaceChildren(...avecMoments(couches, (x) => x.change_le, ligneHistorique));
    $("couche-empty").hidden = couches.length > 0;
    contenuChange();
  }

  function ligneHistorique(c) {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="h-emoji" aria-hidden="true">${emoji(c)}</span>
      <span class="h-time">${fmtHeure(c.change_le)}</span>
      <span class="h-info"><span class="h-type">${pastille(c)}${contenu(c)}</span>${parGardien(c)}</span>
      <span class="h-ago">${fmtIlYa(Date.now() - new Date(c.change_le).getTime())}</span>`;
    li.append(boutonSupprimer(`Supprimer la couche de ${fmtHeure(c.change_le)}`, () => supprimer(c.id, c.garde_id)));
    rendreModifiable(li, () => modifier(c));
    return li;
  }

  // Petit rond de la couleur du caca, devant le texte
  const pastille = (c) => (c.caca && couleur(c.caca_couleur) ? `<span class="rond-couleur" style="background:${couleur(c.caca_couleur).hex}" aria-hidden="true"></span>` : "");

  // Pastilles de couleur (facultatif : un second appui sur la même couleur l'enlève)
  function rendreCouleurs() {
    $("chips-couleur").replaceChildren(
      ...COULEURS.map((x) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "chip couleur-chip";
        b.setAttribute("role", "radio");
        b.setAttribute("aria-checked", String(choix.couleur === x.v));
        b.innerHTML = `<span class="rond-couleur" style="background:${x.hex}" aria-hidden="true"></span><span>${x.nom}</span>`;
        b.addEventListener("click", () => {
          choix.couleur = choix.couleur === x.v ? null : x.v;
          rendreCouleurs();
        });
        return b;
      })
    );
    const c = couleur(choix.couleur);
    $("couleur-conseil").hidden = !c?.alerte;
  }

  // Pastilles de consistance (facultatif : un second appui sur la même l'enlève)
  function rendreTextures() {
    $("chips-texture").replaceChildren(
      ...TEXTURES.map((x) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "chip";
        b.setAttribute("role", "radio");
        b.setAttribute("aria-checked", String(choix.texture === x.v));
        b.textContent = x.nom;
        b.addEventListener("click", () => {
          choix.texture = choix.texture === x.v ? null : x.v;
          rendreTextures();
        });
        return b;
      })
    );
  }

  function remplirStat(prefix, liste) {
    const pipis = liste.filter((c) => c.pipi).length;
    const cacas = liste.filter(vraiCaca).length;
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
    rendreCouleurs();
    rendreTextures();
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
    nomTaille,
    false
  );
  $("couche-btn").addEventListener("click", ajouter);
  rendreChoix();

  enregistrerRubrique({ charger, tick });
})();
