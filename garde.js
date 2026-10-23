// Page Garde : la journée d'Hortense chez la micro-crèche ou les grands-parents (notes du jour + récap simplifié)
// Les données sont à part (tables garde_*) et ne se mélangent pas avec celles des parents.
// - Grands-parents : ils notent eux-mêmes, signé « Grands-parents »
// - Parents : ils peuvent recopier les transmissions de la micro-crèche (signé « Micro-crèche »)
(() => {
  const GARDES = [
    { nom: "Micro-crèche", emoji: "🏡" },
    { nom: "Grands-parents", emoji: "👵" },
  ];
  const EMOJI_CONNUS = Object.fromEntries(GARDES.map((g) => [g.nom, g.emoji]));

  // Profil côté garde : { nom, emoji, parent }
  let tel = null;
  // Au nom de qui on note : les grands-parents pour eux-mêmes, la micro-crèche (ou les grands-parents) pour les parents
  let moi = null;
  let choixParents = lire("garde-parents", "Micro-crèche", (v) => GARDES.some((g) => g.nom === v));
  // Suit le profil connecté (appelé à chaque chargement : la connexion peut arriver avant ou après ce fichier)
  function suivreProfil() {
    const cle = profil ? `${profil.role}:${profil.nom}:${choixParents}` : "";
    if (cle === suivreProfil.cle) return;
    suivreProfil.cle = cle;
    tel = profil ? { nom: profil.nom, emoji: profil.emoji, parent: estParent() } : null;
    const g = tel?.parent ? GARDES.find((x) => x.nom === choixParents) : GARDES[1];
    moi = tel ? { nom: g.nom, emoji: g.emoji } : null;
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
      if (!noteModifiee) $("g-note").value = (moi && notes.find((x) => x.gardien === moi.nom)?.note) || "";
    } catch (e) {
      afficherErreur("Impossible de charger l'espace garde. Vérifie la connexion internet.");
    }
    rendre();
  }

  // ---------- Affichage ----------
  function rendre() {
    // Qui utilise ce téléphone
    $("g-who-name").textContent = !tel ? "" : tel.parent ? "Gardée aujourd'hui par :" : `${moi.emoji} Grands-parents · vous pouvez noter la journée`;
    $("g-garde-choix").hidden = !tel?.parent;
    document.querySelectorAll("#g-garde-choix .chip").forEach((c) => c.setAttribute("aria-checked", String(c.dataset.garde === choixParents)));

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

    // Notes de chacun (sauf la mienne, qui est dans le champ d'écriture)
    const autres = notes.filter((x) => x.note && (!moi || x.gardien !== moi.nom));
    $("g-notes").innerHTML = autres
      .map(
        (x) => `<li class="note-card">
          <p class="note-head">${esc(qui(x.gardien))} <span>· ${fmtHeure(x.updated_at)}</span></p>
          <p class="note-text">${esc(x.note)}</p>
        </li>`
      )
      .join("");
    $("g-my-note").hidden = !moi;
    if (moi) {
      $("g-my-note-label").textContent = `📝 Note du jour · ${moi.emoji} ${moi.nom}`;
      const mienne = notes.find((x) => x.gardien === moi.nom);
      if (!noteModifiee)
        $("g-note-saved").textContent = mienne?.updated_at ? `✅ Enregistrée en ligne à ${fmtHeure(mienne.updated_at)} : tout le monde peut la lire.` : "";
    }

    // Boutons d'ajout : seulement pour un téléphone qui a choisi qui il est
    const aujourdhui = estAujourdhui();
    document.querySelectorAll("#page-garde [data-today-only]").forEach((el) => (el.hidden = !moi || !aujourdhui));
    document.querySelectorAll("#page-garde [data-writer-only]").forEach((el) => (el.hidden = !moi));
    $("g-read-hint").hidden = !!moi;
    $("g-read-hint").textContent = tel?.parent
      ? "👀 Vous voyez tout ce que la micro-crèche et les grands-parents ont noté."
      : "👀 Mode consultation.";
    $("g-past-hint").hidden = !moi || aujourdhui;

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
    contenuChange();
  }

  function majBoutonDodo() {
    const btn = $("g-sleep-btn");
    btn.textContent = dodoEnCours ? `☀️ Elle se réveille · ${fmtDuree(Date.now() - new Date(dodoEnCours.quand).getTime())}` : "🌙 Elle s'endort maintenant";
    btn.classList.toggle("on", !!dodoEnCours);
  }

  // Pastilles : on ne peut effacer que les siennes (un appui « Effacer ? », un second efface)
  function remplir(id, liste, texte, vide) {
    const el = $(id);
    if (!liste.length) {
      el.innerHTML = `<span class="pill empty">${vide}</span>`;
      return;
    }
    el.replaceChildren(
      ...liste.map((e) => {
        const b = document.createElement("button");
        b.type = "button";
        const mienne = moi && e.gardien === moi.nom;
        b.className = "pill" + (e.type === "sommeil" && !e.fin ? " live" : "") + (mienne ? "" : " readonly");
        b.textContent = texte(e);
        if (!mienne) {
          b.disabled = true;
          return b;
        }
        b.addEventListener("click", () => {
          if (b.classList.contains("confirm")) return supprimer(e.id);
          b.classList.add("confirm");
          b.textContent = "Effacer ?";
          setTimeout(() => {
            if (!b.isConnected) return;
            b.classList.remove("confirm");
            b.textContent = texte(e);
          }, 3000);
        });
        return b;
      })
    );
  }

  // ---------- Actions ----------
  async function enregistrerNote() {
    if (!moi) return;
    const btn = $("g-note-btn");
    btn.disabled = true;
    try {
      await api("garde_jours", "?on_conflict=jour,gardien", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({
          jour: isoJour(jour),
          gardien: moi.nom,
          note: $("g-note").value.trim() || null,
          updated_at: new Date().toISOString(),
        }),
      });
      noteModifiee = false;
      animerBouton(btn);
      toast("📝 Note enregistrée");
      await charger();
    } catch (e) {
      afficherErreur("La note n'a pas pu être enregistrée. Réessaie.");
    } finally {
      btn.disabled = false;
    }
  }

  async function ajouter(ligne, msg) {
    if (!moi) return;
    try {
      await api("garde_evenements", "", {
        method: "POST",
        body: JSON.stringify({ quand: new Date().toISOString(), gardien: moi.nom, ...ligne }),
      });
      toast(msg);
      afficherErreur(null);
      await charger();
    } catch (e) {
      afficherErreur(e.status === 409 ? "Un dodo est déjà en cours." : "Impossible d'enregistrer. Vérifie les heures et réessaie.");
      await charger();
    }
  }

  async function basculerDodo() {
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

  // Dodo ajouté après coup : « endormi à 13:00, réveillé à 14:30 » pour le jour affiché
  async function ajouterDodoManuel() {
    const a = $("g-dodo-debut").value;
    const b = $("g-dodo-fin").value;
    if (!a || !b) {
      afficherErreur("Indique l'heure d'endormissement et l'heure de réveil.");
      return;
    }
    const aLe = (hhmm) => {
      const [h, m] = hhmm.split(":").map(Number);
      const d = new Date(jour);
      d.setHours(h, m, 0, 0);
      return d;
    };
    const debut = aLe(a);
    const fin = aLe(b);
    if (fin <= debut) fin.setDate(fin.getDate() + 1); // ex. 23:00 → 01:30
    if (fin > new Date(Date.now() + 5 * 60 * 1000)) {
      afficherErreur("Ce dodo finit dans le futur : vérifie les heures.");
      return;
    }
    await ajouter({ type: "sommeil", quand: debut.toISOString(), fin: fin.toISOString() }, `😴 Dodo de ${fmtMinutes(fin - debut)} ajouté`);
    $("g-dodo-debut").value = "";
    $("g-dodo-fin").value = "";
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

  document.querySelectorAll("#g-garde-choix .chip").forEach((c) =>
    c.addEventListener("click", () => {
      choixParents = c.dataset.garde;
      ecrire("garde-parents", choixParents);
      charger();
    })
  );
  $("g-prev").addEventListener("click", () => changerJour(-1));
  $("g-next").addEventListener("click", () => changerJour(1));
  $("g-note").addEventListener("input", () => {
    noteModifiee = true;
    $("g-note-saved").textContent = "Pense à enregistrer 👇";
  });
  $("g-note-btn").addEventListener("click", enregistrerNote);
  $("g-repas-btn").addEventListener("click", () => {
    const ml = $("g-ml").value ? Number($("g-ml").value) : null;
    ajouter({ type: "repas", ml, lait: $("g-lait").value }, "🍼 Biberon noté");
  });
  document.querySelectorAll("#page-garde [data-couche]").forEach((b) =>
    b.addEventListener("click", () => {
      const c = b.dataset.couche;
      ajouter({ type: "couche", pipi: c !== "caca", caca: c !== "pipi" }, "👶 Couche notée");
    })
  );
  $("g-sleep-btn").addEventListener("click", basculerDodo);
  $("g-dodo-add").addEventListener("click", ajouterDodoManuel);

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
    // Seul le bouton bouge chaque seconde (redessiner les pastilles annulerait un « Effacer ? »)
    if (dodoEnCours) majBoutonDodo();
  }

  enregistrerRubrique({ charger, tick });
})();
