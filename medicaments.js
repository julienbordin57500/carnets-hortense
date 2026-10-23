// Petite carte « Médicaments » en haut de Santé : dernière prise de chaque médicament + minuteur
(() => {
  const TABLE = "medicaments_prises";
  const JOURS_AFFICHES = 7; // on montre les médicaments donnés ces 7 derniers jours

  let prises = []; // du plus récent au plus ancien

  async function charger() {
    try {
      const depuis = new Date(Date.now() - JOURS_AFFICHES * DAY_MS).toISOString();
      prises = await api(TABLE, `?select=*&pris_le=gte.${encodeURIComponent(depuis)}&order=pris_le.desc&limit=200`);
    } catch (e) {
      afficherErreur("Impossible de charger les médicaments. Vérifie la connexion internet.");
    }
    rendre();
  }

  // Dernière prise de chaque médicament (le nom sans tenir compte des majuscules)
  const dernieres = () => {
    const vus = new Map();
    prises.forEach((p) => {
      const cle = p.nom.trim().toLowerCase();
      if (!vus.has(cle)) vus.set(cle, { ...p, nb24: 0 });
      if (Date.now() - new Date(p.pris_le).getTime() < DAY_MS) vus.get(cle).nb24++;
    });
    return [...vus.values()];
  };

  function rendre() {
    const liste = dernieres();
    $("med-list").replaceChildren(
      ...(liste.length
        ? liste.map((p) => {
            const li = document.createElement("li");
            li.innerHTML = `
              <span class="med-nom">${esc(p.nom)}${p.dose ? ` <span class="med-dose">${esc(p.dose)}</span>` : ""}</span>
              <span class="med-quand">à ${fmtHeure(p.pris_le)}${jourSiPasAujourdhui(p.pris_le)}${p.par ? ` · par ${p.par === "Grands-parents" ? "les grands-parents" : p.par === "Parents" ? "les parents" : esc(p.par)}` : ""}${p.nb24 > 1 ? ` · ${p.nb24}× en 24 h` : ""}</span>
              <span class="med-timer" data-depuis="${p.pris_le}"></span>`;
            li.append(boutonSupprimer(`Supprimer la prise de ${p.nom} de ${fmtHeure(p.pris_le)}`, () => supprimer(p.id)));
            rendreModifiable(li, () => modifier(p));
            return li;
          })
        : [Object.assign(document.createElement("li"), { className: "med-vide", textContent: "Aucune prise ces 7 derniers jours" })])
    );
    tick();

    // Noms déjà utilisés : boutons rapides + suggestions
    const noms = [...new Set(prises.map((p) => p.nom.trim()))].slice(0, 6);
    $("med-noms").replaceChildren(
      ...noms.map((n) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "chip";
        b.textContent = n;
        b.addEventListener("click", () => {
          $("med-nom").value = n;
          const der = prises.find((p) => p.nom.trim() === n);
          if (der?.dose && !$("med-dose").value) $("med-dose").value = der.dose;
        });
        return b;
      })
    );
    $("med-suggest").innerHTML = ["Doliprane", "Paracétamol", "Vitamine D", "Sérum physiologique", ...noms]
      .filter((v, i, a) => a.indexOf(v) === i)
      .map((n) => `<option value="${esc(n)}">`)
      .join("");
    contenuChange();
  }

  function tick() {
    document.querySelectorAll("#med-list .med-timer").forEach((el) => {
      el.textContent = "il y a " + fmtDuree(Date.now() - new Date(el.dataset.depuis).getTime());
    });
  }

  function ouvrir(ouvert) {
    $("med-form").hidden = !ouvert;
    $("med-toggle").setAttribute("aria-expanded", String(ouvert));
    $("med-toggle").textContent = ouvert ? "Fermer" : "+ Prise";
    contenuChange();
  }

  async function ajouter() {
    const nom = $("med-nom").value.trim();
    if (!nom) {
      afficherErreur("Indique le nom du médicament.");
      $("med-nom").focus();
      return;
    }
    const btn = $("med-btn");
    btn.disabled = true;
    try {
      await api(TABLE, "", {
        method: "POST",
        body: JSON.stringify({ nom, dose: $("med-dose").value.trim() || null, pris_le: heureChoisie("med-heure").toISOString(), par: profil?.nom || null }),
      });
      toast(`💊 ${nom} noté`);
      ["med-nom", "med-dose", "med-heure"].forEach((id) => ($(id).value = ""));
      afficherErreur(null);
      ouvrir(false);
      await charger();
    } catch (e) {
      afficherErreur("La prise n'a pas pu être enregistrée. Réessaie.");
    } finally {
      btn.disabled = false;
    }
  }

  async function modifier(p) {
    const v = await editer("💊 Modifier la prise", [
      { cle: "heure", label: "Heure", type: "time", valeur: hhmm(p.pris_le) },
    ]);
    if (!v || !v.heure) return;
    try {
      await api(TABLE, `?id=eq.${p.id}`, { method: "PATCH", body: JSON.stringify({ pris_le: memeJourA(p.pris_le, v.heure).toISOString() }) });
      toast("✏️ Prise modifiée");
      await charger();
    } catch (e) {
      afficherErreur("Modification impossible. Réessaie.");
    }
  }

  async function supprimer(id) {
    try {
      await api(TABLE, `?id=eq.${id}`, { method: "DELETE" });
      toast("Prise supprimée");
      await charger();
    } catch (e) {
      afficherErreur("Suppression impossible. Réessaie.");
    }
  }

  $("med-toggle").addEventListener("click", () => ouvrir($("med-form").hidden));
  $("med-btn").addEventListener("click", ajouter);

  enregistrerRubrique({ charger, tick });
})();
