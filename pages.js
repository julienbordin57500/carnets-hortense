// Pages côte à côte : on glisse du doigt (ou on touche un onglet) pour passer de l'une à l'autre.
// Les parents ont les 5 pages ; les grands-parents seulement Santé (réduite) et Garde.
(() => {
  const conteneur = $("pages");
  const toutesPages = [...conteneur.querySelectorAll(".page")];
  const tousOnglets = [...document.querySelectorAll(".tab")];
  const PAGES_FAMILLE = ["page-sante", "page-garde"];

  const pages = () => toutesPages.filter((p) => !p.hidden);
  const ongletDe = (page) => tousOnglets[toutesPages.indexOf(page)];
  let actuelle = 0; // position parmi les pages visibles

  // Le conteneur prend la hauteur de la page affichée (sinon il garde celle de la plus longue)
  function ajusterHauteur() {
    const p = pages()[actuelle];
    if (p) conteneur.style.height = p.offsetHeight + "px";
  }

  function surligner(i) {
    const p = pages()[i];
    tousOnglets.forEach((o) => o.setAttribute("aria-selected", String(o === ongletDe(p))));
    document.body.dataset.page = String(toutesPages.indexOf(p));
  }

  function marquer(i) {
    actuelle = Math.max(0, Math.min(i, pages().length - 1));
    surligner(actuelle);
    ecrire("page-id", pages()[actuelle]?.id);
    ajusterHauteur();
  }

  // La hauteur ne change qu'une fois arrivé : la changer pendant le glissement
  // ferait revenir le navigateur sur la page de départ
  function aller(i, smooth = true) {
    surligner(i);
    conteneur.scrollTo({ left: i * conteneur.clientWidth, behavior: smooth ? "smooth" : "auto" });
    if (!smooth) marquer(i);
  }

  let attente;
  conteneur.addEventListener("scroll", () => {
    clearTimeout(attente);
    attente = setTimeout(() => marquer(Math.round(conteneur.scrollLeft / conteneur.clientWidth)), 60);
  });

  tousOnglets.forEach((o, j) =>
    o.addEventListener("click", () => {
      const i = pages().indexOf(toutesPages[j]);
      if (i >= 0) aller(i);
    })
  );
  window.addEventListener("contenu-change", ajusterHauteur);
  window.addEventListener("resize", () => aller(actuelle, false));
  if ("ResizeObserver" in window) {
    const ro = new ResizeObserver(ajusterHauteur);
    toutesPages.forEach((p) => ro.observe(p));
  }

  // Montre seulement les pages autorisées, puis va sur la page retenue (ou celle par défaut)
  function appliquerProfil(premiere) {
    const parent = estParent();
    toutesPages.forEach((p, j) => {
      const visible = parent || PAGES_FAMILLE.includes(p.id);
      p.hidden = !visible;
      tousOnglets[j].hidden = !visible;
    });
    document.querySelector(".tabs").dataset.nb = String(pages().length);
    const memo = lire("page-id", null, (v) => typeof v === "string");
    let i = pages().findIndex((p) => p.id === memo);
    if (premiere || i < 0) i = parent ? 0 : pages().findIndex((p) => p.id === "page-garde");
    requestAnimationFrame(() => aller(Math.max(0, i), false));
  }
  window.addEventListener("connecte", (e) => appliquerProfil(e.detail?.premiere));
  if (profil) appliquerProfil(false);

  demarrerRafraichissement();
})();

// Appli disponible hors ligne (voir sw.js)
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
