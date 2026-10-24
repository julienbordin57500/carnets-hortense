// 🏠 Petit résumé pour les grands-parents (page Garde)
// Ils ne voient pas les notes des parents, seulement l'essentiel : dernier repas, dernière couche,
// caca du jour et sommeil du jour. C'est le serveur (fonction resume_famille) qui choisit ces infos.
(() => {
  let dernierChargement = 0;

  // « à 14:05 », « hier à 22:10 » ou « le 12/10 à 08:00 »
  function quand(iso) {
    const d = new Date(iso);
    const jours = Math.round((minuit() - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
    if (jours <= 0) return `à ${fmtHeure(d)}`;
    if (jours === 1) return `hier à ${fmtHeure(d)}`;
    return `le ${d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} à ${fmtHeure(d)}`;
  }

  function ligne(emoji, titre, texte) {
    return `<li><span class="resume-emoji" aria-hidden="true">${emoji}</span><span><strong>${titre}</strong> ${texte}</span></li>`;
  }

  function rendre(r) {
    const lignes = [];
    const rep = r.dernier_repas;
    if (!rep) lignes.push(ligne("🍼", "Dernier repas :", "rien de noté"));
    else if (rep.type === "allaitement") lignes.push(ligne("🤱", "Dernière tétée", `${quand(rep.quand)}${rep.duree_min ? ` · ${rep.duree_min} min` : ""}`));
    else lignes.push(ligne("🍼", "Dernier biberon", `${quand(rep.quand)}${rep.ml ? ` · ${rep.ml} ml` : ""}${rep.lait === "maternel" ? " · lait maternel" : ""}`));

    const c = r.derniere_couche;
    const contenu = c ? [c.pipi && "pipi", c.caca && "caca"].filter(Boolean).join(" + ") : "";
    lignes.push(ligne("🧷", "Dernière couche", c ? `${quand(c.quand)}${contenu ? ` · ${contenu}` : ""}` : ": rien de noté"));
    lignes.push(
      r.dernier_caca_aujourdhui
        ? ligne("💩", "Caca aujourd'hui :", `oui, ${quand(r.dernier_caca_aujourdhui)}`)
        : ligne("💩", "Caca aujourd'hui :", "pas encore")
    );

    const dodo = r.sommeil_aujourdhui_min ? fmtMinutes(r.sommeil_aujourdhui_min * 60000) : "pas encore";
    const etat = r.dort_depuis ? ` · dort en ce moment (depuis ${fmtHeure(r.dort_depuis)})` : r.dernier_reveil ? ` · réveil ${quand(r.dernier_reveil)}` : "";
    lignes.push(ligne("😴", "Sommeil aujourd'hui :", `${dodo}${etat}`));

    $("g-resume-liste").innerHTML = lignes.join("");
    $("g-resume-maj").textContent = `Mis à jour à ${fmtHeure(new Date())}`;
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
      $("g-resume-maj").textContent = "Résumé indisponible pour l'instant.";
    }
  };
  window.addEventListener("connecte", () => window.chargerResume(true));
})();
