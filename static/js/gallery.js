/* Comparison gallery: one card per model.
   3D row: frozen and Free Geometry point maps of the same pixels in ONE view, split by a draggable divider
           (one WebGL canvas, two scissored draws with a shared camera; orbit anywhere, drag the knob to move the split).
   2D row: per-pixel error maps of one frame, split the same way.
   Colouring for both rows: RGB, error (turbo, 0 to the 95th percentile of the frozen error of the scene) or
   outliers (red: point error >= 3 %, the threshold of the paper's inlier ratio; grey: below).
   Data: static/data/gallery.js + static/cards/*.bin + static/err/* (tools/export_assets.py gallery / errmaps). */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const G = window.GALLERY, E = window.ERRMAPS;
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const MODELS = ["VGGT", "DA3-G", "VGGT-Ω", "π³", "DVLT"];
const DS = { DTU: "DTU", ETH3D: "ETH3D", "7-Scenes": "7-Scenes", "ScanNet++": "ScanNet++" };
const RED = [214 / 255, 48 / 255, 39 / 255], GREY = [190 / 255, 190 / 255, 190 / 255];
const pct = v => (100 * v).toFixed(1) + "%";
const TURBO = G.turbo;
THREE.ColorManagement.enabled = false;
let mode = "out";
let gl = true;
try { const c = document.createElement("canvas"); gl = !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { gl = false; }

// ------------------------------------------------------------------ data
const cache = new Map();
async function loadCloud(S) {
  if (cache.has(S.key)) return cache.get(S.key);
  const p = fetch(S.file).then(r => { if (!r.ok) throw new Error(S.file + " " + r.status); return r.arrayBuffer(); }).then(buf => {
    const n = S.n, u16 = new Uint16Array(buf, 0, n * 6), u8 = new Uint8Array(buf, n * 12);
    const pos = k => { const f = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) f[i] = u16[k * n * 3 + i] / 65535 - 0.5; return f; };
    return { n, A: pos(0), B: pos(1), rgb: u8.subarray(0, n * 3), qa: u8.subarray(n * 3, n * 4), qb: u8.subarray(n * 4, n * 5), fl: u8.subarray(n * 5, n * 6) };
  });
  cache.set(S.key, p);
  return p;
}
function colours(d, side, m) {
  const n = d.n, c = new Float32Array(n * 3), q = side ? d.qb : d.qa, bit = side ? 2 : 1;
  for (let i = 0; i < n; i++) {
    let r, g, b;
    if (m === "rgb") { r = d.rgb[3 * i] / 255; g = d.rgb[3 * i + 1] / 255; b = d.rgb[3 * i + 2] / 255; }
    else if (m === "err") { const k = 3 * q[i]; r = TURBO[k] / 255; g = TURBO[k + 1] / 255; b = TURBO[k + 2] / 255; }
    else { [r, g, b] = d.fl[i] & bit ? RED : GREY; }
    c[3 * i] = r; c[3 * i + 1] = g; c[3 * i + 2] = b;
  }
  return c;
}

// ------------------------------------------------------------------ divider (shared by 2D and 3D)
function divider(host, onMove) {
  host.insertAdjacentHTML("beforeend", '<span class="gv-tag l">Frozen</span><span class="gv-tag r">Ours</span><div class="gv-line"></div>' +
    '<button type="button" class="gv-knob" role="slider" aria-label="Divider between frozen and Free Geometry" aria-valuemin="0" aria-valuemax="100"><i class="fas fa-arrows-left-right"></i></button>');
  const knob = $(".gv-knob", host);
  let x = 0.5, drag = false;
  const set = v => { x = Math.max(0.02, Math.min(0.98, v)); host.style.setProperty("--x", (100 * x).toFixed(2) + "%"); knob.setAttribute("aria-valuenow", Math.round(100 * x)); onMove(x); };
  const at = e => { const r = host.getBoundingClientRect(); set((e.clientX - r.left) / r.width); };
  knob.addEventListener("pointerdown", e => { drag = true; try { knob.setPointerCapture(e.pointerId); } catch (_) { } e.preventDefault(); e.stopPropagation(); });
  knob.addEventListener("pointermove", e => { if (drag) at(e); });
  knob.addEventListener("pointerup", () => (drag = false));
  knob.addEventListener("pointercancel", () => (drag = false));
  knob.addEventListener("keydown", e => { if (e.key === "ArrowLeft") { set(x - 0.05); e.preventDefault(); } if (e.key === "ArrowRight") { set(x + 0.05); e.preventDefault(); } });
  set(0.5);
  return { set, get x() { return x; } };
}
// a short sweep of the divider the first time a card is seen, so it reads as draggable without any text
function sweepOnce(el, dv, delay) {
  if (reduced) return;
  new IntersectionObserver((es, io) => es.forEach(e => {
    if (!e.isIntersecting) return; io.disconnect();
    setTimeout(() => {
      const t0 = performance.now();
      const f = now => { const k = (now - t0) / 1500; if (k >= 1) { dv.set(0.5); return; } dv.set(0.5 + 0.2 * Math.sin(k * Math.PI * 2) * (1 - k)); requestAnimationFrame(f); };
      requestAnimationFrame(f);
    }, delay);
  }), { threshold: 0.6 }).observe(el);
}

// ------------------------------------------------------------------ 3D split view
class Split3D {
  constructor(host, big) {
    this.host = host; this.big = big;
    host.classList.add("gview-3d");
    host.innerHTML = '<canvas></canvas><div class="gv-load"><span></span></div>';
    this.canvas = $("canvas", host);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: big ? "high-performance" : "low-power" });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setClearColor(0xffffff, 1);
    this.scene = new THREE.Scene();
    const mk = () => new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: big ? 3.0 : 2.4, sizeAttenuation: false, vertexColors: true }));
    this.A = mk(); this.B = mk(); this.scene.add(this.A, this.B);
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.01, 20);
    this.controls = new OrbitControls(this.camera, this.canvas);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.12, screenSpacePanning: true, rotateSpeed: 0.8 });
    this.controls.addEventListener("change", () => this.req());
    this.controls.addEventListener("start", () => (this.moved = true));
    this.dv = divider(host, () => this.req());
    this.visible = true; this.pending = false;
    new ResizeObserver(() => this.resize()).observe(host);
    new IntersectionObserver(es => { this.visible = es[0].isIntersecting; if (this.visible) this.req(); }).observe(host);
    this.resize();
  }
  async show(S) {
    this.S = S; this.host.classList.add("is-loading");
    const d = await loadCloud(S);
    if (this.S !== S) return;
    this.d = d;
    this.A.geometry.setAttribute("position", new THREE.BufferAttribute(d.A, 3));
    this.B.geometry.setAttribute("position", new THREE.BufferAttribute(d.B, 3));
    this.A.geometry.computeBoundingSphere(); this.B.geometry.computeBoundingSphere();
    this.recolour(); this.reset();
    this.host.classList.remove("is-loading");
  }
  recolour() {
    if (!this.d) return;
    this.A.geometry.setAttribute("color", new THREE.BufferAttribute(colours(this.d, 0, mode), 3));
    this.B.geometry.setAttribute("color", new THREE.BufferAttribute(colours(this.d, 1, mode), 3));
    this.req();
  }
  reset() {
    const u = new THREE.Vector3(...this.S.up).normalize();
    let s1 = new THREE.Vector3(1, 0, 0); if (Math.abs(s1.dot(u)) > 0.9) s1.set(0, 1, 0);
    s1.sub(u.clone().multiplyScalar(s1.dot(u))).normalize();
    const s2 = new THREE.Vector3().crossVectors(u, s1);
    this.camera.up.copy(u);
    this.dir = u.clone().multiplyScalar(0.95).add(s1.multiplyScalar(-0.78)).add(s2.multiplyScalar(0.42)).normalize();
    this.moved = false;
    this.fit();
  }
  // frame the cloud: centre on the robust middle of both clouds and move the camera along the view direction until
  // 99 % of a point sample fits in the view (a few stray points may fall outside)
  fit() {
    if (!this.d || !this.dir) return;
    const A = this.d.A, B = this.d.B, n = this.d.n, step = Math.max(1, Math.floor(n / 2500)), P = [];
    for (let i = 0; i < n; i += step) { P.push([A[3 * i], A[3 * i + 1], A[3 * i + 2]], [B[3 * i], B[3 * i + 1], B[3 * i + 2]]); }
    const q = (arr, t) => { const s = Float32Array.from(arr).sort(); return s[Math.floor(t * (s.length - 1))]; };
    const c = new THREE.Vector3(...[0, 1, 2].map(k => { const v = P.map(p => p[k]); return (q(v, 0.01) + q(v, 0.99)) / 2; }));
    const d = this.dir, f = d.clone().negate(), r = new THREE.Vector3().crossVectors(f, this.camera.up).normalize(), up = new THREE.Vector3().crossVectors(r, f);
    const tv = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)), th = tv * this.camera.aspect, fill = 0.92;
    const need = P.map(p => { const v = new THREE.Vector3(p[0] - c.x, p[1] - c.y, p[2] - c.z);
      return v.dot(d) + Math.max(Math.abs(v.dot(r)) / (th * fill), Math.abs(v.dot(up)) / (tv * fill)); });
    const D = Math.max(0.2, q(need, 0.99));
    this.controls.target.copy(c);
    this.camera.position.copy(c.clone().add(d.clone().multiplyScalar(D)));
    this.camera.near = D / 50; this.camera.far = D * 10; this.camera.updateProjectionMatrix();
    this.controls.update(); this.req();
  }
  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    if (!this.moved) this.fit();
    this.req();
  }
  req() { if (!this.pending && this.visible) { this.pending = true; requestAnimationFrame(() => this.draw()); } }
  draw() {
    this.pending = false;
    const moving = this.controls.update();
    const r = this.renderer, w = this.host.clientWidth, h = this.host.clientHeight, s = Math.round(w * this.dv.x);
    r.setScissorTest(true); r.setViewport(0, 0, w, h);
    r.setScissor(0, 0, s, h); this.A.visible = true; this.B.visible = false; r.render(this.scene, this.camera);
    r.setScissor(s, 0, w - s, h); this.A.visible = false; this.B.visible = true; r.render(this.scene, this.camera);
    r.setScissorTest(false);
    if (moving) this.req();
  }
  dispose() { this.controls.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss(); this.host.innerHTML = ""; this.host.classList.remove("gview-3d"); }
}

// ------------------------------------------------------------------ 2D split view
class Split2D {
  constructor(host) {
    this.host = host; host.classList.add("gview-2d");
    host.innerHTML = '<img class="g2-base" alt="" loading="lazy"><div class="g2-top"><img alt="" loading="lazy"></div>';
    this.dv = divider(host, () => { });
  }
  show(left, right, alt) { const [a, b] = $$("img", this.host); a.src = left; b.src = right; a.alt = "Frozen: " + alt; b.alt = "Free Geometry: " + alt; }
}

// ------------------------------------------------------------------ cards
const dupLabels = list => list.map((S, i) => { const d = DS[S.dataset] || S.dataset, same = list.filter(x => x.dataset === S.dataset); return same.length > 1 ? d + " " + (same.indexOf(S) + 1) : d; });
const cards3d = [], cards2d = [];

function head(model, scenes, labels) {
  return '<div class="gcard-head"><div class="gh-top"><span class="gb gb-model">' + esc(model) + '</span><span class="gb gb-delta"></span></div><div class="gb-scenes">' +
    scenes.map((S, i) => '<button type="button" class="gb gb-scene' + (i ? "" : " is-active") + '" data-i="' + i + '" title="' + esc(S.dataset + " · " + S.short) + '">' + esc(labels[i]) + "</button>").join("") +
    "</div></div>";
}
function bindChips(card, pick) {
  $$(".gb-scene", card).forEach(b => b.addEventListener("click", () => {
    $$(".gb-scene", card).forEach(x => x.classList.toggle("is-active", x === b)); pick(+b.dataset.i);
  }));
}

function build3d() {
  const row = $("#gal-3d");
  MODELS.forEach((m, mi) => {
    const scenes = G.clouds.filter(c => c.model === m);
    if (!scenes.length) return;
    const card = document.createElement("div");
    card.className = "gcard"; card.dataset.model = m;
    card.innerHTML = head(m, scenes, dupLabels(scenes)) + '<div class="gview"></div><div class="gcard-meta"><span class="gm-scene"></span><span class="gm-num"></span>' +
      '<button type="button" class="gv-expand" title="Enlarge" aria-label="Enlarge"><i class="fas fa-expand"></i></button></div>';
    row.appendChild(card);
    const C = { card, scenes, i: 0, view: null };
    cards3d.push(C);
    const start = () => {
      if (C.view || !gl) return;
      C.view = new Split3D($(".gview", card), false);
      C.view.show(scenes[C.i]);
      sweepOnce(card, C.view.dv, 250 + mi * 160);
    };
    new IntersectionObserver((es, io) => es.forEach(e => { if (e.isIntersecting) { io.disconnect(); start(); } }), { rootMargin: "300px" }).observe(card);
    if (!gl) $(".gview", card).innerHTML = '<div class="gv-nogl">WebGL needed</div>';
    bindChips(card, i => { C.i = i; start(); if (C.view) C.view.show(scenes[i]); meta3d(C); });
    $(".gv-expand", card).addEventListener("click", () => openModal(C));
    meta3d(C);
  });
}
function meta3d(C) {
  const S = C.scenes[C.i], card = C.card;
  $(".gm-scene", card).textContent = S.short; $(".gm-scene", card).title = S.dataset + " · " + S.short;
  if (mode === "out") {
    $(".gm-num", card).innerHTML = "IR " + (100 * S.ir.frozen).toFixed(1) + " → <b>" + (100 * S.ir.ours).toFixed(1) + "</b>";
    $(".gb-delta", card).textContent = "+" + (100 * (S.ir.ours - S.ir.frozen)).toFixed(1) + " IR";
  } else {
    $(".gm-num", card).innerHTML = "error " + pct(S.mean_err.frozen) + " → <b>" + pct(S.mean_err.ours) + "</b>";
    $(".gb-delta", card).textContent = "−" + (100 * (1 - S.mean_err.ours / S.mean_err.frozen)).toFixed(0) + "%";
  }
}

function build2d() {
  const row = $("#gal-2d");
  const all = E.pages.flatMap(p => p.scenes);
  MODELS.forEach((m, mi) => {
    const scenes = all.filter(s => s.model === m);
    if (!scenes.length) return;
    const card = document.createElement("div");
    card.className = "gcard"; card.dataset.model = m;
    card.innerHTML = head(m, scenes, dupLabels(scenes)) + '<div class="gview"></div><div class="gcard-meta"><img class="gm-thumb" alt="" loading="lazy"><span class="gm-scene"></span><span class="gm-num"></span>' +
      '<span class="gm-frames"></span></div>';
    row.appendChild(card);
    const C = { card, scenes, i: 0, f: 0, view: new Split2D($(".gview", card)) };
    cards2d.push(C);
    sweepOnce(card, C.view.dv, 250 + mi * 160);
    bindChips(card, i => { C.i = i; C.f = 0; show2d(C); });
    show2d(C);
  });
}
function show2d(C) {
  const S = C.scenes[C.i], F = S.frames[C.f], card = C.card, base = "static/err/" + S.key + "/f" + F.frame + "_";
  const sfx = mode === "out" ? "_out.webp" : ".webp";
  C.view.show(base + "frozen" + sfx, base + "ours" + sfx, S.dataset + " " + S.short + ", frame " + (F.frame + 1));
  $(".gm-thumb", card).src = base + "input.webp"; $(".gm-thumb", card).alt = "Input frame";
  $(".gm-scene", card).textContent = ""; card.title = "";
  $(".gview", card).title = S.dataset + " · " + S.short + ", frame " + (F.frame + 1);
  if (mode === "out") {
    const o = G.err[S.key].frames[F.frame];
    $(".gm-num", card).innerHTML = "outliers " + (100 * o.frozen).toFixed(0) + "% → <b>" + (100 * o.ours).toFixed(0) + "%</b>";
    $(".gb-delta", card).textContent = "−" + (100 * (o.frozen - o.ours)).toFixed(1) + " pts";
  } else {
    $(".gm-num", card).innerHTML = "error " + pct(F.frozen) + " → <b>" + pct(F.ours) + "</b>";
    $(".gb-delta", card).textContent = "−" + (100 * (1 - F.ours / F.frozen)).toFixed(0) + "%";
  }
  const fr = $(".gm-frames", card);
  fr.innerHTML = S.frames.map((f, j) => '<button type="button" class="gm-dot' + (j === C.f ? " is-active" : "") + '" data-j="' + j + '" aria-label="Frame ' + (f.frame + 1) + '" title="Frame ' + (f.frame + 1) + '"></button>').join("");
  $$(".gm-dot", fr).forEach(b => b.addEventListener("click", () => { C.f = +b.dataset.j; show2d(C); }));
}

// ------------------------------------------------------------------ mode + legend
function legend() {
  const L = $("#gal-legend");
  if (mode === "out") L.innerHTML = '<span class="lg"><i style="background:#d63027"></i>≥ 3%</span><span class="lg"><i style="background:#bebebe"></i>&lt; 3%</span>';
  else if (mode === "err") L.innerHTML = '<span class="lg">0</span><span class="lg-bar"></span><span class="lg">p95</span>';
  else L.innerHTML = "";
}
function setMode(m) {
  mode = m;
  $$("#gal-modes button").forEach(b => { const on = b.dataset.m === m; b.classList.toggle("is-active", on); b.setAttribute("aria-selected", on); });
  cards3d.forEach(C => { if (C.view) C.view.recolour(); meta3d(C); });
  cards2d.forEach(show2d);
  if (modal) { modal.view.recolour(); }
  legend();
}

// ------------------------------------------------------------------ enlarged 3D view
let modal = null;
function openModal(C) {
  if (!gl) return;
  const M = $("#gal-modal"); M.hidden = false; document.body.classList.add("gal-open");
  const S = C.scenes[C.i];
  $("#gal-modal-head").innerHTML = '<span class="gb gb-model">' + esc(S.model) + "</span><span>" + esc(S.dataset + " · " + S.short) + "</span>";
  modal = { view: new Split3D($("#gal-modal-view"), true), last: document.activeElement };
  modal.view.show(S);
  requestAnimationFrame(() => M.classList.add("is-on"));
  $("#gal-modal-x").focus();
}
function closeModal() {
  if (!modal) return;
  const M = $("#gal-modal"); M.classList.remove("is-on"); M.hidden = true; document.body.classList.remove("gal-open");
  modal.view.dispose(); if (modal.last) modal.last.focus({ preventScroll: true }); modal = null;
}
$("#gal-modal-x").addEventListener("click", closeModal);
$("#gal-modal").addEventListener("click", e => { if (e.target.id === "gal-modal") closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && modal) closeModal(); });

$$("#gal-modes button").forEach(b => b.addEventListener("click", () => setMode(b.dataset.m)));
build3d(); build2d(); legend();
window.__gallery = { cards3d, cards2d, setMode, get mode() { return mode; }, openModal: i => openModal(cards3d[i]), closeModal, get modal() { return !!modal; } };
