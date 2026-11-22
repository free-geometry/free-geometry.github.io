/* Page effects: scroll progress bar, section rail, number counters, cursor spotlight on cards, toast,
   command palette (Ctrl/Cmd+K or /) and J/K section keys. Content never waits for these: every number is in the
   page before a counter runs, and prefers-reduced-motion turns the motion off. */
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  // ---------------- toast ----------------
  const toastEl = $("#toast"); let toastT = 0;
  window.fgToast = msg => {
    toastEl.textContent = msg; toastEl.classList.add("is-on");
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove("is-on"), 2200);
  };

  // ---------------- sections, progress bar, rail ----------------
  const SECTIONS = [["top", "Title"], ["teaser", "Teaser"], ["abstract", "Abstract"], ["compare", "Compare"], ["studio", "Inside one scene"], ["method", "Method"], ["results", "Experiments"],
    ["figures", "More results"], ["bibtex", "BibTeX"]]
    .filter(([id]) => document.getElementById(id));
  const bar = $("#progress span"), rail = $("#rail");
  rail.innerHTML = SECTIONS.map(([id, name]) => '<a href="#' + id + '" data-id="' + id + '"><i></i><span>' + esc(name) + "</span></a>").join("");
  const railLinks = $$("a", rail);
  let curSec = 0;
  function onScroll() {
    const h = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = "scaleX(" + (h > 0 ? Math.min(1, scrollY / h) : 0).toFixed(4) + ")";
    const y = scrollY + innerHeight * 0.35;
    let k = 0;
    SECTIONS.forEach(([id], i) => { if (document.getElementById(id).offsetTop <= y) k = i; });
    if (k !== curSec || !railLinks[k].classList.contains("is-active")) {
      curSec = k; railLinks.forEach((a, i) => { a.classList.toggle("is-active", i === k); a.classList.toggle("is-past", i < k); });
    }
    rail.classList.toggle("is-on", scrollY > innerHeight * 0.5);
  }
  addEventListener("scroll", onScroll, { passive: true }); addEventListener("resize", onScroll); onScroll();
  function goSection(d) {
    const i = Math.max(0, Math.min(SECTIONS.length - 1, curSec + d));
    document.getElementById(SECTIONS[i][0]).scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
  }

  // ---------------- counters (key numbers) ----------------
  function countUp(el) {
    const final = el.textContent, m = final.match(/^([^\d]*)(\d+(?:\.\d+)?)(.*)$/);
    if (!m || reduced) return;
    const v = parseFloat(m[2]), dec = (m[2].split(".")[1] || "").length, t0 = performance.now(), D = 1300;
    if (v === 0) return;
    const step = now => {
      const k = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - k, 3);
      el.textContent = k >= 1 ? final : m[1] + (v * e).toFixed(dec) + m[3];
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  const counted = new WeakSet();
  const cio = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting && !counted.has(e.target)) { counted.add(e.target); countUp(e.target); } }), { threshold: 0.6 });
  $$(".keynums b").forEach(b => cio.observe(b));

  // ---------------- cursor spotlight on cards ----------------
  if (!reduced && matchMedia("(hover: hover)").matches) {
    let last = null;
    document.addEventListener("pointermove", e => {
      const c = e.target.closest && e.target.closest(".spot");
      if (last && last !== c) last.classList.remove("is-lit");
      last = c;
      if (!c) return;
      const r = c.getBoundingClientRect();
      c.style.setProperty("--mx", (e.clientX - r.left) + "px"); c.style.setProperty("--my", (e.clientY - r.top) + "px");
      c.classList.add("is-lit");
    }, { passive: true });
  }

  // ---------------- command palette ----------------
  const kbar = $("#kbar"), q = $("#kbar-q"), list = $("#kbar-list"), openBtn = $("#kbar-open");
  $("kbd", openBtn).textContent = mac ? "⌘K" : "Ctrl K";
  const go = id => document.getElementById(id).scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
  const click = sel => { const el = $(sel); if (el) el.click(); };
  function commands() {
    const C = [];
    SECTIONS.forEach(([id, name]) => C.push({ g: "Section", t: name, run: () => go(id) }));
    $$("#teaser-tabs li").forEach(li => C.push({ g: "Teaser", t: "Teaser: " + li.textContent.trim(), run: () => { go("teaser"); li.click(); } }));
    C.push({ g: "Teaser", t: "Teaser: toggle the magnifier lens", run: () => { go("teaser"); click("#teaser-lens"); } });
    $$("#rel-tabs li").forEach(li => C.push({ g: "Results", t: "Mean relative change: " + li.textContent.trim(), run: () => { go("results"); li.click(); } }));
    $$("#ex-models button").forEach(b => C.push({ g: "Results", t: "Per-dataset explorer: " + b.textContent.trim(), run: () => { $("#explorer").scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" }); b.click(); } }));
    $$("#ab-blocks button").forEach(b => C.push({ g: "Ablation", t: "Ablation: " + b.textContent.trim(), run: () => { $("#ab-chart").scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" }); b.click(); } }));
    $$("#gal-modes button").forEach(b => C.push({ g: "Compare", t: "Colour by: " + b.textContent.trim(), run: () => { go("compare"); b.click(); } }));
    [["#gal-3d", "3D"], ["#gal-2d", "Error map"]].forEach(([row, g]) => $$(row + " .gcard").forEach(card => $$(".gb-scene", card).forEach(b => C.push({
      g, t: card.dataset.model + " · " + b.title, run: () => { $(row).scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" }); b.click(); } }))));
    $$("#gal-3d .gcard").forEach(card => C.push({ g: "3D", t: "Enlarge: " + card.dataset.model, run: () => click('#gal-3d .gcard[data-model="' + card.dataset.model + '"] .gv-expand') }));
    $$("#st-scenes button").forEach(b => C.push({ g: "Studio", t: "Studio: " + b.textContent.trim(), run: () => { go("studio"); b.click(); } }));
    $$("#st-stops button").forEach(b => C.push({ g: "Studio", t: "Studio: show " + b.textContent.trim(), run: () => { go("studio"); b.click(); } }));
    C.push({ g: "Studio", t: "Studio: play the frames", run: () => { go("studio"); click("#st-play"); } });
    C.push({ g: "Action", t: "Copy BibTeX", run: () => click("#bib-copy") });
    if (!$("#hero-note").hidden) C.push({ g: "Action", t: "Pause / play the header animation", run: () => click("#hero-note") });
    return C;
  }
  let CMDS = [], shown = [], sel = 0;
  function score(t, s) {          // subsequence match, earlier and contiguous hits score higher
    if (!s) return 1;
    t = t.toLowerCase(); let i = 0, sc = 0, run = 0;
    for (const ch of s.toLowerCase()) {
      const j = t.indexOf(ch, i); if (j < 0) return 0;
      run = j === i ? run + 1 : 0; sc += 1 + run * 2 - j * 0.01; i = j + 1;
    }
    return sc;
  }
  function render() {
    const s = q.value.trim();
    shown = CMDS.map(c => ({ c, s: score(c.t + " " + c.g, s) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 40).map(x => x.c);
    if (!s) shown = CMDS.slice(0, 40);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    list.innerHTML = shown.length ? shown.map((c, i) => '<li role="option" data-i="' + i + '"' + (i === sel ? ' class="is-sel" aria-selected="true"' : "") + "><em>" + esc(c.g) + "</em><span>" + esc(c.t) + "</span>" +
      (c.hint ? "<small>" + esc(c.hint) + "</small>" : "") + "</li>").join("") : '<li class="kbar-empty">Nothing found</li>';
    const el = $("li.is-sel", list); if (el) el.scrollIntoView({ block: "nearest" });
  }
  let lastFocus = null;
  function open() {
    if (!kbar.hidden) return;
    CMDS = commands(); lastFocus = document.activeElement;
    kbar.hidden = false; q.value = ""; sel = 0; render();
    requestAnimationFrame(() => { kbar.classList.add("is-on"); q.focus(); });
  }
  function close() {
    kbar.classList.remove("is-on"); kbar.hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  function run(i) { const c = shown[i]; if (!c) return; close(); setTimeout(() => c.run(), 10); }
  openBtn.addEventListener("click", open);
  q.addEventListener("input", () => { sel = 0; render(); });
  q.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { sel = Math.min(shown.length - 1, sel + 1); render(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); render(); e.preventDefault(); }
    else if (e.key === "Enter") { run(sel); e.preventDefault(); }
    else if (e.key === "Escape") { close(); e.preventDefault(); }
  });
  list.addEventListener("click", e => { const li = e.target.closest("li[data-i]"); if (li) run(+li.dataset.i); });
  list.addEventListener("mousemove", e => { const li = e.target.closest("li[data-i]"); if (li && +li.dataset.i !== sel) { sel = +li.dataset.i; $$("li", list).forEach((x, i) => x.classList.toggle("is-sel", i === sel)); } });
  kbar.addEventListener("click", e => { if (e.target === kbar) close(); });
  document.addEventListener("keydown", e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || "")) || e.target.isContentEditable;
    if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); kbar.hidden ? open() : close(); return; }
    if (typing || e.metaKey || e.ctrlKey || e.altKey || !kbar.hidden) return;
    if (e.key === "/" || e.key === "?") { e.preventDefault(); open(); }
    else if (e.key === "j" || e.key === "J") goSection(1);
    else if (e.key === "k" || e.key === "K") goSection(-1);
  });
  window.__fx = { open, close, commands: () => commands().length };
})();
