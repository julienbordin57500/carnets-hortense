// Petit tuto en 5 étapes pour les grands-parents (affiché à leur première connexion)
(() => {
  const ETAPES = () => [
    {
      emoji: "👋",
      titre: "Bienvenue !",
      texte: "Ce carnet sert à suivre la journée d'Hortense quand vous la gardez. Ça prend 30 secondes à comprendre.",
    },
    {
      emoji: "👵",
      titre: "Votre espace : l'onglet Garde",
      texte: "C'est l'onglet 👵 Garde. C'est ici que vous notez ce qui se passe pendant que vous la gardez. Les parents le voient sur leur téléphone.",
    },
    {
      emoji: "🍼",
      titre: "Un appui quand ça arrive",
      texte: "« + Biberon » pour un repas, « + 💧 » ou « + 💩 » pour une couche. Pour la sieste : « Elle s'endort » puis « Elle se réveille », ou ajoutez-la plus tard avec les heures. Pour effacer une erreur, touchez-la deux fois.",
    },
    {
      emoji: "📝",
      titre: "La note du jour",
      texte: "Écrivez ce que vous avez fait, comment elle était, puis « Enregistrer ma note ». Les parents la liront.",
    },
    {
      emoji: "💊",
      titre: "Un médicament ? Notez-le",
      texte: "Dans l'onglet 🩺 Santé, « + Prise » pour noter un médicament donné (avec l'heure). Vous y trouvez aussi sa fiche santé : allergies, pédiatre… Bonne garde !",
    },
  ];

  let etapes = [];
  let i = 0;

  function rendre() {
    const e = etapes[i];
    $("tuto-emoji").textContent = e.emoji;
    $("tuto-titre").textContent = e.titre;
    $("tuto-texte").textContent = e.texte;
    $("tuto-dots").innerHTML = etapes.map((_, j) => `<span class="${j === i ? "on" : ""}"></span>`).join("");
    $("tuto-suivant").textContent = i === etapes.length - 1 ? "C'est parti !" : "Suivant";
    $("tuto-passer").hidden = i === etapes.length - 1;
    // petite animation à chaque étape
    const box = $("tuto").querySelector(".tuto-box");
    box.classList.remove("pas");
    void box.offsetWidth;
    box.classList.add("pas");
  }

  function ouvrir() {
    // Réservé aux grands-parents (même si on vient de changer de profil)
    if (!profil || estParent() || $("tuto").open) return;
    etapes = ETAPES();
    i = 0;
    rendre();
    $("tuto").showModal();
  }

  $("tuto-suivant").addEventListener("click", () => {
    if (i < etapes.length - 1) {
      i++;
      rendre();
    } else {
      $("tuto").close("fin");
    }
  });
  $("tuto").addEventListener("close", () => ecrire(`tuto-vu:${profil?.nom}`, true));
  $("g-tuto").addEventListener("click", ouvrir);

  function apresConnexion() {
    const famille = profil && !estParent();
    $("g-tuto-box").hidden = !famille;
    // Une seule fois par personne et par téléphone, juste après l'arrivée sur l'appli
    if (famille && !lire(`tuto-vu:${profil.nom}`, false, (v) => v === true) && !$("tuto").open) setTimeout(ouvrir, 900);
  }
  window.addEventListener("connecte", apresConnexion);
  if (profil) apresConnexion(); // déjà connecté avant le chargement de ce fichier
})();
