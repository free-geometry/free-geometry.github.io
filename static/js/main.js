/* Free Geometry page: header, section nav, before/after sliders, charts, tables, error maps, figures, BibTeX. */
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const SITE = window.SITE, T = window.TABLES, E = window.ERRMAPS;

  // ---------------- header ----------------
  const au = $("#authors");
  if (!SITE.authors.length) {
    au.remove();
  } else {
    au.innerHTML = SITE.authors.map((a, i) => '<span class="author-block">' + (a.url ? '<a href="' + esc(a.url) + '" target="_blank">' + esc(a.name) + "</a>" : esc(a.name)) +
      (SITE.affiliations.length > 1 || a.mark ? "<sup>" + (SITE.affiliations.length > 1 ? (a.affil || []).join(",") : "") + (a.mark || "") + "</sup>" : "") +
      (i < SITE.authors.length - 1 ? ",&nbsp;&nbsp;" : "") + "</span>").join("") +
      '<div class="is-size-6" style="margin-top:.5rem;color:#666">' + SITE.affiliations.map((x, i) => { const A = typeof x === "string" ? { name: x } : x;
        const body = (A.logo ? '<img class="affil-logo" src="' + esc(A.logo) + '" alt="">' : "") + esc(A.name);
        return '<span class="author-block">' + (SITE.affiliations.length > 1 ? "<sup>" + (i + 1) + "</sup>" : "") +
          (A.url ? '<a class="affil-link" href="' + esc(A.url) + '" target="_blank" rel="noopener">' + body + "</a>" : body) + "&nbsp;&nbsp;</span>"; }).join("") + "</div>" +
      (SITE.notes.length ? '<div class="is-size-6" style="margin-top:.3rem;color:#666">' + SITE.notes.map(esc).join("&nbsp;&nbsp;") + "</div>" : "");
  }
  if (SITE.venue) { $("#venue").textContent = SITE.venue; } else { $("#venue").remove(); }
  const LINKS = [["paper", "Paper", "fas fa-file-pdf"], ["arxiv", "arXiv", "ai ai-arxiv"], ["code", "Code", "fab fa-github"],
                 ["video", "Video", "fas fa-play"], ["bibtex", "BibTeX", "fas fa-quote-right"]];
  $("#links").innerHTML = LINKS.map(([k, label, icon]) => {
    const ic = icon ? '<span class="icon"><i class="' + icon + '"></i></span>' : '<span class="icon">🤗</span>';
    if (k === "bibtex") return '<span class="link-block"><a href="#bibtex" class="external-link button is-normal is-rounded is-dark">' + ic + "<span>" + label + "</span></a></span>";
    const url = SITE.links[k];
    if (url) return '<span class="link-block"><a href="' + esc(url) + '"' + (url.charAt(0) === "#" ? "" : ' target="_blank" rel="noopener"') + ' class="external-link button is-normal is-rounded is-dark">' + ic + "<span>" + label + "</span></a></span>";
    return '<span class="link-block"><span class="button is-normal is-rounded is-dark is-off" title="Link to be added" aria-disabled="true">' + ic + "<span>" + label + "</span><small>soon</small></span></span>";
  }).join("");
  $$("[data-num]").forEach(e => { const v = T.numbers[e.dataset.num]; e.textContent = v || "?"; });

  // ---------------- section nav + scroll spy ----------------
  const nav = $("#secnav"), hero = $("#top");
  const navLinks = $$(".secnav-links a");
  new IntersectionObserver(es => es.forEach(e => nav.classList.toggle("is-visible", !e.isIntersecting)), { threshold: 0 }).observe(hero);
  const spy = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) navLinks.forEach(a => a.classList.toggle("is-active", a.getAttribute("href") === "#" + e.target.id));
  }), { rootMargin: "-40% 0px -55% 0px" });
  navLinks.forEach(a => { const s = $(a.getAttribute("href")); if (s) spy.observe(s); });

  // ---------------- before / after slider ----------------
  function BA(el, lazy) {
    el.tabIndex = 0;
    el.setAttribute("role", "slider"); el.setAttribute("aria-valuemin", "0"); el.setAttribute("aria-valuemax", "100");
    const ld = lazy ? ' loading="lazy"' : "";
    el.innerHTML = '<img class="ba-base" alt=""' + ld + '><div class="ba-top"><img alt=""' + ld + '></div><div class="ba-line"><div class="ba-knob"><i class="fas fa-arrows-left-right"></i></div></div>' +
      '<span class="ba-tag l"></span><span class="ba-tag r"></span><span class="ba-num l" hidden></span><span class="ba-num r" hidden></span>';
    el.insertAdjacentHTML("beforeend", '<div class="ba-lens" hidden><div class="ba-lens-h l"></div><div class="ba-lens-h r"></div><span class="ba-lens-t l"></span><span class="ba-lens-t r"></span></div>');
    const lensEl = $(".ba-lens", el), hl = $(".ba-lens-h.l", el), hr = $(".ba-lens-h.r", el), Z = 2.6;
    let lensOn = false;
    function lensAt(e) {
      const r = el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      if (x < 0 || y < 0 || x > r.width || y > r.height) { lensEl.hidden = true; return; }
      const R = Math.round(Math.max(54, Math.min(96, r.width * 0.15)));
      lensEl.hidden = false;
      Object.assign(lensEl.style, { width: 2 * R + "px", height: 2 * R + "px", left: x - R + "px", top: y - R + "px" });
      const bx = R - x * Z, by = R - y * Z, bs = r.width * Z + "px " + r.height * Z + "px";
      hl.style.backgroundSize = hr.style.backgroundSize = bs;
      hl.style.backgroundPosition = bx + "px " + by + "px"; hr.style.backgroundPosition = bx - R + "px " + by + "px";
    }
    let x = 0.5, drag = false;
    const set = v => { x = Math.max(0, Math.min(1, v)); el.style.setProperty("--x", (x * 100).toFixed(2) + "%"); el.setAttribute("aria-valuenow", Math.round(x * 100)); };
    const pos = e => { const r = el.getBoundingClientRect(); set((e.clientX - r.left) / r.width); };
    el.addEventListener("pointerdown", e => { drag = true; try { el.setPointerCapture(e.pointerId); } catch (_) { } if (lensOn) lensAt(e); else pos(e); });
    el.addEventListener("pointermove", e => { if (lensOn) { if (drag || e.pointerType === "mouse") lensAt(e); } else if (drag) pos(e); });
    el.addEventListener("pointerup", e => { drag = false; if (lensOn && e.pointerType !== "mouse") lensEl.hidden = true; });
    el.addEventListener("pointercancel", () => { drag = false; lensEl.hidden = true; });
    el.addEventListener("pointerleave", () => { if (!drag) lensEl.hidden = true; });
    el.addEventListener("keydown", e => { if (e.key === "ArrowLeft") { set(x - 0.05); e.preventDefault(); } if (e.key === "ArrowRight") { set(x + 0.05); e.preventDefault(); } });
    set(0.5);
    return {
      set,
      lens(on) { lensOn = on; el.classList.toggle("is-lens", on); if (!on) lensEl.hidden = true; },
      load(left, right, lt, rt, ln, rn) {
        $(".ba-base", el).src = left; $(".ba-top img", el).src = right;
        hl.style.backgroundImage = 'url("' + left + '")'; hr.style.backgroundImage = 'url("' + right + '")';
        $(".ba-lens-t.l", el).textContent = lt; $(".ba-lens-t.r", el).textContent = "Ours";
        $(".ba-base", el).alt = lt; $(".ba-top img", el).alt = rt;
        $(".ba-tag.l", el).textContent = lt; $(".ba-tag.r", el).textContent = rt;
        const L = $(".ba-num.l", el), R = $(".ba-num.r", el);
        L.hidden = ln == null; R.hidden = rn == null; if (ln != null) L.textContent = ln; if (rn != null) R.textContent = rn;
        el.setAttribute("aria-label", "Compare " + lt + " (left) and " + rt + " (right)");
      }
    };
  }
  function tabs(host, onPick) {
    $$("li", host).forEach(li => li.addEventListener("click", () => {
      $$("li", host).forEach(x => x.classList.toggle("is-active", x === li)); onPick(li.dataset.k, li);
    }));
  }

  // teaser
  const tba = BA($("#teaser-ba"));
  const teaserLoad = k => tba.load("static/images/teaser_" + k + "_frozen.webp", "static/images/teaser_" + k + "_ours.webp", "Frozen", "+ Free Geometry");
  teaserLoad("vggt");
  tabs($("#teaser-tabs"), teaserLoad);
  function lensButton(btn, ba) {
    let on = false;
    btn.addEventListener("click", () => { on = !on; ba.lens(on); btn.classList.toggle("is-dark", on); btn.setAttribute("aria-pressed", on);
    });
  }
  lensButton($("#teaser-lens"), tba);
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    let t0 = null, touched = false;
    $("#teaser-ba").addEventListener("pointerdown", () => touched = true, { once: true });
    const sweep = ts => { if (touched) return; if (t0 === null) t0 = ts; const k = (ts - t0) / 2200; if (k >= 1) { tba.set(0.5); return; }
      tba.set(0.5 + 0.3 * Math.sin(k * Math.PI * 2) * (1 - k)); requestAnimationFrame(sweep); };
    setTimeout(() => requestAnimationFrame(sweep), 700);
  }

  // ---------------- charts (Mean column of Tab. 1) ----------------
  const t1 = T.tab_dvlt_seeds_main;
  const num = s => parseFloat(String(s).replace("–", "-").replace("−", "-"));
  function block(rows, b) { return rows.slice(b * 5, b * 5 + 5); }   // frozen + 3 baselines + ours
  let charts = {};
  const stagger = { duration: 750, easing: "easeOutQuart", delay: c => (c.type === "data" && c.mode === "default" ? c.dataIndex * 90 : 0) };
  function drawCharts(b) {
    const pose = block(t1.blocks[0], b), pm = block(t1.blocks[1], b);
    const labels = pose.slice(1).map(r => r.cells[0].t.replace(/^\+\s*/, ""));
    const series = [
      ["ch-auc3", pose.slice(1).map(r => r.cells[9])],
      ["ch-auc30", pose.slice(1).map(r => r.cells[10])],
      ["ch-rel", pm.slice(1).map(r => r.cells[9])],
      ["ch-ir", pm.slice(1).map(r => r.cells[10])]
    ];
    series.forEach(([id, cells], si) => {
      const data = cells.map(c => num(c.t));
      const lowerBetter = id === "ch-rel";
      const colors = labels.map((l, i) => l === "Ours" ? "#2f8f7a" : ["#c7cbd1", "#a9afb8", "#8b929c"][i] || "#9aa0a6");
      if (charts[id]) {
        const ch = charts[id]; ch.$cells = cells; ch.$labels = labels;
        ch.data.labels = labels; ch.data.datasets[0].data = data; ch.data.datasets[0].backgroundColor = colors; ch.update();
        return;
      }
      const ch = charts[id] = new Chart(document.getElementById(id), {
        type: "bar",
        data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 3, maxBarThickness: 34 }] },
        plugins: [ChartDataLabels],
        options: {
          responsive: true, maintainAspectRatio: false, animation: stagger,
          layout: { padding: { top: 18, bottom: 4 } },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => (ctx.raw > 0 ? "+" : "") + ctx.raw + " %" + ((ctx.chart.$cells || cells)[ctx.dataIndex].d ? " †" : "") } },
            datalabels: {
              anchor: ctx => (ctx.dataset.data[ctx.dataIndex] >= 0 ? "end" : "start"), align: ctx => (ctx.dataset.data[ctx.dataIndex] >= 0 ? "end" : "start"),
              offset: 1, font: ctx => ({ size: 10.5, weight: (ctx.chart.$labels || labels)[ctx.dataIndex] === "Ours" ? "700" : "500" }), color: ctx => ((ctx.chart.$labels || labels)[ctx.dataIndex] === "Ours" ? "#22705f" : "#555"),
              formatter: (v, ctx) => (v > 0 ? "+" : "") + v.toFixed(1) + ((ctx.chart.$cells || cells)[ctx.dataIndex].d ? "†" : "")
            }
          },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 10.5 }, maxRotation: 40, minRotation: 0, autoSkip: false } },
            y: { reverse: lowerBetter, grace: "18%", grid: { color: "#eee" }, ticks: { font: { size: 10 }, callback: v => v + "%" },
                 title: { display: true, text: lowerBetter ? "rel. change % (down = better)" : "rel. change %", font: { size: 10 }, color: "#888" } }
          }
        }
      });
      ch.$cells = cells; ch.$labels = labels;
    });
  }
  let chartsDrawn = false, curBlock = 0;
  new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting && !chartsDrawn) { chartsDrawn = true; drawCharts(curBlock); } }), { threshold: 0.1 }).observe($("#ch-auc3"));
  tabs($("#rel-tabs"), k => { curBlock = +k; if (chartsDrawn) drawCharts(curBlock); });

  // ---------------- tables ----------------
  function cellHTML(c, extra) {
    const cls = [c.b ? "b" : "", extra || ""].filter(Boolean).join(" ");
    return "<td" + (cls ? ' class="' + cls + '"' : "") + ">" + esc(c.t) + (c.d ? '<span class="dag">†</span>' : "") + "</td>";
  }
  function renderTable(host, head, rows, opt) {
    opt = opt || {};
    let h = '<table class="rt"><thead>' + head + "</thead><tbody>";
    rows.forEach((r, i) => {
      if (r.group) { h += '<tr class="grp' + (i ? " sep" : "") + '"><td colspan="12">' + esc(r.group) + "</td></tr>"; return; }
      const first = r.cells[0].t, isSub = /^\+/.test(first) || (opt.groups && rows.slice(0, i).some(x => x.group));
      const ours = /Ours|default/.test(first);
      const sep = i > 0 && !r.group && !isSub && !rows[i - 1].group;
      h += '<tr class="' + [ours ? "ours" : "", sep ? "sep" : ""].join(" ") + '">' + r.cells.map((c, j) => cellHTML(c, j === 0 && isSub ? "sub" : "")).join("") + "</tr>";
    });
    host.innerHTML = h + "</tbody></table>" + (opt.caption ? '<p class="table-caption">' + opt.caption + "</p>" : "");
  }
  const ds = '<th rowspan="2">Method</th><th colspan="2">DTU <small>(22)</small></th><th colspan="2">ETH3D <small>(13)</small></th><th colspan="2">7-Scenes <small>(18)</small></th><th colspan="2">ScanNet++ <small>(50)</small></th><th colspan="2">Mean <small>(rel. %)</small></th>';
  renderTable($("#t1-pose"), "<tr>" + ds + "</tr><tr>" + "<th>AUC@3↑</th><th>AUC@30↑</th>".repeat(5) + "</tr>", t1.blocks[0]);
  renderTable($("#t1-pmap"), "<tr>" + ds + "</tr><tr>" + "<th>Rel. L2↓</th><th>IR↑</th>".repeat(5) + "</tr>", t1.blocks[1]);
  const pmHead = '<tr><th rowspan="2">Method</th><th colspan="2">Pose AUC</th><th colspan="2">Point map</th></tr><tr><th>@3↑</th><th>@30↑</th><th>Rel. L2↓</th><th>IR↑</th></tr>';
  renderTable($("#t-gen"), pmHead, T.tab_generalize.blocks[0], {});
  renderTable($("#t-ood"), '<tr><th rowspan="2">Method</th><th rowspan="2">Adapts on</th><th colspan="2">Pose AUC</th><th colspan="2">Depth</th></tr><tr><th>@5↑</th><th>@30↑</th><th>Abs Rel↓</th><th>δ<1.25↑</th></tr>',
              T.tab_ood.blocks[0], {});
  renderTable($("#t-hard"), pmHead, T.tab_hard.blocks[0], { groups: true });
  $$(".table-tabs").forEach(tb => {
    const panes = $$("li", tb).map(li => document.getElementById(li.dataset.pane));
    $$("li", tb).forEach(li => li.addEventListener("click", () => {
      $$("li", tb).forEach(x => x.classList.toggle("is-active", x === li));
      panes.forEach(p => { const on = p.id === li.dataset.pane; p.classList.toggle("is-active", on); if (on) $$("img[data-src]", p).forEach(im => { im.src = im.dataset.src; im.removeAttribute("data-src"); }); });
    }));
  });
  $$("#figures .table-pane.is-active img[data-src]").forEach(im => { im.loading = "lazy"; im.src = im.dataset.src; im.removeAttribute("data-src"); });

  // ---------------- architecture stepper ----------------
  // Wide screens: scroll-driven (the figure and all six steps stay pinned while the page scrolls; the scroll position picks the step).
  // Narrow screens or reduced motion: no pinning; steps cycle once in view (not under reduced motion), click to pick.
  (function () {
    const arch = $("#arch"), spot = $(".arch-spot", arch), items = $$("#arch-steps li");
    const wrap = $("#arch-scrolly"), sticky = $("#arch-sticky"), bar = $("#arch-bar"), cnt = $("#arch-count");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mq = matchMedia("(min-width: 1024px) and (min-height: 720px)");
    const TOP = 58, PER = 0.3;           // sticky offset (px) and scroll length per step (viewport heights)
    let cur = -1, timer = null, user = false, scrolly = false;
    function show(i) {
      cur = i;
      items.forEach((li, j) => { li.classList.toggle("is-active", j === i); li.classList.toggle("is-done", i >= 0 && j < i); });
      cnt.textContent = i < 0 ? "" : (i + 1) + " / " + items.length;
      if (!scrolly) bar.style.width = i < 0 ? "0%" : ((i + 1) / items.length * 100).toFixed(1) + "%";
      if (i < 0) { arch.classList.remove("has-spot"); return; }
      const [x0, y0, x1, y1] = items[i].dataset.r.split(",").map(Number);
      Object.assign(spot.style, { left: x0 + "%", top: y0 + "%", width: (x1 - x0) + "%", height: (y1 - y0) + "%" });
      arch.classList.add("has-spot");
    }
    function total() { return Math.max(1, wrap.offsetHeight - sticky.offsetHeight); }
    function layout() {
      scrolly = mq.matches && !reduced;
      wrap.classList.toggle("is-scrolly", scrolly);
      wrap.style.height = scrolly ? Math.round(sticky.offsetHeight + items.length * PER * innerHeight) + "px" : "";
      onScroll();
    }
    function onScroll() {
      if (!scrolly) return;
      const p = Math.min(1, Math.max(0, (TOP - wrap.getBoundingClientRect().top) / total()));
      bar.style.width = (p * 100).toFixed(1) + "%";
      const i = p <= 0 ? -1 : Math.min(items.length - 1, Math.floor(p * items.length));
      if (i !== cur) show(i);
    }
    function stopAuto() { user = true; clearInterval(timer); timer = null; }
    items.forEach((li, i) => {
      li.tabIndex = 0;
      const pick = () => {
        stopAuto();
        if (scrolly) {
          const y = wrap.getBoundingClientRect().top + scrollY - TOP + total() * (i + 0.5) / items.length;
          scrollTo({ top: y, behavior: "smooth" });
        } else show(cur === i ? -1 : i);
      };
      li.addEventListener("click", pick);
      li.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
      li.addEventListener("mouseenter", () => { if (user && !scrolly) show(i); });
    });
    arch.addEventListener("click", () => { if (scrolly) return; stopAuto(); show(-1); });
    addEventListener("scroll", onScroll, { passive: true });
    mq.addEventListener("change", layout);
    addEventListener("resize", layout);
    new IntersectionObserver(es => es.forEach(e => {
      if (scrolly) return;
      if (e.isIntersecting && !user && !timer && !reduced) { show(Math.max(cur, 0)); timer = setInterval(() => show((cur + 1) % items.length), 3400); }
      if (!e.isIntersecting && timer) { clearInterval(timer); timer = null; }
    }), { threshold: 0.45 }).observe(arch);
    show(-1); layout();
    // the figure loads lazily: its height changes the pinned panel, so lay out again once it is there
    const im = $("img", arch); if (!im.complete) im.addEventListener("load", layout, { once: true });
    window.__arch = { get step() { return cur; }, get scrolly() { return scrolly; } };
  })();

  // ---------------- results explorer ----------------
  (function () {
    const G = T.tab_generalize_full.blocks[0];
    const DS = ["DTU (22)", "ETH3D (13)", "7-Scenes (18)", "ScanNet++ (50)"];
    const isSub = t => t.charAt(0) === "+";
    const clean = t => (isSub(t) ? t.slice(1).trim() : t);
    const models = {};
    // VGGT and DA3-G: Tab. 1, frozen + three baselines + ours, four metrics
    [["VGGT", 0], ["DA3-G", 1]].forEach(([name, b]) => {
      const pose = t1.blocks[0].slice(b * 5, b * 5 + 5), pm = t1.blocks[1].slice(b * 5, b * 5 + 5);
      const pick = (rows, off) => rows.filter((r, j) => j === 0 || j === rows.length - 1).map(r => ({ label: isSub(r.cells[0].t) ? clean(r.cells[0].t) : "Frozen",   // frozen and ours only
        v: [1, 3, 5, 7].map(c => num(r.cells[c + off].t)) }));
      models[name] = { src: "Tab. 1 of the paper", metrics: { "AUC@3": pick(pose, 0), "AUC@30": pick(pose, 1), "Rel. L2": pick(pm, 0), "IR": pick(pm, 1) } };
    });
    // the other three: per-dataset table of the supplementary material, frozen + ours, AUC@3 and IR
    for (let i = 0; i + 1 < G.length; i += 2) {
      const f = G[i], o = G[i + 1], name = f.cells[0].t;
      const pick = off => [f, o].map((r, j) => ({ label: j ? "Ours" : "Frozen", v: [1, 3, 5, 7].map(c => num(r.cells[c + off].t)) }));
      models[name] = { src: "per-dataset table of the supplementary material", metrics: { "AUC@3": pick(0), "IR": pick(1) } };
    }
    const LOWER = { "Rel. L2": true };
    const COL = { Frozen: "#4b5563", "Test3R*": "#d1d5db", TCO: "#b8bec7", "Self-Geometry*": "#9ca3af", Ours: "#2f8f7a" };
    let model = "VGGT", metric = "AUC@3", chart = null, drawn = false;
    const mb = $("#ex-models"), xb = $("#ex-metrics");
    mb.innerHTML = Object.keys(models).map(m => '<button class="button is-small' + (m === model ? " is-dark is-selected" : "") + '" data-m="' + esc(m) + '">' + esc(m) + "</button>").join("");
    function metricsBar() {
      const ms = Object.keys(models[model].metrics);
      if (ms.indexOf(metric) < 0) metric = ms[0];
      xb.innerHTML = ms.map(m => '<button class="button is-small' + (m === metric ? " is-dark is-selected" : "") + '" data-x="' + esc(m) + '">' + esc(m) + (LOWER[m] ? " ↓" : " ↑") + "</button>").join("");
      $$("button", xb).forEach(b => b.addEventListener("click", () => { metric = b.dataset.x; metricsBar(); draw(); }));
    }
    $$("button", mb).forEach(b => b.addEventListener("click", () => {
      model = b.dataset.m;
      $$("button", mb).forEach(x => { const on = x === b; x.classList.toggle("is-dark", on); x.classList.toggle("is-selected", on); });
      metricsBar(); draw();
    }));
    function draw() {
      const M = models[model], rows = M.metrics[metric];
      const data = { labels: DS, datasets: rows.map(r => ({ label: r.label, data: r.v, backgroundColor: COL[r.label] || "#ccc", borderRadius: 3, maxBarThickness: 30 })) };
      const opts = {
        responsive: true, maintainAspectRatio: false, animation: { duration: 650, easing: "easeOutQuart", delay: c => (c.type === "data" && c.mode === "default" ? c.dataIndex * 70 + c.datasetIndex * 30 : 0) }, layout: { padding: { top: 16 } },
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11.5 } } },
          datalabels: { display: c => c.dataset.label === "Ours" || c.dataset.label === "Frozen", anchor: "end", align: "end", offset: 0, clamp: true,
            font: c => ({ size: 10, weight: c.dataset.label === "Ours" ? "700" : "500" }), color: c => (c.dataset.label === "Ours" ? "#22705f" : "#555"),
            formatter: v => (metric === "Rel. L2" ? v.toFixed(3) : v.toFixed(1)) }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11.5 } } },
          y: { beginAtZero: true, grace: "8%", max: (metric === "Rel. L2" ? undefined : 100), grid: { color: "#eee" }, ticks: { font: { size: 10.5 } },
               title: { display: true, text: metric + (LOWER[metric] ? " (lower is better)" : " (higher is better)"), font: { size: 11 }, color: "#777" } }
        }
      };
      if (chart) { chart.data = data; chart.options = opts; chart.update(); }
      else chart = new Chart($("#ex-chart"), { type: "bar", data, options: opts, plugins: [ChartDataLabels] });
    }
    metricsBar();
    new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting && !drawn) { drawn = true; draw(); } }), { threshold: 0.1 }).observe($("#ex-chart"));
  })();

  // ---------------- lightbox ----------------
  const lb = $("#lightbox");
  document.addEventListener("click", e => {
    const im = e.target.closest(".zoomable img");
    if (im) { $("img", lb).src = im.currentSrc || im.src; $("img", lb).alt = im.alt; lb.hidden = false; return; }
    if (!lb.hidden && e.target.closest("#lightbox")) lb.hidden = true;
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") lb.hidden = true; });

  // ---------------- BibTeX ----------------
  $("#bib-code").textContent = SITE.bibtex;
  $("#bib-copy").addEventListener("click", async () => {
    const b = $("#bib-copy span:last-child");
    try { await navigator.clipboard.writeText(SITE.bibtex); b.textContent = "Copied"; }
    catch (e) { const r = document.createRange(); r.selectNodeContents($("#bib-code")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = "Press Ctrl+C"; }
    setTimeout(() => (b.textContent = "Copy"), 1600);
  });
})();
