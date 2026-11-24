// 🎁 « Quoi de neuf ? » : la liste des nouveautés, montrée une seule fois par téléphone aux parents
// (après la mise à jour qui a rattrapé le carnet de Noah). Pour une prochaine fournée :
// changer VU et la liste NOUVEAUTES, la fenêtre réapparaîtra une fois.
(() => {
  const VU = "nouveautes-vu:v12";
  const NOUVEAUTES = [
    ["🎵", "Sons pour l'endormir", "Bouton 🎵 en haut : bruit blanc, pluie, vagues et berceuses, avec minuterie. Marche aussi sans réseau."],
    ["✅", "C'est bien noté", "Une coche verte (et une petite vibration sur Android) quand on note quelque chose, et un bouton « Annuler » pendant 5 secondes."],
    ["⚠️", "Fini les doublons", "Si on note deux fois la même chose en moins de 5 minutes, l'appli demande si c'est bien un deuxième."],
    ["🍼", "Prochain repas", "Sous le chrono : « Prochain repas vers… », calculé sur son rythme. La quantité de ml reprend celle du dernier biberon."],
    ["💩", "Couches plus précises", "Couleur et consistance du caca (d'après le carnet de santé), et « Juste une trace »."],
    ["🌙", "Dodo oublié", "Si un dodo dure plus de 12 h, l'appli demande l'heure du réveil : les stats ne sont plus faussées."],
    ["👵", "Garde plus simple", "Les grands-parents ont 3 gros boutons. Vous pouvez réagir avec un émoji à ce qu'ils notent, ils voient que vous l'avez lu, et vous pouvez effacer un doublon."],
    ["📊", "Récap du mois", "Dans la cloche 🔔 : plus complet (plus gros biberon, temps entre deux repas, siestes, prise de poids…)."],
    ["✏️", "Tout se corrige", "Touchez une ligne ou un rendez-vous pour changer l'heure ou les détails."],
    ["🌸", "Joli décor", "Le ciel suit l'heure (aube, coucher de soleil), mode nuit tout doux de 22 h à 6 h avec des lucioles, et l'ourson cligne des yeux et bâille le soir."],
  ];

  const dejaVu = () => lire(VU, false, (v) => v === true);
  function ouvrir() {
    if (!profil || !estParent() || dejaVu() || $("tuto").open || $("nouveautes").open) return;
    $("nouveautes-liste").innerHTML = NOUVEAUTES.map(
      ([emoji, titre, texte]) => `<li><span class="nv-emoji" aria-hidden="true">${emoji}</span><span><strong>${titre}</strong><br>${texte}</span></li>`
    ).join("");
    $("nouveautes").showModal();
  }
  $("nouveautes").addEventListener("close", () => ecrire(VU, true));

  function apresConnexion() {
    if (profil && estParent() && !dejaVu()) setTimeout(ouvrir, 1200);
  }
  window.addEventListener("connecte", apresConnexion);
  if (profil) apresConnexion(); // déjà connecté avant le chargement de ce fichier
})();
