// Page Santé : rendez-vous, calendrier vaccins/examens, croissance, fiche santé
(() => {
  const RDV_TYPES = {
    pediatre: { emoji: "🩺", nom: "Pédiatre" },
    vaccin: { emoji: "💉", nom: "Vaccin" },
    examen: { emoji: "📋", nom: "Examen" },
    specialiste: { emoji: "👩‍⚕️", nom: "Spécialiste" },
    autre: { emoji: "📌", nom: "Autre" },
  };

  // Repères 2026 (Santé publique France). m = mois, j = jours, a = ans
  const VACCINS = [
    { cle: "v-2m", m: 2, nom: "Hexavalent (DTCaP-Hib-Hépatite B) + pneumocoque", oblig: true },
    { cle: "v-2m-rota", m: 2, nom: "Rotavirus, 1re dose (par la bouche)", oblig: false },
    { cle: "v-3m", m: 3, nom: "Méningocoque B, 1re dose", oblig: true },
    { cle: "v-3m-rota", m: 3, nom: "Rotavirus, 2e dose (3e à 4 mois selon le vaccin)", oblig: false },
    { cle: "v-4m", m: 4, nom: "Hexavalent + pneumocoque, 2e dose", oblig: true },
    { cle: "v-5m", m: 5, nom: "Méningocoque B, 2e dose", oblig: true },
    { cle: "v-6m", m: 6, nom: "Méningocoque ACWY, 1re dose", oblig: true },
    { cle: "v-11m", m: 11, nom: "Rappel hexavalent + pneumocoque", oblig: true },
    { cle: "v-12m", m: 12, nom: "ROR 1re dose + rappels méningocoques ACWY et B", oblig: true },
    { cle: "v-16m", m: 16, nom: "ROR 2e dose (entre 16 et 18 mois)", oblig: true },
  ];
  const EXAMENS = [
    { cle: "e-8j", j: 8, nom: "Examen des 8 premiers jours (certificat de santé)" },
    { cle: "e-2s", j: 14, nom: "Examen de la 2e semaine" },
    ...[1, 2, 3, 4, 5, 6].map((m) => ({ cle: `e-${m}m`, m, nom: `Examen du ${m === 1 ? "1er" : m + "e"} mois` })),
    { cle: "e-9m", m: 9, nom: "Examen du 9e mois (certificat de santé)" },
    { cle: "e-12m", m: 12, nom: "Examen du 12e mois" },
    { cle: "e-13m", m: 13, nom: "Examen du 13e mois" },
    { cle: "e-16m", m: 16, nom: "Examen entre 16 et 18 mois" },
    { cle: "e-24m", m: 24, nom: "Examen du 24e mois (certificat de santé)" },
  ];
  const EXAMENS_TARD = [
    ...[3, 4, 5, 6].map((a) => ({ cle: `e-${a}a`, m: a * 12, nom: `Examen des ${a} ans` })),
    { cle: "e-8a", m: 96, nom: "Examen entre 8 et 9 ans" },
    { cle: "e-11a", m: 132, nom: "Examen entre 11 et 13 ans" },
    { cle: "e-15a", m: 180, nom: "Examen entre 15 et 16 ans" },
  ];
  // Partagé avec la cloche (rappels doux de vaccins et d'examens)
  window.calendrierHortense = { VACCINS, EXAMENS };

  const FICHE = [
    "date_naissance", "heure_naissance", "poids_naissance_g", "taille_naissance_cm", "pc_naissance_cm",
    "groupe_sanguin", "allergies", "traitements", "pediatre_nom", "pediatre_tel", "pediatre_adresse", "notes",
  ];

  let profil = {};
  let rdvs = [];
  let mesures = [];
  let faits = {}; // cle -> date
  let typeRdv = "pediatre";

  const fmtDate = (d, opts = { weekday: "short", day: "numeric", month: "short" }) =>
    new Date(d).toLocaleDateString("fr-FR", opts);
  const nombre = (v) => (v === null || v === undefined || v === "" ? null : Number(String(v).replace(",", ".")));
  const fr = (n, dec) => Number(n).toLocaleString("fr-FR", { maximumFractionDigits: dec });
  const aujourdhuiISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  // Date locale (sans décalage de fuseau) à partir de « 2026-08-12 »
  const dateLocale = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  };

  async function charger() {
    try {
      // La famille ne voit que la fiche santé (et les médicaments, gérés à part)
      const parent = estParent();
      const [p, r, m, s] = await Promise.all([
        api("sante_profil", "?select=*&id=eq.1"),
        parent ? api("rendez_vous", "?select=*&order=quand.asc") : [],
        parent ? api("mesures", "?select=*&order=mesure_le.desc,id.desc") : [],
        parent ? api("suivi_calendrier", "?select=*") : [],
      ]);
      profil = p[0] || {};
      rdvs = r;
      mesures = m;
      faits = Object.fromEntries(s.map((x) => [x.cle, x.fait_le]));
    } catch (e) {
      afficherErreur("Impossible de charger la page Santé. Vérifie la connexion internet.");
    }
    rendre();
  }

  // ---------- Âge ----------
  function age() {
    if (!profil.date_naissance) return "";
    const n = dateLocale(profil.date_naissance);
    const now = new Date();
    let mois = (now.getFullYear() - n.getFullYear()) * 12 + now.getMonth() - n.getMonth();
    if (now.getDate() < n.getDate()) mois--;
    if (mois < 0) return "";
    const anniv = new Date(n);
    anniv.setMonth(n.getMonth() + mois);
    const jours = Math.floor((now - anniv) / DAY_MS);
    if (mois === 0) {
      const total = Math.floor((now - n) / DAY_MS);
      const sem = Math.floor(total / 7);
      return `Hortense a ${total} jour${total > 1 ? "s" : ""}` + (sem ? ` (${sem} sem.)` : "");
    }
    if (mois < 24) return `Hortense a ${mois} mois` + (jours ? ` et ${jours} jour${jours > 1 ? "s" : ""}` : "");
    const ans = Math.floor(mois / 12);
    return `Hortense a ${ans} ans` + (mois % 12 ? ` et ${mois % 12} mois` : "");
  }

  function echeance(item) {
    if (!profil.date_naissance) return null;
    const d = dateLocale(profil.date_naissance);
    if (item.j) d.setDate(d.getDate() + item.j);
    else d.setMonth(d.getMonth() + item.m);
    return d;
  }

  // ---------- Affichage ----------
  function rendre() {
    $("sante-age").textContent = age();
    rendreProchain();
    rendreRdvs();
    rendreCalendrier();
    rendreMesures();
    rendreFiche();
    contenuChange();
  }

  function dansCombien(d) {
    const j = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / DAY_MS);
    if (j === 0) return "Aujourd'hui";
    if (j === 1) return "Demain";
    if (j < 0) return `Il y a ${-j} jour${j < -1 ? "s" : ""}`;
    if (j < 14) return `Dans ${j} jours`;
    if (j < 60) return `Dans ${Math.round(j / 7)} semaines`;
    return `Dans ${Math.round(j / 30)} mois`;
  }

  const aVenir = () => rdvs.filter((r) => !r.fait && new Date(r.quand) >= new Date(Date.now() - 2 * 60 * 60 * 1000));

  function rendreProchain() {
    const p = aVenir()[0];
    if (!p) {
      $("rdv-next-when").textContent = "Aucun rendez-vous prévu";
      $("rdv-next-info").textContent = "Ajoute-le juste en dessous 👇";
      return;
    }
    const t = RDV_TYPES[p.type] || RDV_TYPES.autre;
    $("rdv-next-when").textContent = dansCombien(p.quand);
    $("rdv-next-info").textContent =
      `${t.emoji} ${p.titre || t.nom} · ${fmtDate(p.quand, { weekday: "long", day: "numeric", month: "long" })} à ${fmtHeure(p.quand)}` +
      (p.lieu ? ` · ${p.lieu}` : "");
  }

  function ligneRdv(r, passe) {
    const t = RDV_TYPES[r.type] || RDV_TYPES.autre;
    const li = document.createElement("li");
    li.className = r.fait ? "fait" : "";
    li.innerHTML = `
      <span class="h-emoji" aria-hidden="true">${t.emoji}</span>
      <span class="h-info">
        <span class="h-type">${esc(r.titre || t.nom)}</span>
        <span class="h-det">${fmtDate(r.quand)} · ${fmtHeure(r.quand)}${r.lieu ? " · " + esc(r.lieu) : ""}</span>
        ${r.notes ? `<span class="h-note">📝 ${esc(r.notes)}</span>` : ""}
      </span>`;
    if (passe && !r.fait) {
      const ok = document.createElement("button");
      ok.type = "button";
      ok.className = "del ok";
      ok.textContent = "✓";
      ok.setAttribute("aria-label", "Marquer comme fait");
      ok.addEventListener("click", () => majRdv(r.id, { fait: true }));
      li.append(ok);
    }
    li.append(boutonSupprimer(`Supprimer le rendez-vous du ${fmtDate(r.quand)}`, () => supprimerRdv(r.id)));
    return li;
  }

  function rendreRdvs() {
    const futurs = aVenir();
    const ids = new Set(futurs.map((r) => r.id));
    const passes = rdvs.filter((r) => !ids.has(r.id)).reverse();
    $("rdv-list").replaceChildren(...futurs.map((r) => ligneRdv(r, false)));
    $("rdv-empty").hidden = futurs.length > 0;
    $("rdv-past").replaceChildren(...passes.map((r) => ligneRdv(r, true)));
    $("rdv-past-box").hidden = passes.length === 0;
  }

  function ligneCalendrier(item, vaccin) {
    const li = document.createElement("li");
    const d = echeance(item);
    const fait = faits[item.cle];
    li.className = fait ? "fait" : "";
    const tag = vaccin ? `<span class="tag ${item.oblig ? "oblig" : "reco"}">${item.oblig ? "obligatoire" : "recommandé"}</span>` : "";
    let quand = "";
    if (fait) quand = `✅ fait le ${fmtDate(dateLocale(fait), { day: "numeric", month: "short", year: "numeric" })}`;
    else if (d) {
      const retard = d < new Date(Date.now() - 30 * DAY_MS);
      quand = `vers le ${fmtDate(d, { day: "numeric", month: "short", year: "numeric" })}` + (retard ? ` <span class="tag late">à vérifier</span>` : ` · ${dansCombien(d).toLowerCase()}`);
    }
    const age = item.j ? `${item.j} j` : item.m < 24 ? `${item.m} mois` : `${Math.floor(item.m / 12)} ans`;
    li.innerHTML = `
      <label class="check">
        <input type="checkbox" ${fait ? "checked" : ""} aria-label="${esc(item.nom)} fait">
        <span class="box" aria-hidden="true"></span>
      </label>
      <span class="cal-age">${age}</span>
      <span class="h-info"><span class="h-type">${esc(item.nom)} ${tag}</span>${quand ? `<span class="h-det">${quand}</span>` : ""}</span>`;
    li.querySelector("input").addEventListener("change", (e) => cocher(item.cle, e.target.checked));
    if (!fait) {
      const plan = document.createElement("button");
      plan.type = "button";
      plan.className = "del plan";
      plan.textContent = "📅";
      plan.setAttribute("aria-label", "Prévoir un rendez-vous");
      plan.addEventListener("click", () => planifier(item, vaccin, d));
      li.append(plan);
    }
    return li;
  }

  function rendreCalendrier() {
    $("cal-hint").hidden = !!profil.date_naissance;
    const prochain = [...VACCINS, ...EXAMENS, ...EXAMENS_TARD]
      .filter((i) => !faits[i.cle] && echeance(i))
      .sort((a, b) => echeance(a) - echeance(b))[0];
    $("cal-next").hidden = !prochain;
    if (prochain) {
      const d = echeance(prochain);
      $("cal-next").innerHTML = `${prochain.cle.startsWith("v") ? "💉" : "📋"} <strong>À venir :</strong> ${esc(prochain.nom)}, vers le ${fmtDate(d, { day: "numeric", month: "long" })}`;
    }
    $("cal-vaccins").replaceChildren(...VACCINS.map((v) => ligneCalendrier(v, true)));
    $("cal-examens").replaceChildren(...EXAMENS.map((e) => ligneCalendrier(e, false)));
    $("cal-examens-tard").replaceChildren(...EXAMENS_TARD.map((e) => ligneCalendrier(e, false)));
  }

  function rendreMesures() {
    const der = (cle) => mesures.find((m) => m[cle] !== null);
    const bloc = (titre, m, cle, unite, dec, naissance) => {
      if (!m && naissance == null) return "";
      const v = m ? m[cle] : naissance;
      const quand = m ? fmtDate(dateLocale(m.mesure_le), { day: "numeric", month: "short" }) : "naissance";
      return `<div class="g-item"><span class="g-label">${titre}</span><span class="g-val">${fr(v, dec)} ${unite}</span><span class="g-when">${quand}</span></div>`;
    };
    const pn = profil.poids_naissance_g ? profil.poids_naissance_g / 1000 : null;
    $("growth-last").innerHTML =
      bloc("⚖️ Poids", der("poids_kg"), "poids_kg", "kg", 3, pn) +
      bloc("📏 Taille", der("taille_cm"), "taille_cm", "cm", 1, profil.taille_naissance_cm) +
      bloc("🧠 Tour de tête", der("pc_cm"), "pc_cm", "cm", 1, profil.pc_naissance_cm) ||
      `<p class="hint">Aucune mesure pour l'instant. Note-les après chaque visite chez le pédiatre.</p>`;
    $("m-list").replaceChildren(
      ...mesures.map((m) => {
        const li = document.createElement("li");
        const parts = [
          m.poids_kg !== null && `${fr(m.poids_kg, 3)} kg`,
          m.taille_cm !== null && `${fr(m.taille_cm, 1)} cm`,
          m.pc_cm !== null && `TT ${fr(m.pc_cm, 1)} cm`,
        ].filter(Boolean);
        li.innerHTML = `<span class="h-time">${fmtDate(dateLocale(m.mesure_le), { day: "numeric", month: "short" })}</span><span class="h-info"><span class="h-det">${parts.join(" · ")}</span></span>`;
        li.append(boutonSupprimer("Supprimer la mesure", () => supprimer("mesures", m.id, "Mesure supprimée")));
        return li;
      })
    );
  }

  function rendreFiche() {
    const p = profil;
    const lignes = [];
    if (p.date_naissance) {
      lignes.push(`🎂 Née le ${fmtDate(dateLocale(p.date_naissance), { day: "numeric", month: "long", year: "numeric" })}${p.heure_naissance ? " à " + p.heure_naissance.slice(0, 5).replace(":", "h") : ""}`);
    }
    const naiss = [
      p.poids_naissance_g && `${fr(p.poids_naissance_g / 1000, 3)} kg`,
      p.taille_naissance_cm && `${fr(p.taille_naissance_cm, 1)} cm`,
      p.pc_naissance_cm && `TT ${fr(p.pc_naissance_cm, 1)} cm`,
    ].filter(Boolean);
    if (naiss.length) lignes.push(`👶 À la naissance : ${naiss.join(" · ")}`);
    if (p.groupe_sanguin) lignes.push(`🩸 Groupe sanguin : ${esc(p.groupe_sanguin)}`);
    lignes.push(`⚠️ Allergies : ${p.allergies ? esc(p.allergies) : "aucune connue"}`);
    if (p.traitements) lignes.push(`💊 Traitements : ${esc(p.traitements)}`);
    if (p.pediatre_nom || p.pediatre_tel) {
      const tel = p.pediatre_tel ? ` · <a href="tel:${esc(p.pediatre_tel.replace(/[^\d+]/g, ""))}">📞 ${esc(p.pediatre_tel)}</a>` : "";
      lignes.push(`👩‍⚕️ ${esc(p.pediatre_nom || "Pédiatre")}${tel}`);
    }
    if (p.pediatre_adresse) lignes.push(`📍 ${esc(p.pediatre_adresse)}`);
    if (p.notes) lignes.push(`📝 ${esc(p.notes)}`);
    $("fiche-resume").innerHTML = lignes.map((l) => `<li>${l}</li>`).join("");

    // Pré-remplit le formulaire (sauf s'il est ouvert et en cours de saisie)
    if (!$("fiche-box").open) FICHE.forEach((k) => ($(`f-${k}`).value = p[k] == null ? "" : String(p[k]).slice(0, k === "heure_naissance" ? 5 : undefined)));
  }

  // ---------- Actions ----------
  async function ajouterRdv() {
    const date = $("rdv-date").value;
    if (!date) {
      afficherErreur("Choisis la date du rendez-vous.");
      $("rdv-date").focus();
      return;
    }
    const [h, m] = ($("rdv-heure").value || "09:00").split(":").map(Number);
    const quand = dateLocale(date);
    quand.setHours(h, m, 0, 0);
    const btn = $("rdv-btn");
    btn.disabled = true;
    try {
      await api("rendez_vous", "", {
        method: "POST",
        body: JSON.stringify({
          quand: quand.toISOString(),
          type: typeRdv,
          titre: $("rdv-titre").value.trim() || null,
          notes: $("rdv-notes").value.trim() || null,
        }),
      });
      animerBouton(btn);
      toast("📅 Rendez-vous ajouté !");
      ["rdv-date", "rdv-heure", "rdv-titre", "rdv-notes"].forEach((id) => ($(id).value = ""));
      afficherErreur(null);
      await charger();
    } catch (e) {
      afficherErreur("Le rendez-vous n'a pas pu être enregistré. Réessaie.");
    } finally {
      btn.disabled = false;
    }
  }

  async function majRdv(id, champs) {
    try {
      await api("rendez_vous", `?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(champs) });
      await charger();
    } catch (e) {
      afficherErreur("Modification impossible. Réessaie.");
    }
  }

  async function supprimer(table, id, msg) {
    try {
      await api(table, `?id=eq.${id}`, { method: "DELETE" });
      toast(msg);
      await charger();
    } catch (e) {
      afficherErreur("Suppression impossible. Réessaie.");
    }
  }
  const supprimerRdv = (id) => supprimer("rendez_vous", id, "Rendez-vous supprimé");

  async function cocher(cle, fait) {
    try {
      if (fait) {
        if (cle.startsWith("v-")) window.dispatchEvent(new CustomEvent("vaccin-fait", { detail: cle }));
        await api("suivi_calendrier", "", {
          method: "POST",
          headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
          body: JSON.stringify({ cle, fait_le: aujourdhuiISO() }),
        });
      } else {
        await api("suivi_calendrier", `?cle=eq.${encodeURIComponent(cle)}`, { method: "DELETE" });
      }
      await charger();
    } catch (e) {
      afficherErreur("Impossible d'enregistrer. Réessaie.");
      await charger();
    }
  }

  // Le bouton 📅 d'un vaccin ou examen pré-remplit le formulaire de rendez-vous
  function planifier(item, vaccin, d) {
    typeRdv = vaccin ? "vaccin" : "examen";
    rendreTypes();
    $("rdv-titre").value = item.nom.slice(0, 120);
    if (d && d > new Date()) $("rdv-date").value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    $("rdv-form").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function ajouterMesure() {
    const ligne = {
      mesure_le: $("m-date").value || aujourdhuiISO(),
      poids_kg: nombre($("m-poids").value),
      taille_cm: nombre($("m-taille").value),
      pc_cm: nombre($("m-pc").value),
    };
    if (ligne.poids_kg === null && ligne.taille_cm === null && ligne.pc_cm === null) {
      afficherErreur("Entre au moins le poids, la taille ou le tour de tête.");
      return;
    }
    // Poids saisi en grammes par erreur (ex. 4250) : on convertit
    if (ligne.poids_kg > 40) ligne.poids_kg = ligne.poids_kg / 1000;
    const btn = $("m-btn");
    btn.disabled = true;
    try {
      await api("mesures", "", { method: "POST", body: JSON.stringify(ligne) });
      animerBouton(btn);
      toast("📏 Mesure enregistrée");
      ["m-date", "m-poids", "m-taille", "m-pc"].forEach((id) => ($(id).value = ""));
      afficherErreur(null);
      await charger();
    } catch (e) {
      afficherErreur("Mesure refusée : vérifie les chiffres (poids en kg, taille et tour de tête en cm).");
    } finally {
      btn.disabled = false;
    }
  }

  async function enregistrerFiche() {
    const champs = {};
    FICHE.forEach((k) => {
      const v = $(`f-${k}`).value.trim();
      champs[k] = v === "" ? null : v;
    });
    ["poids_naissance_g", "taille_naissance_cm", "pc_naissance_cm"].forEach((k) => (champs[k] = nombre(champs[k])));
    if (champs.poids_naissance_g !== null && champs.poids_naissance_g < 20) champs.poids_naissance_g = Math.round(champs.poids_naissance_g * 1000); // saisi en kg
    champs.updated_at = new Date().toISOString();
    const btn = $("f-btn");
    btn.disabled = true;
    try {
      await api("sante_profil", "?id=eq.1", { method: "PATCH", body: JSON.stringify(champs) });
      animerBouton(btn);
      toast("💾 Fiche enregistrée");
      $("fiche-box").open = false;
      afficherErreur(null);
      await charger();
    } catch (e) {
      afficherErreur("La fiche n'a pas pu être enregistrée : vérifie les chiffres.");
    } finally {
      btn.disabled = false;
    }
  }

  let rendreTypes;
  rendreTypes = rendreChips(
    "chips-rdv",
    Object.keys(RDV_TYPES),
    () => typeRdv,
    (v) => (typeRdv = v),
    (v) => `${RDV_TYPES[v].emoji} ${RDV_TYPES[v].nom}`,
    false
  );
  $("rdv-btn").addEventListener("click", ajouterRdv);
  $("m-btn").addEventListener("click", ajouterMesure);
  $("f-btn").addEventListener("click", enregistrerFiche);
  $("cal-box").open = lire("cal-ouvert", false, (v) => typeof v === "boolean");
  $("cal-box").addEventListener("toggle", () => ecrire("cal-ouvert", $("cal-box").open));
  document.querySelectorAll("#page-sante details").forEach((d) => d.addEventListener("toggle", contenuChange));

  // Le décompte « dans X jours » se met à jour toutes les minutes avec charger()
  enregistrerRubrique({ charger });
})();
