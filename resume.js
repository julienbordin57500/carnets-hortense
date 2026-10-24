// 🏠 Petit résumé pour les grands-parents (page Garde)
// Ils ne voient pas les notes des parents, seulement l'essentiel : dernier repas, dernière couche,
// caca du jour et sommeil du jour. C'est le serveur (fonction resume_famille) qui choisit ces infos.
(() => {
  let dernierChargement = 0;

  // « 14:05 », « hier 22:10 » ou « 12/10 08:00 »
  function heure(iso) {
    const d = new Date(iso);
    const jours = Math.round((minuit() - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
    if (jours <= 0) return fmtHeure(d);
    if (jours === 1) return `hier ${fmtHeure(d)}`;
    return `${d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} ${fmtHeure(d)}`;
  }

  // Une petite case : emoji, nom, valeur en gros, précision en petit
  function tuile(classe, emoji, nom, valeur, sous = "") {
    return `<div class="tuile ${classe}">
      <span class="tuile-emoji" aria-hidden="true">${emoji}</span>
      <span class="tuile-nom">${nom}</span>
      <span class="tuile-val">${valeur}</span>
      <span class="tuile-sous">${sous || "&nbsp;"}</span>
    </div>`;
  }

  function rendre(r) {
    const cases = [];
    const rep = r.dernier_repas;
    if (!rep) cases.push(tuile("t-repas", "🍼", "Dernier repas", "—", "rien de noté"));
    else if (rep.type === "allaitement") cases.push(tuile("t-repas", "🤱", "Dernière tétée", heure(rep.quand), rep.duree_min ? `${rep.duree_min} min` : ""));
    else cases.push(tuile("t-repas", "🍼", "Dernier biberon", heure(rep.quand), [rep.ml && `${rep.ml} ml`, rep.lait === "maternel" && "lait maternel"].filter(Boolean).join(" · ")));

    const c = r.derniere_couche;
    const contenu = c ? [c.pipi && "💧 pipi", c.caca && "💩 caca"].filter(Boolean).join(" + ") : "rien de noté";
    cases.push(tuile("t-couche", "👶", "Dernière couche", c ? heure(c.quand) : "—", contenu));

    cases.push(
      r.dernier_caca_aujourdhui
        ? tuile("t-caca oui", "💩", "Caca aujourd'hui", "Oui ✓", `à ${fmtHeure(r.dernier_caca_aujourdhui)}`)
        : tuile("t-caca", "💩", "Caca aujourd'hui", "Pas encore")
    );

    const dodo = r.sommeil_aujourdhui_min ? fmtMinutes(r.sommeil_aujourdhui_min * 60000) : "0 min";
    const etat = r.dort_depuis ? `💤 dort depuis ${fmtHeure(r.dort_depuis)}` : r.dernier_reveil ? `réveil ${heure(r.dernier_reveil)}` : "";
    cases.push(tuile("t-dodo" + (r.dort_depuis ? " dort" : ""), "😴", "Sommeil du jour", dodo, etat));

    const grille = $("g-resume-liste");
    // Les cases « sautillent » seulement à la première apparition, pas à chaque mise à jour
    grille.classList.toggle("premiere", !grille.dataset.vu);
    grille.dataset.vu = "1";
    grille.innerHTML = cases.join("");
    $("g-resume-maj").textContent = `à ${fmtHeure(new Date())}`;
  }

  // Appelé par la page Garde à chaque chargement (sans recharger plus d'une fois toutes les 20 s)
  window.chargerResume = async (force = false) => {
    const carte = $("g-resume");
    const visible = !!profil && !estParent();
    carte.hidden = !visible;
    if (!visible || (!force && Date.now() - dernierChargement < 20000)) return;
    dernierChargement = Date.now();
    try {
      rendre(await api("rpc/resume_famille"));
    } catch (e) {
      $("g-resume-maj").textContent = "indisponible";
    }
  };
  window.addEventListener("connecte", () => window.chargerResume(true));
})();
