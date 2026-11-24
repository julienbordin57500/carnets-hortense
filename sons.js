// 🎵 Sons pour s'endormir : de vrais enregistrements libres de droits (Wikimedia Commons),
// rangés dans le dossier sons/ (1 à 5 Mo chacun). Un son n'est téléchargé que la
// première fois qu'on l'écoute, puis il reste sur le téléphone (marche ensuite sans réseau).
// On passe par un lecteur audio classique : le son continue écran verrouillé et même en mode silencieux.
(() => {
  const VOLUME = 0.7; // sur iPhone, le volume se règle seulement avec les boutons du téléphone
  const V_SONS = 2; // à augmenter si on remplace un fichier du dossier sons/

  // Ambiances = boucles sans couture ; berceuses = 2 à 4 min, rejouées tant que la minuterie court
  const SONS = [
    { id: "souffle", emoji: "🌬️", nom: "Bruit blanc doux", sous: "souffle régulier, comme un ventilateur", fichier: "souffle" },
    { id: "grave", emoji: "🌀", nom: "Bruit grave", sous: "profond et enveloppant", fichier: "bruit-grave" },
    { id: "pluie", emoji: "🌧️", nom: "Pluie douce", sous: "sur les feuilles", fichier: "pluie" },
    { id: "vagues", emoji: "🌊", nom: "Vagues", sous: "plage, mer calme", fichier: "vagues" },
    { id: "harpes", emoji: "🪽", nom: "Canon de Pachelbel", sous: "deux harpes · 5 min 30", fichier: "canon-harpes" },
    { id: "nenuphar", emoji: "🪷", nom: "Nénuphar", sous: "piano et violoncelles · 2 min", fichier: "nenuphar-piano" },
    { id: "bach", emoji: "🎹", nom: "Prélude de Bach", sous: "piano doux · 3 min", fichier: "bach-prelude" },
    { id: "lamantins", emoji: "🌙", nom: "Musique pour dormir", sous: "piano et nappes · 10 min", fichier: "lamantins" },
  ];
  const RAPIDES = [15, 30, 60];
  const MIN_DUREE = 5;
  const MAX_DUREE = 480;

  const lecteur = new Audio();
  lecteur.loop = true;
  lecteur.volume = VOLUME; // pris en compte sur ordinateur ; sur iPhone, boutons du téléphone
  let enCours = null; // id du son qui joue
  let adresse = null;
  let finPrevue = 0;
  // Durée en minutes (0 = sans arrêt)
  let duree = lire("sons-duree", 30, (v) => Number.isInteger(v) && (v === 0 || (v >= MIN_DUREE && v <= MAX_DUREE)));

  function arreter() {
    lecteur.pause();
    lecteur.removeAttribute("src");
    if (adresse) URL.revokeObjectURL(adresse); // libère la mémoire
    adresse = null;
    enCours = null;
    finPrevue = 0;
    rendre();
  }

  async function jouer(son) {
    if (enCours === son.id) return arreter();
    arreter();
    enCours = son.id;
    rendre();
    // On laisse l'écran se redessiner avant de fabriquer le son (une petite seconde)
    let blob;
    try {
      // Passe par la mémoire du téléphone (sw.js) : téléchargé une seule fois
      const rep = await fetch(`sons/${son.fichier}.m4a?v=${V_SONS}`);
      if (!rep.ok) throw new Error(rep.status);
      blob = await rep.blob();
    } catch (e) {
      if (enCours === son.id) arreter();
      toast("Ce son n'est pas encore sur le téléphone : il faut du réseau la première fois.");
      return;
    }
    if (enCours !== son.id) return; // on a touché un autre son pendant le chargement
    adresse = URL.createObjectURL(new Blob([blob], { type: "audio/mp4" }));
    lecteur.src = adresse;
    finPrevue = duree ? Date.now() + duree * 60000 : 0;
    try {
      await lecteur.play();
    } catch (e) {
      arreter();
      toast("Le son n'a pas pu démarrer. Réessaie.");
      return;
    }
    if ("mediaSession" in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: son.nom, artist: "Les Carnets d'Hortense" });
    rendre();
  }

  // Minuterie : vérifiée pendant la lecture (marche aussi écran verrouillé)
  const verifierFin = () => {
    if (finPrevue && Date.now() >= finPrevue) arreter();
    else if (finPrevue) majReste();
  };
  lecteur.addEventListener("timeupdate", verifierFin);
  document.addEventListener("visibilitychange", verifierFin);

  function choisirDuree(d) {
    duree = d;
    ecrire("sons-duree", d);
    if (enCours) finPrevue = d ? Date.now() + d * 60000 : 0;
    rendre();
  }

  const fmtDureeMin = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${pad(m % 60)}` : ""}`);

  function majReste() {
    const el = $("sons-reste");
    if (!enCours) return (el.textContent = "");
    if (!finPrevue) return (el.textContent = "Joue sans arrêt");
    const min = Math.max(1, Math.ceil((finPrevue - Date.now()) / 60000));
    el.textContent = `S'arrête dans ${fmtDureeMin(min)}`;
  }

  // ---------- Fenêtre ----------
  function rendre() {
    $("sons-svg").classList.toggle("joue", !!enCours);
    $("sons-liste").replaceChildren(
      ...SONS.map((s) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "son-tuile" + (enCours === s.id ? " joue" : "");
        b.setAttribute("aria-pressed", String(enCours === s.id));
        b.innerHTML = `<span class="son-emoji" aria-hidden="true">${s.emoji}</span>
          <span class="son-nom">${s.nom}</span>
          <span class="son-sous">${enCours === s.id ? (adresse ? "▶ en cours · toucher pour arrêter" : "⏳ chargement…") : s.sous}</span>`;
        b.addEventListener("click", () => jouer(s));
        return b;
      })
    );
    $("sons-durees").replaceChildren(
      ...[...RAPIDES, 0].map((d) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "chip";
        b.setAttribute("role", "radio");
        b.setAttribute("aria-checked", String(d === duree));
        b.textContent = d ? fmtDureeMin(d) : "Sans arrêt";
        b.addEventListener("click", () => choisirDuree(d));
        return b;
      })
    );
    // Durée au choix : − / + de 5 en 5 minutes
    const perso = duree && !RAPIDES.includes(duree);
    $("sons-perso").classList.toggle("on", !!perso);
    $("sons-perso-val").textContent = fmtDureeMin(duree || 45);
    $("sons-stop").hidden = !enCours;
    majReste();
  }
  const pas = (sens) => {
    const base = duree || 45;
    const pasMin = base >= 120 ? 15 : 5;
    choisirDuree(Math.min(MAX_DUREE, Math.max(MIN_DUREE, Math.round(base / pasMin) * pasMin + sens * pasMin)));
  };
  $("sons-moins").addEventListener("click", () => pas(-1));
  $("sons-plus").addEventListener("click", () => pas(1));
  $("sons-perso-val").addEventListener("click", () => choisirDuree(duree || 45));

  const ouvrir = () => {
    rendre();
    $("sons").showModal();
  };
  $("sons-svg").addEventListener("click", ouvrir);
  $("sons-svg").addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      ouvrir();
    }
  });
  $("sons-stop").addEventListener("click", arreter);
  window.addEventListener("connecte", () => $("sons-svg").removeAttribute("hidden"));
  if (typeof profil !== "undefined" && profil) $("sons-svg").removeAttribute("hidden");
})();
