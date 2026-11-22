/* Public-page motion: promo video player, card tilt, magnetic hero buttons, heading shine.
   Everything is visible at rest; motion only on hover / when entering the view; off under prefers-reduced-motion. */
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches, hover = matchMedia("(hover: hover)").matches;

  // ---- promo video: poster + big play button; native controls once it plays
  const v = $("#promo"), play = $("#vid-play"), frame = $("#vid-frame");
  if (v && play) {
    play.addEventListener("click", () => { v.controls = true; v.preload = "auto"; frame.classList.add("is-playing"); const p = v.play(); if (p && p.catch) p.catch(() => {}); });
    v.addEventListener("ended", () => { frame.classList.remove("is-playing"); v.controls = false; });
  }

  if (reduced) return;
  // ---- heading shine: one light sweep across each section title as it comes into view (text stays readable throughout)
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("is-shine"); io.unobserve(e.target); } }), { threshold: 0.8 });
  $$(".section .title.is-3, .hero-title").forEach(h => io.observe(h));
  if (!hover) return;
  // ---- 3D tilt on cards (follows the cursor, springs back)
  const tilt = (el, max) => {
    let raf = 0, tx = 0, ty = 0;
    const apply = () => { raf = 0; el.style.transform = tx || ty ? "perspective(900px) rotateX(" + ty.toFixed(2) + "deg) rotateY(" + tx.toFixed(2) + "deg)" : ""; };
    el.addEventListener("pointermove", e => {
      if (e.buttons || (e.target.closest && e.target.closest("canvas, .gv-knob, input"))) return;   // never fight a drag inside the card
      const r = el.getBoundingClientRect(); tx = ((e.clientX - r.left) / r.width - .5) * 2 * max; ty = -((e.clientY - r.top) / r.height - .5) * 2 * max;
      if (!raf) raf = requestAnimationFrame(apply);
    });
    el.addEventListener("pointerleave", () => { tx = ty = 0; el.style.transition = "transform .45s cubic-bezier(.2,.8,.2,1)"; apply(); setTimeout(() => (el.style.transition = ""), 460); });
  };
  $$(".keynums > div").forEach(el => tilt(el, 8));
  $$(".an-card, .explorer").forEach(el => tilt(el, 2));
  const tiltNew = () => $$(".gcard:not([data-tilt])").forEach(el => { el.dataset.tilt = 1; tilt(el, 3.5); });
  new MutationObserver(tiltNew).observe(document.body, { childList: true, subtree: true }); tiltNew();
  // ---- magnetic hero buttons
  const mag = () => $$(".hero-copy .publication-links .button").forEach(b => {
    if (b.dataset.mag) return; b.dataset.mag = 1;
    b.addEventListener("pointermove", e => { const r = b.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      b.style.transform = "translate(" + (dx * .18).toFixed(1) + "px," + (dy * .28).toFixed(1) + "px)"; });
    b.addEventListener("pointerleave", () => { b.style.transform = ""; });
  });
  mag(); setTimeout(mag, 300);
})();
