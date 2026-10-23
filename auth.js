// Connexion par profil + mot de passe : 2 comptes, « Parents » et « Grands-parents »
// Les droits sont vérifiés par le serveur (règles RLS) : l'écran ne fait que guider.

const PROFILS = [
  { nom: "Parents", emoji: "👨‍👩‍👧", role: "parents" },
  { nom: "Grands-parents", emoji: "👵", role: "famille" },
];
const COMPTES = { parents: "parents.hortense@example.com", famille: "grandsparents.hortense@example.com" };

// Profil connecté sur ce téléphone : { nom, emoji, role }
let profil = null;
const estParent = () => profil?.role === "parents";
// Les pages Repas, Couches, Sommeil et Santé ne sont modifiables que par les parents
const peutModifier = () => estParent();

let resoudreConnexion;
const connexionPrete = new Promise((r) => (resoudreConnexion = r));

(() => {
  // En mode découverte, pas de vraie connexion : n'importe quel mot de passe ouvre le profil choisi
  const sb = CONFIG.demo ? null : window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "hortense:auth" },
  });
  let choix = lire("dernier-profil", null, (v) => PROFILS.some((p) => p.nom === v));

  obtenirJeton = async () => {
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data.session?.access_token || null;
  };

  // ---------- Écran de connexion ----------
  function rendreProfils() {
    $("login-profils").replaceChildren(
      ...PROFILS.map((p) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "who-btn";
        b.setAttribute("aria-pressed", String(p.nom === choix));
        b.innerHTML = `<span class="emoji" aria-hidden="true">${p.emoji}</span><span>${esc(p.nom)}</span>`;
        b.addEventListener("click", () => {
          choix = p.nom;
          rendreProfils();
          $("login-mdp").focus();
        });
        return b;
      })
    );
    const p = PROFILS.find((x) => x.nom === choix);
    $("login-suite").hidden = !p;
  }

  // La savane de l'en-tête, recopiée en grand sur l'accueil : les animaux y défilent en boucle
  function decorAccueil() {
    const cible = $("login-scene");
    const source = document.querySelector(".scene .landscape");
    if (cible.firstChild || !source) return;
    const copie = source.cloneNode(true);
    copie.removeAttribute("class");
    copie.classList.add("landscape", "login-landscape");
    copie.querySelector(".cloche-svg")?.remove();
    copie.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
    copie.querySelectorAll(".walker").forEach((w) => w.removeAttribute("style"));
    copie.querySelector(".giraffe")?.classList.add("on", "walking");
    copie.querySelector(".giraffe")?.classList.remove("drinking");
    copie.querySelector(".elephant")?.classList.add("on", "walking", "left");
    copie.querySelector(".birds")?.classList.add("on");
    copie.querySelector(".meerkat")?.classList.add("on");
    cible.append(copie);
  }

  function montrerConnexion() {
    decorAccueil();
    document.body.classList.add("verrouille");
    $("login").hidden = false;
    $("login-erreur").textContent = "";
    $("login-mdp").value = "";
    rendreProfils();
  }

  async function seConnecter(e) {
    e.preventDefault();
    const p = PROFILS.find((x) => x.nom === choix);
    if (!p) return;
    const mdp = $("login-mdp").value;
    const nom = p.nom;
    if (!mdp) {
      $("login-erreur").textContent = "Tape le mot de passe.";
      return;
    }
    const btn = $("login-btn");
    btn.disabled = true;
    $("login-erreur").textContent = "";
    try {
      if (CONFIG.demo) {
        ecrire("dernier-profil", p.nom);
        return activer({ nom, emoji: p.emoji, role: p.role }, true);
      }
      if (!sb) throw new Error("hors ligne");
      const { error } = await sb.auth.signInWithPassword({ email: COMPTES[p.role], password: mdp });
      if (error) {
        $("login-erreur").textContent = error.status === 400 ? "Mot de passe incorrect." : "Connexion impossible, réessaie.";
        return;
      }
      ecrire("dernier-profil", p.nom);
      activer({ nom, emoji: p.emoji, role: p.role }, true);
    } catch (err) {
      $("login-erreur").textContent = "Pas de réseau : il faut internet pour la première connexion.";
    } finally {
      btn.disabled = false;
      $("login-mdp").value = "";
    }
  }

  function activer(pr, premiere) {
    profil = pr;
    ecrire("profil", pr);
    document.body.classList.remove("verrouille");
    document.body.classList.toggle("lecture-seule", !estParent());
    // Transition : l'accueil s'envole en zoomant, l'appli arrive en douceur
    if (!$("login").hidden && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      $("login").classList.add("sortie");
      document.body.classList.add("entree");
      setTimeout(() => {
        $("login").hidden = true;
        $("login").classList.remove("sortie");
        document.body.classList.remove("entree");
      }, 750);
    } else {
      $("login").hidden = true;
    }
    $("moi-nom").textContent = `${pr.emoji} ${pr.nom}`;
    $("moi-version").textContent = `v${VERSION_APPLI}`;
    $("moi").hidden = false;
    window.dispatchEvent(new CustomEvent("connecte", { detail: { premiere } }));
    resoudreConnexion();
    if (premiere) rechargerTout();
  }

  async function seDeconnecter() {
    if (!(await demanderConfirmation("Changer de profil ? Il faudra retaper le mot de passe.", "Changer"))) return;
    try {
      await sb?.auth.signOut();
    } catch (e) {}
    profil = null;
    ecrire("profil", null);
    $("moi").hidden = true;
    montrerConnexion();
  }

  // Le serveur refuse (jeton expiré ou supprimé) : on redemande la connexion
  surNonConnecte = () => {
    if (!$("login").hidden) return;
    profil = null;
    ecrire("profil", null);
    montrerConnexion();
  };

  // Changer un mot de passe (page « comptes », parents uniquement)
  // - Parents : directement, avec la connexion en cours
  // - Grands-parents : via la petite fonction serveur « comptes » (elle vérifie que la demande vient des parents)
  window.changerMotDePasse = async (compte, mdp) => {
    if (CONFIG.demo) throw new Error("demo");
    if (!estParent()) throw new Error("interdit");
    if (compte === "parents") {
      const { error } = await sb.auth.updateUser({ password: mdp });
      if (error) throw error;
      return;
    }
    const jeton = await obtenirJeton();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/comptes`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${jeton}`, "Content-Type": "application/json" },
      body: JSON.stringify({ compte: "famille", mot_de_passe: mdp }),
    });
    if (!res.ok) throw new Error(`Erreur ${res.status}`);
  };

  $("login-form").addEventListener("submit", seConnecter);
  $("moi-changer").addEventListener("click", seDeconnecter);

  // ---------- Démarrage ----------
  (async () => {
    // Test en local uniquement : ?dev=parents ou ?dev=famille saute la connexion
    const dev = location.hostname === "localhost" && new URLSearchParams(location.search).get("dev");
    if (dev === "parents" || dev === "famille") {
      const p = PROFILS.find((x) => x.role === dev);
      return activer({ nom: p.nom, emoji: p.emoji, role: p.role }, false);
    }
    const memo = lire("profil", null, (v) => v && PROFILS.some((p) => p.role === v.role) && typeof v.nom === "string");
    let session = null;
    try {
      session = sb ? (await sb.auth.getSession()).data.session : null;
    } catch (e) {}
    // Profil déjà connecté (même sans réseau : les données en cache s'affichent)
    if (memo && (CONFIG.demo || session || localStorage.getItem("hortense:auth"))) return activer(memo, false);
    montrerConnexion();
  })();
})();
