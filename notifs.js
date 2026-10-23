// 🔔 La cloche des parents : des nouvelles douces, jamais d'alarme.
// - ce que les grands-parents ont noté (note du jour, garde, médicament donné)
// - un petit rappel de rendez-vous (aujourd'hui / demain) et des vaccins à prévoir
// - le récap du mois écoulé, prêt dès le 1er, à copier pour l'envoyer
// Rien n'est stocké sur le serveur : les nouvelles sont calculées à partir des données, « lu » est retenu sur le téléphone.
(() => {
  const LU = "cloche-lu"; // date (ms) de la dernière ouverture de la cloche
  const SUPPR = "notifs-supprimees"; // nouvelles effacées avec la ✕ (croquées par l'ourson)
  const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  const EMOJI = Object.fromEntries(PROFILS.map((p) => [p.nom, p.emoji]));
  let nouvelles = [];

  const dateLocale = (s) => {
    const [y, m, j] = s.split("-").map(Number);
    return new Date(y, m - 1, j);
  };
  const quandTexte = (d) => {
    const ms = Date.now() - d.getTime();
    if (ms < 60 * 60 * 1000) return fmtIlYa(ms);
    if (d >= minuit()) return `aujourd'hui à ${fmtHeure(d)}`;
    const hier = minuit();
    hier.setDate(hier.getDate() - 1);
    if (d >= hier) return `hier à ${fmtHeure(d)}`;
    return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  };
  const extrait = (t, n = 90) => (t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t);
  const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;

  // ---------- Construire les nouvelles ----------
  async function charger() {
    if (!estParent()) return; // la cloche est réservée aux parents
    $("cloche").removeAttribute("hidden");
    const depuis = new Date(Date.now() - 7 * DAY_MS);
    const depuisIso = encodeURIComponent(depuis.toISOString());
    try {
      const [notes, garde, meds, rdvs, profilSante, suivi] = await Promise.all([
        api("garde_jours", `?select=jour,gardien,note,updated_at&updated_at=gte.${depuisIso}&order=updated_at.desc`),
        api("garde_evenements", `?select=type,quand,gardien,created_at,ml,pipi,caca,fin&created_at=gte.${depuisIso}&order=created_at.desc`),
        api("medicaments_prises", `?select=nom,dose,pris_le,par,created_at&created_at=gte.${depuisIso}&par=not.is.null&order=created_at.desc`),
        api("rendez_vous", `?select=quand,type,titre,fait&fait=is.false&quand=gte.${encodeURIComponent(new Date().toISOString())}&order=quand.asc&limit=5`),
        api("sante_profil", "?select=date_naissance&id=eq.1"),
        api("suivi_calendrier", "?select=cle"),
      ]);
      const liste = [];

      // Notes du jour de la famille
      notes
        .filter((n) => n.note && n.gardien === "Grands-parents")
        .forEach((n) =>
          liste.push({
            quand: new Date(n.updated_at),
            emoji: EMOJI[n.gardien] || "📝",
            titre: n.gardien === "Grands-parents" ? "Les grands-parents ont écrit leur note du jour" : `${n.gardien} : note du jour`,
            texte: `« ${extrait(n.note)} »`,
            aller: "page-garde",
          })
        );

      // Ce que la famille a noté pendant la garde : un résumé par personne et par jour
      const groupes = new Map();
      garde.filter((e) => e.gardien === "Grands-parents").forEach((e) => {
        const jour = new Date(e.created_at).toDateString();
        const cle = `${e.gardien}|${jour}`;
        if (!groupes.has(cle)) groupes.set(cle, { gardien: e.gardien, quand: new Date(e.created_at), repas: 0, ml: 0, couches: 0, dodos: 0 });
        const g = groupes.get(cle);
        if (e.type === "repas") {
          g.repas++;
          g.ml += e.ml || 0;
        } else if (e.type === "couche") g.couches++;
        else g.dodos++;
      });
      groupes.forEach((g) => {
        const morceaux = [
          g.repas && `${pluriel(g.repas, "biberon")}${g.ml ? ` (${g.ml} ml)` : ""}`,
          g.couches && pluriel(g.couches, "couche"),
          g.dodos && pluriel(g.dodos, "dodo"),
        ].filter(Boolean);
        liste.push({
          quand: g.quand,
          emoji: EMOJI[g.gardien] || "👵",
          titre: g.gardien === "Grands-parents" || !g.gardien ? "Les grands-parents ont noté la journée" : `${g.gardien} : journée notée`,
          texte: morceaux.join(", "),
          aller: "page-garde",
        });
      });

      // Médicaments donnés par la famille
      meds
        .filter((m) => m.par && m.par !== "Parents")
        .forEach((m) =>
          liste.push({
            quand: new Date(m.created_at),
            emoji: "💊",
            titre: `${m.par === "Grands-parents" ? "Les grands-parents ont" : m.par + " a"} donné ${m.nom}${m.dose ? ` (${m.dose})` : ""}`,
            texte: `à ${fmtHeure(m.pris_le)}`,
            aller: "page-sante",
          })
        );

      // Rendez-vous aujourd'hui ou demain : un petit rappel
      const apresDemain = minuit();
      apresDemain.setDate(apresDemain.getDate() + 2);
      rdvs
        .filter((r) => new Date(r.quand) < apresDemain)
        .forEach((r) => {
          const d = new Date(r.quand);
          const auj = d < new Date(minuit().getTime() + DAY_MS);
          liste.push({
            quand: new Date(Math.min(Date.now(), d.getTime() - DAY_MS)), // apparaît la veille
            emoji: "📅",
            titre: `${auj ? "Aujourd'hui" : "Demain"} à ${fmtHeure(d)} : ${r.titre || "rendez-vous"}`,
            texte: "Petit rappel, rien d'urgent 🙂",
            aller: "page-sante",
            rappel: true,
          });
        });

      // Vaccins à prévoir dans les 10 jours (sans rendez-vous déjà pris), formulé gentiment
      const naissance = profilSante[0]?.date_naissance;
      const cal = window.calendrierHortense;
      if (naissance && cal) {
        const faits = new Set(suivi.map((x) => x.cle));
        const dansDix = new Date(Date.now() + 10 * DAY_MS);
        const prochain = cal.VACCINS.filter((v) => v.oblig && !faits.has(v.cle))
          .map((v) => {
            const d = dateLocale(naissance);
            d.setMonth(d.getMonth() + v.m);
            return { ...v, d };
          })
          .find((v) => v.d >= minuit() && v.d <= dansDix);
        if (prochain && !rdvs.some((r) => r.type === "vaccin"))
          liste.push({
            quand: new Date(prochain.d.getTime() - 10 * DAY_MS),
            emoji: "💉",
            titre: `Bientôt les vaccins des ${prochain.m} mois`,
            texte: `Vers le ${prochain.d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}. Quand vous aurez un moment, pensez au rendez-vous.`,
            aller: "page-sante",
            rappel: true,
          });
      }

      // Récap du mois écoulé : disponible du 1er au 10 du mois
      const auj = new Date();
      if (auj.getDate() <= 10) {
        const debut = new Date(auj.getFullYear(), auj.getMonth() - 1, 1);
        liste.push({
          quand: new Date(auj.getFullYear(), auj.getMonth(), 1, 8),
          emoji: "📊",
          titre: `Le récap de ${MOIS[debut.getMonth()]} est prêt`,
          texte: "Repas, couches et sommeil du mois, à copier en un geste.",
          recap: debut,
        });
      }

      const supprimees = new Set(lire(SUPPR, [], Array.isArray));
      nouvelles = liste
        .map((n) => ({ ...n, cle: `${n.titre}|${n.texte || ""}` }))
        .filter((n) => n.quand <= new Date(Date.now() + 60000) && !supprimees.has(n.cle))
        .sort((a, b) => b.quand - a.quand);
    } catch (e) {
      // pas grave : la cloche se remettra à jour au prochain chargement
    }
    majPastille();
  }

  const nonLues = () => {
    const lu = lire(LU, 0, Number.isFinite);
    return nouvelles.filter((n) => n.quand.getTime() > lu).length;
  };
  function majPastille() {
    const n = nonLues();
    $("cloche-pastille").toggleAttribute("hidden", n === 0);
    $("cloche-nb").textContent = n > 9 ? "9+" : String(n);
    $("cloche").setAttribute("aria-label", n ? `${n} nouvelle${n > 1 ? "s" : ""}` : "Nouvelles");
    $("cloche").classList.toggle("a-lire", n > 0);
  }

  // ---------- Fenêtre des nouvelles ----------
  function ouvrir() {
    const lu = lire(LU, 0, Number.isFinite);
    const ul = $("notifs-list");
    ul.replaceChildren(
      ...(nouvelles.length
        ? nouvelles.map((n, i) => {
            const li = document.createElement("li");
            li.className = (n.quand.getTime() > lu ? "nouveau " : "") + (n.rappel ? "rappel" : "");
            li.style.setProperty("--i", String(Math.min(i, 8)));
            li.innerHTML = `<span class="notif-emoji" aria-hidden="true">${n.emoji}</span>
              <span class="notif-corps"><span class="notif-titre">${esc(n.titre)}</span>
              ${n.texte ? `<span class="notif-texte">${esc(n.texte)}</span>` : ""}
              ${n.rappel || n.recap ? "" : `<span class="notif-quand">${quandTexte(n.quand)}</span>`}</span>`;
            if (n.recap) {
              const b = document.createElement("button");
              b.type = "button";
              b.className = "g-btn notif-action";
              b.textContent = "Voir";
              b.addEventListener("click", () => {
                $("notifs").close();
                ouvrirRecap(n.recap);
              });
              li.append(b);
            } else if (n.aller) {
              li.classList.add("cliquable");
              li.addEventListener("click", () => {
                $("notifs").close();
                const i = [...document.querySelectorAll(".page")].findIndex((p) => p.id === n.aller);
                document.querySelectorAll(".tab")[i]?.click();
              });
            }
            const x = document.createElement("button");
            x.type = "button";
            x.className = "notif-x";
            x.textContent = "✕";
            x.setAttribute("aria-label", `Effacer « ${n.titre} »`);
            x.addEventListener("click", (e) => {
              e.stopPropagation();
              croquer(li, n);
            });
            li.append(x);
            return li;
          })
        : [messageCalme()])
    );
    ecrire(LU, Date.now());
    majPastille();
    $("notifs").showModal();
  }
  const messageCalme = () =>
    Object.assign(document.createElement("li"), { className: "notif-calme", textContent: "Tout est calme 🌿 Rien de nouveau pour l'instant." });

  // ---------- L'ourson gourmand qui croque la nouvelle effacée 🧸 ----------
  // L'ourson gourmand (vu de profil, tourné vers la droite) qui croque la nouvelle effacée
  const CROCO = `<svg viewBox="0 0 150 70" aria-hidden="true">
      <circle class="cr-corps" cx="22" cy="42" r="4.5"/>
      <ellipse class="cr-corps" cx="48" cy="46" rx="26" ry="16"/>
      <ellipse class="cr-ventre" cx="52" cy="52" rx="16" ry="7"/>
      <rect class="cr-patte" x="32" y="52" width="10" height="13" rx="5"/>
      <rect class="cr-patte" x="56" y="52" width="10" height="13" rx="5"/>
      <circle class="cr-corps" cx="74" cy="20" r="6.5"/><circle class="cr-oreille-in" cx="74" cy="20" r="3.3"/>
      <circle class="cr-corps" cx="94" cy="18" r="6.5"/><circle class="cr-oreille-in" cx="94" cy="18" r="3.3"/>
      <circle class="cr-corps" cx="84" cy="38" r="19"/>
      <path class="cr-gueule" d="M92 42 L128 44 L96 30 Z"/>
      <path class="cr-museau" d="M86 42 L126 44 Q133 45 131 50 Q128 55 121 54 L90 54 Q84 52 86 42 Z"/>
      <path class="cr-dents" d="M104 45 l2.5 -3.5 l2.5 3.5 M114 45.5 l2.5 -3.5 l2.5 3.5"/>
      <path class="cr-oeil" d="M77 31 q3.5 -3.5 7 0"/>
      <circle class="cr-joue" cx="80" cy="42" r="3.4"/>
      <g transform="translate(90 38)"><g class="cr-haut">
        <path class="cr-museau" d="M-2 6 Q0 -9 16 -10 L34 -6 Q43 -4 41 2 Q40 7 34 7 L-2 7 Z"/>
        <path class="cr-dents" d="M16 7 l2.5 3.5 l2.5 -3.5 M26 7 l2.5 3.5 l2.5 -3.5"/>
        <ellipse class="cr-narine" cx="38" cy="-4" rx="3.2" ry="2.4"/>
      </g></g>
    </svg>`;

  // L'ourson traverse la nouvelle de gauche à droite en mâchonnant : tout ce qui est derrière lui a disparu
  const DUREE_CROCO = 900; // ms pour traverser
  const BOUCHE = 118; // position de la gueule dans le dessin (px depuis la gauche du crocodile)
  const LARGEUR_CROCO = 150;

  function croquer(li, n) {
    if (li.classList.contains("croque")) return;
    const fin = () => {
      ecrire(SUPPR, [...lire(SUPPR, [], Array.isArray), n.cle].slice(-300));
      nouvelles = nouvelles.filter((x) => x.cle !== n.cle);
      li.remove();
      if (!$("notifs-list").children.length) $("notifs-list").append(messageCalme());
      majPastille();
    };
    const replier = () => {
      li.classList.add("referme");
      setTimeout(fin, 380);
    };
    // Sans animations (réglage de l'iPhone) : la nouvelle disparaît simplement
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return fin();

    const W = li.offsetWidth;
    li.style.height = li.offsetHeight + "px";
    const croco = document.createElement("span");
    croco.className = "croco";
    croco.innerHTML = CROCO;
    li.append(croco);
    li.classList.add("croque");
    const contenu = [...li.children].filter((c) => c !== croco);
    const depart = -LARGEUR_CROCO; // il arrive de la gauche, hors de la nouvelle
    const arrivee = W + 10; // et ressort à droite
    const t0 = performance.now();
    (function image(t) {
      const p = Math.min(1, (t - t0) / DUREE_CROCO);
      const x = depart + (arrivee - depart) * p;
      croco.style.transform = `translateX(${x}px)`;
      // Ce qui est à gauche de sa gueule est mangé : texte et fond de la carte
      const mange = Math.max(0, Math.min(W, x + BOUCHE));
      contenu.forEach((c) => {
        const gauche = mange - c.offsetLeft;
        c.style.clipPath = `inset(-4px -4px -4px ${Math.max(0, gauche)}px)`;
      });
      li.style.setProperty("--mange", mange + "px");
      if (p < 1) requestAnimationFrame(image);
      else replier();
    })(t0);
  }

  $("cloche").addEventListener("click", ouvrir);
  $("cloche").addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      ouvrir();
    }
  });
  $("notifs-recap").addEventListener("click", () => {
    $("notifs").close();
    const d = new Date();
    ouvrirRecap(new Date(d.getFullYear(), d.getMonth() - 1, 1));
  });

  // ---------- Récap du mois ----------
  async function ouvrirRecap(debut) {
    $("recap-texte").textContent = "Je prépare le récap…";
    $("recap-titre").textContent = `📊 ${MOIS[debut.getMonth()][0].toUpperCase() + MOIS[debut.getMonth()].slice(1)} ${debut.getFullYear()}`;
    $("recap-mois").value = `${debut.getFullYear()}-${pad(debut.getMonth() + 1)}`;
    $("recap").showModal();
    try {
      $("recap-texte").textContent = await construireRecap(debut);
    } catch (e) {
      $("recap-texte").textContent = "Impossible de préparer le récap (pas de réseau ?). Réessaie dans un moment.";
    }
  }
  $("recap-mois").addEventListener("change", () => {
    const [y, m] = $("recap-mois").value.split("-").map(Number);
    if (y && m) ouvrirRecap(new Date(y, m - 1, 1));
  });

  async function stats(debut, fin) {
    const a = encodeURIComponent(debut.toISOString());
    const b = encodeURIComponent(fin.toISOString());
    const [repas, couches, dodos] = await Promise.all([
      api("biberons", `?select=type,pris_le,quantite_ml,duree_min&pris_le=gte.${a}&pris_le=lt.${b}`),
      api("couches", `?select=change_le,pipi,caca,caca_taille&change_le=gte.${a}&change_le=lt.${b}`),
      api("sommeils", `?select=debut,fin&debut=lt.${b}&or=(fin.is.null,fin.gte.${a})`),
    ]);
    const finEffective = Math.min(fin.getTime(), Date.now());
    // Jours renseignés : on fait les moyennes seulement sur les jours où quelque chose a été noté
    const jours = new Set([...repas.map((r) => new Date(r.pris_le).toDateString()), ...couches.map((c) => new Date(c.change_le).toDateString())]);
    let msDodo = 0;
    let plusLongue = null;
    dodos.forEach((s) => {
      const x = Math.max(new Date(s.debut).getTime(), debut.getTime());
      const y = Math.min(s.fin ? new Date(s.fin).getTime() : Date.now(), finEffective);
      if (y > x) msDodo += y - x;
      if (s.fin) {
        const duree = new Date(s.fin) - new Date(s.debut);
        const h = new Date(s.debut).getHours();
        if ((h >= 18 || h < 4) && (!plusLongue || duree > plusLongue.duree)) plusLongue = { duree, le: new Date(s.debut) };
      }
    });
    const bib = repas.filter((r) => r.type !== "allaitement");
    const all = repas.filter((r) => r.type === "allaitement");
    const n = Math.max(jours.size, 1);
    const allDurees = all.filter((r) => r.duree_min);
    return {
      jours: jours.size,
      repasJour: repas.length / n,
      bibJour: bib.length / n,
      allJour: all.length / n,
      mlJour: bib.reduce((t, r) => t + (r.quantite_ml || 0), 0) / n,
      bibMoyen: bib.filter((r) => r.quantite_ml).length ? bib.reduce((t, r) => t + (r.quantite_ml || 0), 0) / bib.filter((r) => r.quantite_ml).length : 0,
      allDuree: allDurees.length ? allDurees.reduce((t, r) => t + r.duree_min, 0) / allDurees.length : 0,
      couchesJour: couches.length / n,
      pipisJour: couches.filter((c) => c.pipi).length / n,
      cacasJour: couches.filter((c) => c.caca).length / n,
      tailles: ["petit", "moyen", "gros"].map((t) => couches.filter((c) => c.caca_taille === t).length),
      dodoJour: msDodo / n,
      plusLongue,
    };
  }

  const v1 = (x) => x.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  function evol(actuel, avant, unite = "", fmt = (x) => v1(x)) {
    // Pas de comparaison si le mois d'avant n'a rien de noté pour cette mesure
    if (avant === null || avant === undefined || !(avant > 0)) return "";
    const d = actuel - avant;
    if (Math.abs(d) < 0.05 * Math.max(avant, 1)) return " (stable)";
    return ` (${d > 0 ? "↑ +" : "↓ −"}${fmt(Math.abs(d))}${unite} vs mois précédent)`;
  }

  async function construireRecap(debut) {
    const fin = new Date(debut.getFullYear(), debut.getMonth() + 1, 1);
    const debutAvant = new Date(debut.getFullYear(), debut.getMonth() - 1, 1);
    const [s, avant, fiche, mesures, meds, premieres] = await Promise.all([
      stats(debut, fin),
      stats(debutAvant, debut),
      api("sante_profil", "?select=date_naissance&id=eq.1"),
      api("mesures", `?select=mesure_le,poids_kg,taille_cm,pc_cm&mesure_le=lt.${fin.getFullYear()}-${pad(fin.getMonth() + 1)}-01&order=mesure_le.desc&limit=6`),
      api("medicaments_prises", `?select=nom&pris_le=gte.${encodeURIComponent(debut.toISOString())}&pris_le=lt.${encodeURIComponent(fin.toISOString())}`),
      api("premieres_fois", `?select=quoi,le&le=gte.${debut.getFullYear()}-${pad(debut.getMonth() + 1)}-01&le=lt.${fin.getFullYear()}-${pad(fin.getMonth() + 1)}-01&order=le.asc`),
    ]);
    const a = avant.jours >= 7 ? avant : null; // comparaison seulement si le mois d'avant est assez rempli
    const nomMois = `${MOIS[debut.getMonth()]} ${debut.getFullYear()}`;
    const enCours = fin > new Date();
    const L = [];
    L.push(`📊 Récap d'Hortense : ${nomMois}${enCours ? " (mois en cours)" : ""}`);
    const naissance = fiche[0]?.date_naissance;
    if (naissance) {
      const n = dateLocale(naissance);
      const ref = enCours ? new Date() : new Date(fin.getTime() - 1);
      let mois = (ref.getFullYear() - n.getFullYear()) * 12 + ref.getMonth() - n.getMonth();
      if (ref.getDate() < n.getDate()) mois--;
      if (mois >= 0) L.push(`Âge en fin de période : ${mois} mois`);
    }
    if (!s.jours) {
      L.push("", "Aucune donnée notée ce mois-ci.");
      return L.join("\n");
    }
    L.push(`Moyennes calculées sur les ${s.jours} jours renseignés.`, "");

    L.push("🍼 REPAS");
    L.push(`• ${v1(s.repasJour)} repas par jour${evol(s.repasJour, a?.repasJour)}`);
    const pl = (x, mot) => `${v1(x)} ${mot}${x >= 1.95 ? "s" : ""}`;
    L.push(`• dont ${pl(s.bibJour, "biberon")} et ${pl(s.allJour, "allaitement")} par jour`);
    if (s.mlJour) L.push(`• ${Math.round(s.mlJour)} ml de lait au biberon par jour${evol(s.mlJour, a?.mlJour, " ml", (x) => Math.round(x))}`);
    if (s.bibMoyen) L.push(`• biberon moyen : ${Math.round(s.bibMoyen)} ml`);
    if (s.allDuree) L.push(`• allaitement moyen : ${Math.round(s.allDuree)} min`);
    L.push("");
    L.push("👶 COUCHES");
    L.push(`• ${v1(s.couchesJour)} couches par jour${evol(s.couchesJour, a?.couchesJour)}`);
    L.push(`• ${pl(s.pipisJour, "pipi")} et ${pl(s.cacasJour, "caca")} par jour`);
    const tailles = ["petit", "moyen", "gros"].map((t, i) => s.tailles[i] && `${s.tailles[i]} ${t}${s.tailles[i] > 1 && t !== "gros" ? "s" : ""}`).filter(Boolean);
    if (tailles.length) L.push(`• taille des cacas : ${tailles.join(", ")}`);
    L.push("");
    L.push("😴 SOMMEIL");
    if (s.dodoJour) {
      L.push(`• ${fmtMinutes(s.dodoJour)} de sommeil noté par jour${evol(s.dodoJour / 3600000, a ? a.dodoJour / 3600000 : null, " h")}`);
      if (s.plusLongue) L.push(`• plus longue nuit : ${fmtMinutes(s.plusLongue.duree)} (nuit du ${s.plusLongue.le.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })})`);
    } else L.push("• pas de sommeil noté");

    const derniere = mesures[0];
    if (derniere) {
      L.push("", "⚖️ CROISSANCE (dernière mesure)");
      const m = [
        derniere.poids_kg !== null && `${v1(Number(derniere.poids_kg))} kg`,
        derniere.taille_cm !== null && `${v1(Number(derniere.taille_cm))} cm`,
        derniere.pc_cm !== null && `tour de tête ${v1(Number(derniere.pc_cm))} cm`,
      ].filter(Boolean);
      L.push(`• ${m.join(", ")} le ${dateLocale(derniere.mesure_le).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`);
    }
    if (meds.length) {
      const compte = {};
      meds.forEach((m) => (compte[m.nom] = (compte[m.nom] || 0) + 1));
      L.push("", "💊 MÉDICAMENTS", "• " + Object.entries(compte).map(([n, c]) => `${n} ×${c}`).join(", "));
    }
    if (premieres.length) {
      L.push("", "🌟 PREMIÈRES FOIS");
      premieres.forEach((p) => L.push(`• ${p.quoi} (le ${dateLocale(p.le).getDate()})`));
    }
    L.push("", "(Récap généré par les carnets d'Hortense. Les moyennes ne comptent que ce qui a été noté.)");
    return L.join("\n");
  }

  // Copier / partager
  $("recap-copier").addEventListener("click", async () => {
    const t = $("recap-texte").textContent;
    try {
      await navigator.clipboard.writeText(t);
      toast("📋 Récap copié ! Tu peux le coller dans un message.");
    } catch (e) {
      // Repli : on sélectionne le texte pour un copier manuel
      const r = document.createRange();
      r.selectNodeContents($("recap-texte"));
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      toast("Texte sélectionné : appuie sur « Copier »");
    }
  });
  if (navigator.share) {
    $("recap-partager").hidden = false;
    $("recap-partager").addEventListener("click", () => navigator.share({ text: $("recap-texte").textContent }).catch(() => {}));
  }

  // La cloche se met à jour avec le reste (chaque minute, après chaque ajout, en revenant sur l'appli)
  window.addEventListener("connecte", () => {
    $("cloche").toggleAttribute("hidden", !estParent());
  });
  enregistrerRubrique({ charger });
})();
