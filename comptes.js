// 🔐 Page « comptes » (parents) : changer le mot de passe du compte Parents ou du compte Grands-parents
(() => {
  let compteChoisi = null;
  const NOMS = { parents: "👨‍👩‍👧 Parents", famille: "👵 Grands-parents" };

  // Menu « réglages » : chaque choix ferme d'abord le menu
  $("reglages-ouvrir").addEventListener("click", () => $("reglages").showModal());
  $("reglages").addEventListener(
    "click",
    (e) => {
      if (e.target.closest(".reglages-liste button")) $("reglages").close();
    },
    true
  );

  window.addEventListener("connecte", () => ($("comptes-ouvrir").hidden = !estParent()));
  if (profil) $("comptes-ouvrir").hidden = !estParent();

  $("comptes-ouvrir").addEventListener("click", () => {
    compteChoisi = null;
    $("compte-mdp").hidden = true;
    $("compte-message").textContent = CONFIG.demo
      ? "🧸 Mode découverte : les mots de passe se régleront quand la vraie base des parents sera branchée."
      : "";
    $("comptes").showModal();
  });

  document.querySelectorAll("#comptes [data-compte]").forEach((b) =>
    b.addEventListener("click", () => {
      compteChoisi = b.dataset.compte;
      $("compte-mdp-titre").textContent = `Nouveau mot de passe pour ${NOMS[compteChoisi]}`;
      $("compte-mdp1").value = "";
      $("compte-mdp2").value = "";
      $("compte-mdp").hidden = false;
      $("compte-message").textContent = "";
      $("compte-mdp1").focus();
    })
  );

  $("compte-valider").addEventListener("click", async () => {
    const m1 = $("compte-mdp1").value;
    const m2 = $("compte-mdp2").value;
    const msg = $("compte-message");
    if (m1.length < 8) return (msg.textContent = "Le mot de passe doit faire au moins 8 caractères.");
    if (m1 !== m2) return (msg.textContent = "Les deux mots de passe ne sont pas identiques.");
    const btn = $("compte-valider");
    btn.disabled = true;
    try {
      await window.changerMotDePasse(compteChoisi, m1);
      msg.textContent = `✅ Mot de passe changé pour ${NOMS[compteChoisi]}.`;
      $("compte-mdp").hidden = true;
    } catch (e) {
      msg.textContent =
        e.message === "demo"
          ? "🧸 Mode découverte : ce sera possible quand la vraie base des parents sera branchée."
          : "Impossible de changer le mot de passe pour l'instant. Réessaie.";
    } finally {
      btn.disabled = false;
      $("compte-mdp1").value = "";
      $("compte-mdp2").value = "";
    }
  });
})();
