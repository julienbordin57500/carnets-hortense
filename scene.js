// Petite vie dans la savane : de temps en temps, un animal passe.
// - la girafe vient boire à la mare puis repart
// - l'éléphant traverse en balançant sa trompe
// - des oiseaux passent dans le ciel
// - un suricate sort la tête derrière la colline
(() => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const $ = (id) => document.getElementById(id);
  const giraffe = $("giraffe");
  const elephant = $("elephant");
  const birds = $("birds");
  const meerkat = $("meerkat");
  if (!giraffe || !elephant || !birds || !meerkat) return;

  const POND_X = 258;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (a, b) => a + Math.random() * (b - a);

  // Déplace le « walker » d'un animal d'un point à un autre, à vitesse constante (unités/s)
  function move(animal, from, to, speed, axis = "X") {
    const walker = animal.querySelector(".walker");
    const duration = (Math.abs(to - from) / speed) * 1000;
    const anim = walker.animate(
      [{ transform: `translate${axis}(${from}px)` }, { transform: `translate${axis}(${to}px)` }],
      { duration, easing: axis === "X" ? "linear" : "ease-in-out", fill: "forwards" }
    );
    return anim.finished;
  }

  async function girafeQuiBoit() {
    giraffe.classList.add("on", "walking");
    await move(giraffe, -70, POND_X - 40, 22);
    giraffe.classList.remove("walking");
    await sleep(400);
    giraffe.classList.add("drinking");
    await sleep(rand(5000, 8000));
    giraffe.classList.remove("drinking");
    await sleep(1800);
    giraffe.classList.add("walking");
    await move(giraffe, POND_X - 40, 470, 22);
    giraffe.classList.remove("on", "walking");
  }

  async function elephantQuiPasse() {
    elephant.classList.add("on", "walking", "left");
    await move(elephant, 450, -60, 17);
    elephant.classList.remove("on", "walking", "left");
  }

  async function oiseaux() {
    birds.setAttribute("transform", `translate(0 ${Math.round(rand(14, 40))})`);
    birds.classList.add("on");
    await move(birds, -40, 440, 45);
    birds.classList.remove("on");
  }

  async function suricate() {
    meerkat.classList.add("on");
    await move(meerkat, 26, 0, 30, "Y");
    await sleep(rand(2500, 4500));
    await move(meerkat, 0, 26, 30, "Y");
    meerkat.classList.remove("on");
  }

  // Les grands animaux passent chacun leur tour…
  async function grandsAnimaux() {
    await sleep(800);
    const suite = [girafeQuiBoit, elephantQuiPasse];
    for (let i = 0; ; i++) {
      await suite[i % suite.length]();
      await sleep(rand(4000, 9000));
    }
  }

  // …et les petits surprennent de temps en temps
  async function petitsAnimaux() {
    await sleep(rand(5000, 8000));
    for (;;) {
      await (Math.random() < 0.5 ? oiseaux() : suricate());
      await sleep(rand(7000, 14000));
    }
  }

  grandsAnimaux();
  petitsAnimaux();
})();
