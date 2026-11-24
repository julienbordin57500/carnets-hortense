// Page Sommeil : « il s'endort » démarre le minuteur, « il se réveille » l'arrête
(() => {
  const TABLE = "sommeils";
  const COLONNES = "id,debut,fin,gardien,garde_id";

  let sommeils = []; // dodos qui touchent les dernières 24 h (y compris celui en cours)
  let enCours = null; // dodo sans heure de réveil
  let dernierFini = null; // pour « réveillé depuis »
  let demandeOubli = null; // dodo oublié déjà signalé pendant cette ouverture

  async function charger() {
    if (!estParent()) return; // réservé aux parents (la famille n'y a pas accès)
    try {
      const depuis = encodeURIComponent(ilYa24h());
      sommeils = await api(TABLE, `?select=${COLONNES}&or=(fin.is.null,fin.gte.${depuis})&order=debut.desc`);
      enCours = sommeils.find((s) => !s.fin) || null;
      // Réveil oublié (dodo de plus de 12 h) : on le demande une fois à l'ouverture
      if (enCours && dodoOublie(enCours.debut) && demandeOubli !== enCours.id) {
        demandeOubli = enCours.id;
        setTimeout(() => reglerDodoOublie(enCours).catch(() => afficherErreur("Impossible d'enregistrer. Réessaie.")), 0);
      }
      dernierFini =
        sommeils.filter((s) => s.fin).sort((a, b) => new Date(b.fin) - new Date(a.fin))[0] ||
        (await api(TABLE, `?select=${COLONNES}&fin=not.is.null&order=fin.desc&limit=1`))[0] ||
        null;
      afficherErreur(null);
    } catch (e) {
      afficherErreur("Impossible de charger les données. Vérifie la connexion internet.");
    }
    rendre();
  }

  async function basculer() {
    const btn = $("sleep-btn");
    btn.disabled = true;
    const quand = heureChoisie("sleep-heure");
    try {
      // Dodo lancé il y a plus de 12 h : réveil oublié, on demande l'heure (ou on l'efface)
      if (enCours && dodoOublie(enCours.debut) && !$("sleep-heure").value) {
        await reglerDodoOublie(enCours);
        return;
      }
      if (enCours) {
        if (quand <= new Date(enCours.debut)) {
          afficherErreur("L'heure du réveil doit être après l'heure d'endormissement.");
          return;
        }
        await modifierLigne(TABLE, enCours, { fin: quand.toISOString() }, CHAMPS_GARDE.sommeils);
        toast(`☀️ Bon réveil ! Dodo de ${fmtMinutes(quand - new Date(enCours.debut))}`);
      } else {
        const id = await ajouterLigne(TABLE, { debut: quand.toISOString() });
        await api("biberons", "?reprise_sommeil=is.true", { method: "PATCH", body: JSON.stringify({ reprise_sommeil: false }) }).catch(() => {});
        toast(estLaNuit(quand) ? "🌙 Bonne nuit Hortense !" : "🌙 Bonne sieste Hortense !", annulerAjout(TABLE, id));
      }
      animerBouton(btn);
      $("sleep-heure").value = "";
      await rechargerTout();
    } catch (e) {
      // 409 : un autre téléphone a déjà lancé le dodo
      afficherErreur(e.status === 409 ? "Hortense dort déjà (lancé depuis un autre téléphone)." : "Impossible d'enregistrer. Réessaie.");
      await charger();
    } finally {
      btn.disabled = false;
    }
  }

  async function reglerDodoOublie(s) {
    const r = await demanderReveilOublie(s.debut);
    if (!r) return;
    if (r.effacer) await api(s.garde_id ? "garde_evenements" : TABLE, `?id=eq.${s.garde_id || s.id}`, { method: "DELETE" });
    else await modifierLigne(TABLE, s, { fin: r.fin.toISOString() }, CHAMPS_GARDE.sommeils);
    toast(r.effacer ? "🗑️ Dodo effacé" : `☀️ Réveil noté à ${fmtHeure(r.fin)}`);
    await rechargerTout();
  }

  async function modifier(s) {
    const champs = [{ cle: "debut", label: "Endormie à", type: "time", valeur: hhmm(s.debut) }];
    if (s.fin) champs.push({ cle: "fin", label: "Réveillée à", type: "time", valeur: hhmm(s.fin) });
    const v = await editer("😴 Modifier le dodo", champs);
    if (!v || !v.debut) return;
    const debut = memeJourA(s.debut, v.debut);
    const maj = { debut: debut.toISOString() };
    if (s.fin && v.fin) {
      const [h, m] = v.fin.split(":").map(Number);
      const fin = new Date(debut);
      fin.setHours(h, m, 0, 0);
      if (fin <= debut) fin.setDate(fin.getDate() + 1); // ex. 23:00 → 01:30
      if (fin > new Date(Date.now() + 5 * 60 * 1000)) return afficherErreur("Le réveil ne peut pas être dans le futur.");
      maj.fin = fin.toISOString();
    }
    try {
      await modifierLigne(TABLE, s, maj, CHAMPS_GARDE.sommeils);
      toast("✏️ Dodo modifié");
      afficherErreur(null);
      await charger();
    } catch (e) {
      afficherErreur("Modification impossible : vérifie les heures.");
    }
  }

  // Une note venue de la garde s'efface à la source (et donc aussi chez les grands-parents)
  async function supprimer(id, gardeId) {
    try {
      await api(gardeId ? "garde_evenements" : TABLE, `?id=eq.${gardeId || id}`, { method: "DELETE" });
      toast("Dodo supprimé");
      await charger();
    } catch (e) {
      afficherErreur("Suppression impossible. Réessaie.");
    }
  }

  // Temps dormi à l'intérieur d'une période (les dodos en cours comptent jusqu'à maintenant)
  function dormiDepuis(debutPeriode) {
    const now = Date.now();
    return sommeils.reduce((total, s) => {
      const a = Math.max(new Date(s.debut).getTime(), debutPeriode);
      const b = s.fin ? new Date(s.fin).getTime() : now;
      return total + Math.max(0, b - a);
    }, 0);
  }

  function rendreStats() {
    const debutJour = minuit().getTime();
    const debut24 = Date.now() - DAY_MS;
    const nbJour = sommeils.filter((s) => !s.fin || new Date(s.fin) >= debutJour).length;
    $("sleep-today-total").textContent = fmtMinutes(dormiDepuis(debutJour));
    $("sleep-day-total").textContent = fmtMinutes(dormiDepuis(debut24));
    $("sleep-today-count").textContent = `😴 ${nbJour} dodo${nbJour > 1 ? "s" : ""}`;
    $("sleep-day-count").textContent = `😴 ${sommeils.length} dodo${sommeils.length > 1 ? "s" : ""}`;
  }

  function tick() {
    const el = $("sleep-timer");
    if (enCours) el.textContent = fmtDuree(Date.now() - new Date(enCours.debut).getTime());
    else if (dernierFini) el.textContent = fmtDuree(Date.now() - new Date(dernierFini.fin).getTime());
    else el.textContent = "--:--";
    if (enCours) rendreStats();
  }

  function rendre() {
    document.body.classList.toggle("bebe-dort", !!enCours);
    $("sleep-card").classList.toggle("sleeping", !!enCours);
    if (enCours) {
      $("sleep-label").textContent = "Hortense dort depuis";
      $("sleep-info").textContent = `😴 Endormie à ${fmtHeure(enCours.debut)}${jourSiPasAujourdhui(enCours.debut)}`;
      $("sleep-btn-emoji").textContent = "☀️";
      $("sleep-btn-label").textContent = "Elle se réveille";
    } else {
      $("sleep-label").textContent = "Réveillée depuis";
      $("sleep-info").textContent = dernierFini
        ? `Dernier dodo : ${fmtHeure(dernierFini.debut)} → ${fmtHeure(dernierFini.fin)} (${fmtMinutes(new Date(dernierFini.fin) - new Date(dernierFini.debut))})`
        : "Pas encore de dodo enregistré";
      $("sleep-btn-emoji").textContent = "🌙";
      $("sleep-btn-label").textContent = "Elle s'endort";
    }
    $("sleep-btn").classList.toggle("wake", !!enCours);
    tick();
    rendreStats();

    $("sleep-list").replaceChildren(...avecMoments(sommeils, (x) => x.debut, ligneHistorique));
    $("sleep-empty").hidden = sommeils.length > 0;
    contenuChange();
  }

  function ligneHistorique(s) {
    const li = document.createElement("li");
    const fin = s.fin ? fmtHeure(s.fin) : "en cours";
    const duree = fmtMinutes((s.fin ? new Date(s.fin) : new Date()) - new Date(s.debut));
    li.innerHTML = `
      <span class="h-emoji" aria-hidden="true">${s.fin ? "😴" : "💤"}</span>
      <span class="h-time">${fmtHeure(s.debut)}</span>
      <span class="h-info"><span class="h-type">→ ${fin}</span><span class="h-det">${duree}</span>${parGardien(s)}</span>`;
    li.append(boutonSupprimer(`Supprimer le dodo de ${fmtHeure(s.debut)}`, () => supprimer(s.id, s.garde_id)));
    rendreModifiable(li, () => modifier(s));
    return li;
  }

  $("sleep-btn").addEventListener("click", basculer);

  enregistrerRubrique({ charger, tick });
})();
