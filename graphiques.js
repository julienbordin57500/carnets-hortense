// Graphiques des 7 derniers jours : lait bu (Repas) et temps dormi (Sommeil)
// Une barre par jour, la valeur d'aujourd'hui écrite au-dessus, un appui sur une barre donne le détail.
(() => {
  const NB_JOURS = 7;

  // Les 7 jours (de minuit à minuit), du plus ancien à aujourd'hui
  function jours() {
    const liste = [];
    for (let i = NB_JOURS - 1; i >= 0; i--) {
      const debut = minuit();
      debut.setDate(debut.getDate() - i);
      const fin = new Date(debut);
      fin.setDate(fin.getDate() + 1);
      liste.push({ debut, fin });
    }
    return liste;
  }

  async function charger() {
    if (!estParent()) return; // réservé aux parents (la famille n'y a pas accès)
    const j = jours();
    const depuis = encodeURIComponent(j[0].debut.toISOString());
    try {
      const [repas, dodos] = await Promise.all([
        api("biberons", `?select=type,pris_le,quantite_ml&pris_le=gte.${depuis}&order=pris_le.asc`),
        api("sommeils", `?select=debut,fin&or=(fin.is.null,fin.gte.${depuis})&order=debut.asc`),
      ]);
      dessinerRepas(j, repas);
      dessinerSommeil(j, dodos);
    } catch (e) {
      // Les pages gardent leurs autres infos ; le graphique réessaiera au prochain chargement
    }
    contenuChange();
  }

  function dessinerRepas(j, repas) {
    const donnees = j.map(({ debut, fin }) => {
      const duJour = repas.filter((r) => new Date(r.pris_le) >= debut && new Date(r.pris_le) < fin);
      const ml = duJour.reduce((t, r) => t + (r.type === "allaitement" ? 0 : r.quantite_ml || 0), 0);
      const nbAll = duJour.filter((r) => r.type === "allaitement").length;
      return {
        debut,
        valeur: ml,
        texte: `${ml} ml`,
        detail: `${duJour.length} repas` + (nbAll ? ` dont ${nbAll} allaitement${nbAll > 1 ? "s" : ""}` : "") + ` · ${ml} ml de lait au biberon`,
      };
    });
    const jPasses = donnees.slice(0, -1).filter((d) => d.valeur > 0);
    $("chart-repas-moy").textContent = jPasses.length
      ? `moyenne ${Math.round(jPasses.reduce((t, d) => t + d.valeur, 0) / jPasses.length)} ml/jour`
      : "";
    barres("repas", donnees, "biberon au lait (ml)");
  }

  function dessinerSommeil(j, dodos) {
    const maintenant = Date.now();
    const donnees = j.map(({ debut, fin }) => {
      let ms = 0;
      let nb = 0;
      dodos.forEach((s) => {
        const a = Math.max(new Date(s.debut).getTime(), debut.getTime());
        const b = Math.min(s.fin ? new Date(s.fin).getTime() : maintenant, fin.getTime());
        if (b > a) {
          ms += b - a;
          nb++;
        }
      });
      return { debut, valeur: ms / 3600000, texte: fmtMinutes(ms), detail: `${fmtMinutes(ms)} de sommeil · ${nb} dodo${nb > 1 ? "s" : ""}` };
    });
    const jPasses = donnees.slice(0, -1).filter((d) => d.valeur > 0);
    $("chart-sommeil-moy").textContent = jPasses.length
      ? `moyenne ${fmtMinutes((jPasses.reduce((t, d) => t + d.valeur, 0) / jPasses.length) * 3600000)}/jour`
      : "";
    barres("sommeil", donnees, "heures de sommeil");
  }

  // Petit graphique en barres SVG (une seule série : pas de légende, le titre la nomme)
  function barres(cle, donnees, unite) {
    const L = 320, H = 150, haut = 24, bas = 112, gauche = 6, droite = 6;
    const max = Math.max(...donnees.map((d) => d.valeur), 0.0001);
    const pas = (L - gauche - droite) / donnees.length;
    const largeur = Math.min(26, pas - 10);
    const y = (v) => bas - (v / max) * (bas - haut);
    const nomJour = (d) => d.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "");
    const aujourdhui = donnees.length - 1;

    const svg = [
      `<svg viewBox="0 0 ${L} ${H}" class="chart-svg" aria-hidden="true">`,
      // ligne de base discrète
      `<line x1="${gauche}" x2="${L - droite}" y1="${bas}" y2="${bas}" class="chart-axe"/>`,
    ];
    donnees.forEach((d, i) => {
      const cx = gauche + pas * i + pas / 2;
      const x = cx - largeur / 2;
      const yv = y(d.valeur);
      const h = bas - yv;
      // barre arrondie en haut seulement (4 px), posée sur la ligne de base
      const r = Math.min(4, h / 2, largeur / 2);
      const chemin =
        h > 0.5
          ? `M${x},${bas} V${yv + r} Q${x},${yv} ${x + r},${yv} H${x + largeur - r} Q${x + largeur},${yv} ${x + largeur},${yv + r} V${bas} Z`
          : "";
      svg.push(`<g class="chart-col${i === aujourdhui ? " today" : ""}" data-i="${i}">`);
      // zone de toucher plus grande que la barre
      svg.push(`<rect x="${cx - pas / 2}" y="${haut - 16}" width="${pas}" height="${H - haut + 16}" class="chart-hit"/>`);
      if (chemin) svg.push(`<path d="${chemin}" class="chart-bar bar-${cle}"/>`);
      else svg.push(`<rect x="${x}" y="${bas - 2}" width="${largeur}" height="2" rx="1" class="chart-vide"/>`);
      if (i === aujourdhui && d.valeur > 0) svg.push(`<text x="${cx}" y="${yv - 6}" class="chart-val" text-anchor="middle">${esc(d.texte)}</text>`);
      svg.push(`<text x="${cx}" y="${bas + 16}" class="chart-jour" text-anchor="middle">${i === aujourdhui ? "auj." : nomJour(d.debut)}</text>`);
      svg.push(`<text x="${cx}" y="${bas + 30}" class="chart-num" text-anchor="middle">${d.debut.getDate()}</text>`);
      svg.push(`</g>`);
    });
    svg.push(`</svg>`);

    const el = $(`chart-${cle}`);
    el.innerHTML = svg.join("");
    el.setAttribute(
      "aria-label",
      `${unite}, 7 derniers jours : ` + donnees.map((d) => `${d.debut.toLocaleDateString("fr-FR", { weekday: "long" })} ${d.texte}`).join(", ")
    );
    const detail = $(`chart-${cle}-detail`);
    const montrer = (i) => {
      el.querySelectorAll(".chart-col").forEach((c) => c.classList.toggle("actif", Number(c.dataset.i) === i));
      const d = donnees[i];
      const jourLong = i === aujourdhui ? "Aujourd'hui" : d.debut.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
      detail.textContent = `${jourLong[0].toUpperCase() + jourLong.slice(1)} : ${d.detail}`;
    };
    el.querySelectorAll(".chart-col").forEach((c) => {
      const i = Number(c.dataset.i);
      c.addEventListener("click", () => montrer(i));
      c.addEventListener("mouseenter", () => montrer(i));
    });
  }

  // Rechargé avec le reste (chaque minute, et après chaque ajout)
  enregistrerRubrique({ charger });
})();
