// Page Garde : l'espace des grands-parents (notes du jour + récap simplifié)
// Les données sont à part (tables garde_*) et ne se mélangent pas avec celles des parents.
// Les grands-parents notent (signé « Grands-parents ») ; les parents consultent.
(() => {
  const EMOJI_CONNUS = { "Grands-parents": "👵" };

  // Profil côté garde : { nom, emoji, parent }
  let tel = null;
  // Celui qui peut noter : les grands-parents (les parents consultent seulement)
  let moi = null;
  // Suit le profil connecté (appelé à chaque chargement : la connexion peut arriver avant ou après ce fichier)
  function suivreProfil() {
    const cle = profil ? `${profil.role}:${profil.nom}` : "";
    if (cle === suivreProfil.cle) return;
    suivreProfil.cle = cle;
    tel = profil ? { nom: profil.nom, emoji: profil.emoji, parent: estParent() } : null;
    moi = tel && !tel.parent ? { nom: "Grands-parents", emoji: "👵" } : null;
    noteModifiee = false;
  }

  let jour = minuit(); // jour affiché
  let notes = []; // notes du jour, une par personne
  let evenements = [];
  let dodoEnCours = null; // tous jours confondus
  let noteModifiee = false;

  const isoJour = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const estAujourdhui = () => jour.getTime() === minuit().getTime();
  const emojiDe = (nom) => EMOJI_CONNUS[nom] || (moi && moi.nom === nom ? moi.emoji : "🙂");
  const qui = (nom) => `${emojiDe(nom)} ${nom}`;

  async function charger() {
    suivreProfil();
    window.chargerResume?.();
    const fin = new Date(jour);
    fin.setDate(fin.getDate() + 1);
    try {
      const [n, ev, enCours] = await Promise.all([
        api("garde_jours", `?select=*&jour=eq.${isoJour(jour)}&order=updated_at.asc`),
        api(
          "garde_evenements",
          `?select=*&quand=gte.${encodeURIComponent(jour.toISOString())}&quand=lt.${encodeURIComponent(fin.toISOString())}&order=quand.asc`
        ),
        api("garde_evenements", "?select=*&type=eq.sommeil&fin=is.null&limit=1"),
      ]);
      notes = n;
      evenements = ev;
      dodoEnCours = enCours[0] || null;
      annoncerReactions();
      marquerVu();
      verifierDodoOublie();
    } catch (e) {
      afficherErreur("Impossible de charger l'espace garde. Vérifie la connexion internet.");
    }
    rendre();
  }

  // ---------- Affichage ----------
  function rendre() {
    // Qui utilise ce téléphone
    // (les grands-parents n'ont pas besoin de ce bandeau : leurs gros boutons sont juste en dessous)
    $("g-whoami").hidden = !!moi;
    $("g-who-name").textContent = !tel ? "" : tel.parent ? "👨‍👩‍👧 Parents · vous consultez ce que les grands-parents notent" : "👵 Grands-parents · vous pouvez noter la journée";

    // Jour
    const nom = jour.toLocaleDateString("fr-FR", { weekday: "long" });
    $("g-day-name").textContent = estAujourdhui() ? `Aujourd'hui, ${nom}` : nom[0].toUpperCase() + nom.slice(1);
    $("g-day-date").textContent = jour.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    $("g-next").disabled = estAujourdhui();

    // Qui a gardé ce jour-là (d'après les notes et le récap)
    const gardiens = [...new Set([...notes.map((x) => x.gardien), ...evenements.map((e) => e.gardien).filter(Boolean)])];
    $("g-by").innerHTML = gardiens.length
      ? `Gardée par <strong>${gardiens.map((g) => esc(qui(g))).join(" et ")}</strong>`
      : "Personne n'a encore rien noté ce jour-là.";

    // Mots du jour de chacun (le sien se touche pour le modifier)
    $("g-notes").replaceChildren(
      ...notes
        .filter((x) => x.note)
        .map((x) => {
          const li = document.createElement("li");
          li.className = "note-card";
          li.innerHTML = `<p class="note-head">${esc(qui(x.gardien))} <span>· ${fmtHeure(x.updated_at)}</span></p>
            <p class="note-text">${esc(x.note)}</p>`;
          if (moi && x.gardien === moi.nom) {
            li.classList.add("modifiable");
            li.setAttribute("role", "button");
            li.tabIndex = 0;
            li.addEventListener("click", ecrireMot);
          }
          return li;
        })
    );

    // Gros boutons : seulement pour la famille (Mamita, grands-parents) ; aujourd'hui = notés tout de suite,
    // un autre jour = seulement « ajouter quelque chose ce jour-là » (avec l'heure)
    const aujourdhui = estAujourdhui();
    $("g-actions").hidden = !moi;
    $("g-tuiles").hidden = !aujourdhui;
    $("g-oubli-lien").textContent = aujourdhui ? "🕓 J'ai oublié de noter" : `🕓 Ajouter ce ${nom}`;
    const monMot = moi && notes.find((x) => x.gardien === moi.nom && x.note);
    $("g-mot").textContent = monMot ? "📝 Modifier mon mot" : "📝 Un mot pour les parents";
    $("g-read-hint").hidden = !!moi;
    $("g-read-hint").textContent = tel?.parent
      ? "👀 Mode parents : vous voyez tout ce que les grands-parents notent."
      : "👀 Mode consultation.";
    $("g-modif-hint").hidden = !(moi || tel?.parent) || !evenements.length;

    // Récap
    const plusieurs = gardiens.length > 1;
    const signe = (e) => (plusieurs && e.gardien ? ` · ${e.gardien}` : "");
    const repas = evenements.filter((e) => e.type === "repas");
    const couches = evenements.filter((e) => e.type === "couche");
    const dodos = evenements.filter((e) => e.type === "sommeil");

    const ml = repas.reduce((t, e) => t + (e.ml || 0), 0);
    $("g-repas-sum").textContent = `${repas.length}` + (ml ? ` · ${ml} ml` : "");
    remplir("g-repas-list", repas, (e) => `${fmtHeure(e.quand)} · ${e.ml ? e.ml + " ml" : "?"}${e.lait === "maternel" ? " 🥛" : ""}${signe(e)}`, "Pas encore de repas");

    const cacas = couches.filter((e) => e.caca).length;
    $("g-couche-sum").textContent = `${couches.length}` + (cacas ? ` · ${cacas} 💩` : "");
    remplir("g-couche-list", couches, (e) => `${fmtHeure(e.quand)} ${e.pipi ? "💧" : ""}${e.caca ? "💩" : ""}${signe(e)}`, "Pas encore de couche");

    const total = dodos.reduce((t, e) => t + ((e.fin ? new Date(e.fin) : new Date()) - new Date(e.quand)), 0);
    $("g-sleep-sum").textContent = dodos.length ? fmtMinutes(total) : "0";
    remplir("g-sleep-list", dodos, (e) => `${fmtHeure(e.quand)} → ${e.fin ? fmtHeure(e.fin) : "en cours"}${signe(e)}`, "Pas encore de dodo");
    majBoutonDodo();
    rendreVu();
    contenuChange();
  }

  function majBoutonDodo() {
    const btn = $("g-t-dodo");
    const dort = dodoEnCours ? fmtMinutes(Math.max(60000, Date.now() - new Date(dodoEnCours.quand).getTime())) : "";
    $("g-t-dodo-emoji").textContent = dodoEnCours ? "☀️" : "🌙";
    $("g-t-dodo-nom").textContent = dodoEnCours ? "Réveillée" : "Elle s'endort";
    $("g-t-dodo-sous").textContent = dodoEnCours ? "toucher au réveil" : "dodo";
    btn.classList.toggle("on", !!dodoEnCours);
    // Elle dort : grand bandeau tout en haut pour noter le réveil (impossible à rater)
    $("g-reveil").hidden = !dodoEnCours || !moi || !estAujourdhui();
    if (dodoEnCours) $("g-reveil-depuis").textContent = `😴 Hortense dort depuis ${dort}`;
    // Rappel doux après 3 h de dodo : penser au bouton réveil
    const depuis = dodoEnCours ? Date.now() - new Date(dodoEnCours.quand).getTime() : 0;
    const alerte = $("g-alerte-dodo");
    alerte.hidden = depuis < 3 * 3600000;
    if (!alerte.hidden)
      alerte.textContent = dodoOublie(dodoEnCours.quand)
        ? "⚠️ Ce dodo n'a pas été arrêté : touche le bouton pour dire à quelle heure elle s'est réveillée."
        : "⏰ Long dodo : pense à toucher « Elle se réveille » dès qu'elle ouvre les yeux.";
  }

  // Deux notes identiques à moins de 10 minutes d'écart : sans doute un appui en trop
  const memeContenu = (a, b) =>
    a.type === b.type && a.gardien === b.gardien && (a.ml ?? null) === (b.ml ?? null) && (a.lait ?? null) === (b.lait ?? null) &&
    !!a.pipi === !!b.pipi && !!a.caca === !!b.caca;
  const estDoublon = (e, liste) =>
    e.type !== "sommeil" && liste.some((x) => x.id < e.id && memeContenu(x, e) && Math.abs(new Date(e.quand) - new Date(x.quand)) < 10 * 60000);

  // Pastilles : la famille efface les siennes, les parents peuvent tout effacer (un appui « Effacer ? », un second efface).
  // Les parents peuvent aussi réagir avec un émoji, que les grands-parents voient.
  function remplir(id, liste, texte, vide) {
    const el = $(id);
    if (!liste.length) {
      el.innerHTML = `<span class="pill empty">${vide}</span>`;
      return;
    }
    el.replaceChildren(
      ...liste.map((e) => {
        const groupe = document.createElement("span");
        groupe.className = "pill-groupe";
        const b = document.createElement("button");
        b.type = "button";
        const effacable = (moi && e.gardien === moi.nom) || tel?.parent;
        const doublon = estDoublon(e, liste);
        const etiquette = () => texte(e) + (doublon ? " · ⚠️ doublon ?" : "");
        b.className = "pill" + (e.type === "sommeil" && !e.fin ? " live" : "") + (effacable ? "" : " readonly") + (doublon ? " doublon" : "");
        b.textContent = etiquette();
        groupe.append(b, boutonReaction(e));
        if (!effacable) {
          b.disabled = true;
          return groupe;
        }
        b.setAttribute("aria-label", `${etiquette()} : changer l'heure ou effacer`);
        b.addEventListener("click", () => ouvrirLigne(e));
        return groupe;
      })
    );
  }

  // ---------- Réactions ----------
  const REACTIONS = ["❤️", "😊", "👍", "😂", "😮", "😕"];
  // Parents : petit bouton « 🙂+ » (ou la réaction déjà mise) qui ouvre la palette.
  // Famille : la réaction des parents s'affiche simplement à côté de la note.
  function boutonReaction(e) {
    const r = document.createElement("button");
    r.type = "button";
    r.className = "reaction" + (e.reaction ? " mise" : "");
    if (!tel?.parent) {
      if (!e.reaction) return document.createTextNode("");
      r.disabled = true;
      r.textContent = e.reaction;
      r.title = `${e.reaction_par || "Les parents"} a réagi`;
      return r;
    }
    r.textContent = e.reaction || "🙂+";
    r.setAttribute("aria-label", e.reaction ? `Changer la réaction ${e.reaction}` : "Réagir avec un émoji");
    r.addEventListener("click", (ev) => {
      ev.stopPropagation();
      ouvrirPalette(r, e);
    });
    return r;
  }

  function fermerPalette() {
    document.querySelector(".palette-reactions")?.remove();
  }
  function ouvrirPalette(ancre, e) {
    const dejaOuverte = document.querySelector(".palette-reactions")?.dataset.id === String(e.id);
    fermerPalette();
    if (dejaOuverte) return;
    const pal = document.createElement("div");
    pal.className = "palette-reactions";
    pal.dataset.id = e.id;
    pal.setAttribute("role", "menu");
    [...REACTIONS, ...(e.reaction ? ["✕"] : [])].forEach((emo) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = emo;
      b.setAttribute("aria-label", emo === "✕" ? "Retirer la réaction" : `Réagir ${emo}`);
      if (emo === e.reaction) b.classList.add("choisi");
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        fermerPalette();
        reagir(e, emo === "✕" || emo === e.reaction ? null : emo);
      });
      pal.append(b);
    });
    ancre.parentElement.append(pal);
    // Ne pas dépasser du bord droit de l'écran
    const deborde = pal.getBoundingClientRect().right - (window.innerWidth - 8);
    if (deborde > 0) pal.style.left = `${-deborde}px`;
  }
  document.addEventListener("click", (ev) => {
    if (!ev.target.closest?.(".palette-reactions")) fermerPalette();
  });

  async function reagir(e, emo) {
    const avant = { reaction: e.reaction, reaction_par: e.reaction_par, reaction_le: e.reaction_le };
    Object.assign(e, { reaction: emo, reaction_par: emo ? tel.nom : null, reaction_le: emo ? new Date().toISOString() : null });
    rendre(); // tout de suite à l'écran
    try {
      await api("garde_evenements", `?id=eq.${e.id}`, {
        method: "PATCH",
        body: JSON.stringify({ reaction: e.reaction, reaction_par: e.reaction_par, reaction_le: e.reaction_le }),
      });
      if (emo) toast(`${emo} envoyé à ${e.gardien || "la famille"}`);
    } catch (err) {
      Object.assign(e, avant);
      rendre();
      afficherErreur("La réaction n'a pas pu être envoyée. Réessaie.");
    }
  }

  // ---------- « Vu par les parents » ----------
  // Un parent qui regarde la page Garde marque tout seul les notes de la famille comme vues
  const gardeAffichee = () => lire("page-id", null, (v) => typeof v === "string") === "page-garde" && document.visibilityState === "visible";
  async function marquerVu() {
    if (!tel?.parent || !gardeAffichee() || !evenements.some((e) => !e.vu_le)) return;
    const maintenant = new Date().toISOString();
    try {
      await api("garde_evenements", `?vu_le=is.null&created_at=lte.${encodeURIComponent(maintenant)}`, {
        method: "PATCH",
        body: JSON.stringify({ vu_le: maintenant, vu_par: tel.nom }),
      });
      evenements.forEach((e) => !e.vu_le && Object.assign(e, { vu_le: maintenant, vu_par: tel.nom }));
    } catch (e) {
      /* pas grave : ce sera marqué la prochaine fois */
    }
  }
  window.addEventListener("page-vue", (e) => e.detail === "page-garde" && marquerVu());
  document.addEventListener("visibilitychange", () => marquerVu());

  // Famille : « 👀 Vu par Maman à 14:12 » pour ses notes du jour
  function rendreVu() {
    const el = $("g-vu");
    const miennes = moi ? evenements.filter((e) => e.gardien === moi.nom) : [];
    if (!miennes.length) return (el.hidden = true);
    const vues = miennes.filter((e) => e.vu_le).sort((a, b) => new Date(a.vu_le) - new Date(b.vu_le));
    const pasVues = miennes.length - vues.length;
    const der = vues[vues.length - 1];
    el.textContent = !der
      ? "🕓 Les parents n'ont pas encore vu tes notes"
      : `👀 Vu par ${der.vu_par || "les parents"} à ${fmtHeure(der.vu_le)}` +
        (pasVues ? ` · ${pasVues} nouvelle${pasVues > 1 ? "s" : ""} pas encore vue${pasVues > 1 ? "s" : ""}` : " · tout est vu ✓");
    el.hidden = false;
  }

  // Famille : prévenue des nouvelles réactions des parents sur ses notes (une fois chacune)
  async function annoncerReactions() {
    if (!moi) return;
    const cle = `reactions-vues-${moi.nom}`;
    const vu = lire(cle, 0, Number.isFinite);
    try {
      const depuis = new Date(Math.max(vu, Date.now() - 3 * DAY_MS)).toISOString();
      const liste = await api(
        "garde_evenements",
        `?select=type,quand,ml,reaction,reaction_par,reaction_le&gardien=eq.${encodeURIComponent(moi.nom)}&reaction_le=gt.${encodeURIComponent(depuis)}&order=reaction_le.desc`
      );
      if (!liste.length) return;
      ecrire(cle, Date.now());
      if (!vu) return; // première fois sur ce téléphone : on ne ressort pas l'historique
      const quoi = { repas: "ton biberon", couche: "ta couche", sommeil: "ton dodo" };
      const x = liste[0];
      const autres = liste.length > 1 ? ` (et ${liste.length - 1} autre${liste.length > 2 ? "s" : ""})` : "";
      $("g-reactions").textContent = `${x.reaction} ${x.reaction_par || "Les parents"} a réagi à ${quoi[x.type] || "ta note"} de ${fmtHeure(x.quand)}${autres}`;
      $("g-reactions").hidden = false;
    } catch (e) {
      /* pas grave : on réessaiera au prochain chargement */
    }
  }
  $("g-reactions").addEventListener("click", () => ($("g-reactions").hidden = true));

  // ---------- Actions ----------
  async function enregistrerNote(texte) {
    if (!moi) return false;
    try {
      await api("garde_jours", "?on_conflict=jour,gardien", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({
          jour: isoJour(jour),
          gardien: moi.nom,
          note: texte.trim() || null,
          updated_at: new Date().toISOString(),
        }),
      });
      toast("📝 Mot enregistré : les parents peuvent le lire");
      await charger();
      return true;
    } catch (e) {
      return false;
    }
  }

  async function ajouter(ligne, msg) {
    if (!moi) return;
    const nouvelle = { type: ligne.type, gardien: moi.nom, ...ligne };
    const recente = !ligne.quand && evenements.filter((x) => memeContenu(x, nouvelle) && Date.now() - new Date(x.created_at || x.quand) < 5 * 60000).pop();
    if (recente) {
      const quoi = ligne.type === "repas" ? `ce biberon${ligne.ml ? ` de ${ligne.ml} ml` : ""}` : "cette couche";
      const ilYa = fmtIlYa(Date.now() - new Date(recente.created_at || recente.quand));
      if (!(await demanderDoublon(`Tu as déjà noté ${quoi} ${ilYa}. C'est bien un deuxième ?`))) {
        toast("Pas ajouté 👍");
        return;
      }
    }
    try {
      await api("garde_evenements", "", {
        method: "POST",
        body: JSON.stringify({ quand: new Date().toISOString(), gardien: moi.nom, ...ligne }),
      });
      animerBouton($({ repas: "g-t-biberon", couche: "g-t-couche", sommeil: "g-t-dodo" }[ligne.type]));
      toast(msg);
      afficherErreur(null);
      await charger();
    } catch (e) {
      afficherErreur(e.status === 409 ? "Un dodo est déjà en cours." : "Impossible d'enregistrer. Vérifie les heures et réessaie.");
      await charger();
    }
  }

  // ---------- Dodo oublié ----------
  // Un dodo lancé il y a plus de 12 h : on demande l'heure du réveil (ou on l'efface), une fois par ouverture
  let dejaDemande = null;
  async function verifierDodoOublie(forcer = false) {
    const d = dodoEnCours;
    // (les parents règlent ce cas depuis leur page Sommeil, pour ne pas le demander deux fois)
    if (!d || !dodoOublie(d.quand) || !moi) return false;
    if (!forcer && dejaDemande === d.id) return false;
    dejaDemande = d.id;
    const r = await demanderReveilOublie(d.quand);
    if (!r) return true;
    try {
      if (r.effacer) {
        await api("garde_evenements", `?id=eq.${d.id}`, { method: "DELETE" });
        toast("🗑️ Dodo effacé");
      } else {
        await api("garde_evenements", `?id=eq.${d.id}`, { method: "PATCH", body: JSON.stringify({ fin: r.fin.toISOString() }) });
        toast(`☀️ Réveil noté à ${fmtHeure(r.fin)}`);
      }
      dodoEnCours = null;
      await charger();
    } catch (e) {
      afficherErreur("Impossible d'enregistrer. Réessaie.");
    }
    return true;
  }

  // Un repas pendant un dodo : Hortense est réveillée, on arrête le dodo à cette heure-là
  async function finirDodoAvantRepas() {
    if (!dodoEnCours || dodoOublie(dodoEnCours.quand)) return false;
    try {
      await api("garde_evenements", `?id=eq.${dodoEnCours.id}`, { method: "PATCH", body: JSON.stringify({ fin: new Date().toISOString() }) });
      dodoEnCours = null;
      return true;
    } catch (e) {
      return false;
    }
  }

  async function basculerDodo() {
    if (dodoEnCours && (await verifierDodoOublie(true))) return;
    if (!dodoEnCours) return ajouter({ type: "sommeil" }, "🌙 Dodo lancé");
    try {
      await api("garde_evenements", `?id=eq.${dodoEnCours.id}`, {
        method: "PATCH",
        body: JSON.stringify({ fin: new Date().toISOString() }),
      });
      toast(`☀️ Réveillée après ${fmtMinutes(Date.now() - new Date(dodoEnCours.quand).getTime())}`);
      await charger();
    } catch (e) {
      afficherErreur("Impossible d'enregistrer le réveil. Réessaie.");
    }
  }

  // ---------- Petite fenêtre à tout faire ----------
  // feuille("titre", (corps, fermer) => { ...remplit le corps... })
  function feuille(titre, construire) {
    const dlg = $("g-feuille");
    $("g-feuille-titre").textContent = titre;
    const corps = $("g-feuille-corps");
    corps.replaceChildren();
    const fermer = () => dlg.open && dlg.close();
    construire(corps, fermer);
    $("g-feuille-fermer").onclick = fermer;
    if (!dlg.open) dlg.showModal();
  }
  const grosBouton = (texte, action, classe = "") => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "g-gros " + classe;
    b.innerHTML = texte;
    b.addEventListener("click", action);
    return b;
  };
  const titre = (t) => {
    const p = document.createElement("p");
    p.className = "g-feuille-label";
    p.textContent = t;
    return p;
  };
  // Heure en deux menus (heures : minutes), plus simple et plus sûr que la roue de l'iPhone
  function menusHeure(date) {
    const d = date ? new Date(date) : new Date();
    const boite = document.createElement("div");
    boite.className = "heure-menus oubli-heure";
    const menu = (max, val, pasDe, nom) => {
      const sel = document.createElement("select");
      sel.setAttribute("aria-label", nom);
      for (let i = 0; i < max; i += pasDe) sel.append(new Option(pad(i), pad(i)));
      sel.value = pad(val);
      return sel;
    };
    const h = menu(24, d.getHours(), 1, "Heures");
    const m = menu(60, d.getMinutes(), 1, "Minutes");
    const sep = document.createElement("span");
    sep.textContent = ":";
    boite.append(h, sep, m);
    return { el: boite, heure: () => `${h.value}:${m.value}` };
  }
  // Date du jour affiché à l'heure choisie
  const aLHeure = (hhmm, base = jour) => {
    const [h, m] = hhmm.split(":").map(Number);
    const d = new Date(base);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const erreurFeuille = (corps, msg) => {
    let p = corps.querySelector(".g-feuille-erreur");
    if (!p) {
      p = document.createElement("p");
      p.className = "g-feuille-erreur";
      corps.append(p);
    }
    p.textContent = msg;
  };

  // ---------- Biberon : un appui avec la quantité habituelle ----------
  let biberon = lire("garde-biberon", { ml: 150, lait: "poudre" }, (v) => v && Number.isInteger(v.ml) && v.ml >= 10 && v.ml <= 300);
  // Quantité (− / +) et type de lait, en gros
  function choixQuantite(corps, depart) {
    const choix = { ...depart };
    const ligne = document.createElement("div");
    ligne.className = "g-quantite";
    const val = document.createElement("span");
    val.className = "g-quantite-val";
    const maj = () => {
      val.textContent = `${choix.ml} ml`;
      laits.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lait === choix.lait)));
    };
    const pas = (n) => () => {
      choix.ml = Math.min(300, Math.max(10, choix.ml + n));
      maj();
    };
    ligne.append(grosBouton("−", pas(-10), "rond"), val, grosBouton("+", pas(10), "rond"));
    const laits = [
      ["poudre", "🥄 Poudre"],
      ["maternel", "🥛 Maternel"],
    ].map(([v, t]) => {
      const b = grosBouton(t, () => {
        choix.lait = v;
        maj();
      }, "choix");
      b.dataset.lait = v;
      return b;
    });
    const rangee = document.createElement("div");
    rangee.className = "g-rangee";
    rangee.append(...laits);
    corps.append(titre("Quantité"), ligne, titre("Lait"), rangee);
    maj();
    return choix;
  }
  // Biberon : on choisit la quantité bue (en partant de la dernière) puis « Noter »
  function choisirBiberon() {
    feuille("🍼 Combien a-t-elle bu ?", (corps, fermer) => {
      const choix = choixQuantite(corps, biberon);
      corps.append(
        grosBouton("✅ Noter ce biberon", async () => {
          biberon = { ml: choix.ml, lait: choix.lait };
          ecrire("garde-biberon", biberon);
          fermer();
          const reveille = await finirDodoAvantRepas();
          ajouter({ type: "repas", ml: biberon.ml, lait: biberon.lait }, `🍼 Biberon de ${biberon.ml} ml noté${reveille ? " · ☀️ dodo terminé" : ""}`);
        }, "principal")
      );
    });
  }

  // Dodo : « il s'endort » / « il s'est réveillé », maintenant ou un peu plus tôt
  function choisirDodo() {
    if (dodoEnCours && dodoOublie(dodoEnCours.quand)) return verifierDodoOublie(true);
    const reveil = !!dodoEnCours;
    feuille(reveil ? "☀️ Hortense s'est réveillée ?" : "🌙 Hortense s'endort ?", (corps, fermer) => {
      corps.append(
        grosBouton(reveil ? "☀️ Oui, elle se réveille maintenant" : "🌙 Oui, elle s'endort maintenant", () => {
          fermer();
          basculerDodo();
        }, "principal"),
        grosBouton("🕓 C'était un peu plus tôt", () => dodoPlusTot(reveil))
      );
    });
  }
  function dodoPlusTot(reveil) {
    feuille(reveil ? "☀️ Réveillée à quelle heure ?" : "🌙 Endormie à quelle heure ?", (corps, fermer) => {
      const h = menusHeure(new Date(Date.now() - 15 * 60000));
      corps.append(h.el);
      corps.append(
        grosBouton("✅ Enregistrer", async () => {
          const quand = aLHeure(h.heure(), new Date());
          if (!passe(quand)) return erreurFeuille(corps, "Cette heure est dans le futur : vérifie.");
          if (reveil && quand <= new Date(dodoEnCours.quand)) return erreurFeuille(corps, `Elle s'est endormie à ${fmtHeure(dodoEnCours.quand)} : le réveil doit être après.`);
          fermer();
          if (!reveil) return ajouter({ type: "sommeil", quand: quand.toISOString() }, `🌙 Dodo noté depuis ${fmtHeure(quand)}`);
          try {
            await api("garde_evenements", `?id=eq.${dodoEnCours.id}`, { method: "PATCH", body: JSON.stringify({ fin: quand.toISOString() }) });
            toast(`☀️ Réveillée à ${fmtHeure(quand)}`);
            await charger();
          } catch (e) {
            afficherErreur("Impossible d'enregistrer le réveil. Réessaie.");
          }
        }, "principal")
      );
    });
  }

  // ---------- Un mot pour les parents (la note du jour) ----------
  function ecrireMot() {
    if (!moi) return;
    const mien = notes.find((x) => x.gardien === moi.nom);
    feuille("📝 Un mot pour les parents", (corps, fermer) => {
      const zone = document.createElement("textarea");
      zone.className = "g-mot-zone";
      zone.rows = 5;
      zone.maxLength = 2000;
      zone.placeholder = "Ce que vous avez fait, comment elle était, ce qu'il faut savoir…";
      zone.value = mien?.note || "";
      corps.append(zone, grosBouton("💾 Enregistrer", async () => {
        if (await enregistrerNote(zone.value)) fermer();
        else erreurFeuille(corps, "Pas enregistré : vérifie internet et réessaie.");
      }, "principal"));
    });
  }

  // ---------- Couche : 3 grands choix ----------
  const COUCHES = [
    ["pipi", "💧 Pipi", { pipi: true, caca: false }],
    ["caca", "💩 Caca", { pipi: false, caca: true }],
    ["deux", "💧💩 Les deux", { pipi: true, caca: true }],
  ];
  function choisirCouche() {
    feuille("👶 Dans la couche ?", (corps, fermer) => {
      COUCHES.forEach(([, texte, valeurs]) =>
        corps.append(
          grosBouton(texte, () => {
            fermer();
            ajouter({ type: "couche", ...valeurs }, `👶 Couche notée (${texte.replace(/^\S+ /, "").toLowerCase()})`);
          }, "principal")
        )
      );
    });
  }

  // ---------- « J'ai oublié de noter » : biberon, couche ou dodo à une heure passée ----------
  function oubli() {
    feuille(estAujourdhui() ? "🕓 Qu'as-tu oublié ?" : `🕓 Ajouter au ${jour.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}`, (corps) => {
      corps.append(
        grosBouton("🍼 Un biberon", oubliBiberon, "principal"),
        grosBouton("👶 Une couche", oubliCouche, "principal"),
        grosBouton("😴 Un dodo", oubliDodo, "principal")
      );
    });
  }
  const passe = (d) => d <= new Date(Date.now() + 60000);
  function oubliBiberon() {
    feuille("🍼 Biberon oublié", (corps, fermer) => {
      const h = menusHeure(estAujourdhui() ? new Date(Date.now() - 30 * 60000) : aLHeure("12:00"));
      corps.append(titre("À quelle heure ?"), h.el);
      const choix = choixQuantite(corps, biberon);
      corps.append(
        grosBouton("✅ Ajouter ce biberon", () => {
          const quand = aLHeure(h.heure());
          if (!passe(quand)) return erreurFeuille(corps, "Cette heure est dans le futur : vérifie.");
          fermer();
          ajouter({ type: "repas", ml: choix.ml, lait: choix.lait, quand: quand.toISOString() }, `🍼 Biberon de ${fmtHeure(quand)} ajouté`);
        }, "principal")
      );
    });
  }
  function oubliCouche() {
    feuille("👶 Couche oubliée", (corps, fermer) => {
      const h = menusHeure(estAujourdhui() ? new Date(Date.now() - 30 * 60000) : aLHeure("12:00"));
      corps.append(titre("À quelle heure ?"), h.el, titre("Dans la couche"));
      COUCHES.forEach(([, texte, valeurs]) =>
        corps.append(
          grosBouton(texte, () => {
            const quand = aLHeure(h.heure());
            if (!passe(quand)) return erreurFeuille(corps, "Cette heure est dans le futur : vérifie.");
            fermer();
            ajouter({ type: "couche", ...valeurs, quand: quand.toISOString() }, `👶 Couche de ${fmtHeure(quand)} ajoutée`);
          }, "principal")
        )
      );
    });
  }
  function oubliDodo() {
    feuille("😴 Dodo oublié", (corps, fermer) => {
      const base = estAujourdhui() ? new Date(Date.now() - 2 * 3600000) : aLHeure("13:00");
      const a = menusHeure(base);
      const b = menusHeure(new Date(base.getTime() + 3600000));
      corps.append(titre("Endormie à"), a.el, titre("Réveillée à"), b.el);
      corps.append(
        grosBouton("✅ Ajouter ce dodo", () => {
          const debut = aLHeure(a.heure());
          const fin = aLHeure(b.heure());
          if (fin <= debut) fin.setDate(fin.getDate() + 1); // ex. 23:00 → 01:30
          if (!passe(fin)) return erreurFeuille(corps, "Le réveil est dans le futur : vérifie les heures.");
          if (fin - debut > DODO_OUBLIE_MS) return erreurFeuille(corps, "Plus de 12 h de dodo : vérifie les heures.");
          fermer();
          ajouter({ type: "sommeil", quand: debut.toISOString(), fin: fin.toISOString() }, `😴 Dodo de ${fmtMinutes(fin - debut)} ajouté`);
        }, "principal")
      );
    });
  }

  // ---------- Toucher une ligne : changer l'heure ou effacer ----------
  const NOMS = { repas: "🍼 Biberon", couche: "👶 Couche", sommeil: "😴 Dodo" };
  function ouvrirLigne(e) {
    feuille(`${NOMS[e.type] || "Note"} de ${fmtHeure(e.quand)}`, (corps, fermer) => {
      corps.append(
        grosBouton("🕓 Changer l'heure", () => changerHeure(e), "principal"),
        grosBouton("🗑️ Effacer", () => {
          fermer();
          supprimer(e.id);
        }, "danger")
      );
    });
  }
  function changerHeure(e) {
    feuille(`🕓 ${NOMS[e.type] || "Note"} : nouvelle heure`, (corps, fermer) => {
      const a = menusHeure(e.quand);
      const b = e.type === "sommeil" && e.fin ? menusHeure(e.fin) : null;
      corps.append(titre(e.type === "sommeil" ? "Endormie à" : "Heure"), a.el);
      if (b) corps.append(titre("Réveillée à"), b.el);
      corps.append(
        grosBouton("✅ Enregistrer", async () => {
          const quand = aLHeure(a.heure(), e.quand);
          const maj = { quand: quand.toISOString() };
          if (b) {
            const fin = aLHeure(b.heure(), quand);
            if (fin <= quand) fin.setDate(fin.getDate() + 1);
            if (!passe(fin)) return erreurFeuille(corps, "Le réveil est dans le futur : vérifie.");
            if (fin - quand > DODO_OUBLIE_MS) return erreurFeuille(corps, "Plus de 12 h de dodo : vérifie les heures.");
            maj.fin = fin.toISOString();
          }
          if (!passe(quand)) return erreurFeuille(corps, "Cette heure est dans le futur : vérifie.");
          try {
            await api("garde_evenements", `?id=eq.${e.id}`, { method: "PATCH", body: JSON.stringify(maj) });
            fermer();
            toast("🕓 Heure changée");
            await charger();
          } catch (err) {
            erreurFeuille(corps, "Impossible d'enregistrer. Réessaie.");
          }
        }, "principal")
      );
    });
  }

  async function supprimer(id) {
    try {
      await api("garde_evenements", `?id=eq.${id}`, { method: "DELETE" });
      toast("Effacé");
      await charger();
    } catch (e) {
      afficherErreur("Suppression impossible. Réessaie.");
    }
  }

  function changerJour(delta) {
    const d = new Date(jour);
    d.setDate(d.getDate() + delta);
    if (d > minuit()) return;
    jour = d;
    noteModifiee = false;
    charger();
  }

  $("g-prev").addEventListener("click", () => changerJour(-1));
  $("g-next").addEventListener("click", () => changerJour(1));
  $("g-t-biberon").addEventListener("click", choisirBiberon);
  $("g-t-couche").addEventListener("click", choisirCouche);
  $("g-t-dodo").addEventListener("click", choisirDodo);
  $("g-reveil").addEventListener("click", choisirDodo);
  $("g-mot").addEventListener("click", ecrireMot);
  $("g-oubli-lien").addEventListener("click", oubli);

  // Minuit passé : on revient sur le nouveau jour (sauf si une note est en cours d'écriture)
  let dernierMinuit = minuit().getTime();
  function tick() {
    if (minuit().getTime() !== dernierMinuit) {
      const etaitAujourdhui = jour.getTime() === dernierMinuit;
      dernierMinuit = minuit().getTime();
      if (etaitAujourdhui && !noteModifiee) {
        jour = minuit();
        charger();
        return;
      }
    }
    // Seul le bouton du dodo bouge chaque seconde
    if (dodoEnCours) majBoutonDodo();
  }

  enregistrerRubrique({ charger, tick });
})();
