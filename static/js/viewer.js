/* Side-by-side point-map viewer (three.js). Both panels share one camera. Data: static/pc/<key>.bin from tools/export_assets.py. */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const C = window.CLOUDS;
THREE.ColorManagement.enabled = false;   // vertex colours are display sRGB values; pass them through unchanged
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pct = v => (100 * v).toFixed(1) + "%";

const hosts = { left: $("#pc-left"), right: $("#pc-right") };
let gl = true;
try { const c = document.createElement("canvas"); gl = !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { gl = false; }

const state = { scene: 0, color: "rgb", leftSrc: "frozen", size: 2.5, cams: false, ceiling: false, data: null, started: false, morph: 0, spin: false };
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
// left view in morph mode: a lerp of the frozen and the Free Geometry points (same pixels), recomputed on the CPU
const mix = { src: null, pos: null, col: null };
const camera = new THREE.PerspectiveCamera(50, 16 / 10, 0.001, 50);
const panes = {};
const cache = new Map();

function makePane(name) {
  const host = hosts[name];
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0xffffff, 1);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const geom = new THREE.BufferGeometry();
  const mat = new THREE.PointsMaterial({ size: state.size, sizeAttenuation: false, vertexColors: true });
  const pts = new THREE.Points(geom, mat);
  scene.add(pts);
  const camsObj = new THREE.Group(); camsObj.visible = false; scene.add(camsObj);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.12; controls.screenSpacePanning = true;
  controls.addEventListener("change", () => { syncTargets(controls); requestRender(); });
  return { host, renderer, scene, geom, mat, pts, camsObj, controls };
}
function syncTargets(src) { Object.values(panes).forEach(p => { if (p.controls !== src) p.controls.target.copy(src.target); }); }

function decode(buf, n) {
  const u16 = new Uint16Array(buf, 0, n * 9);
  const pos = k => { const f = new Float32Array(n * 3); const o = k * n * 3; for (let i = 0; i < n * 3; i++) f[i] = u16[o + i] / 65535 - 0.5; return f; };
  const off = n * 9 * 2;
  const col = k => { const u8 = new Uint8Array(buf, off + k * n * 3, n * 3); const f = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) f[i] = u8[i] / 255; return f; };
  return { gt: pos(0), frozen: pos(1), ours: pos(2), rgb: col(0), err_frozen: col(1), err_ours: col(2) };
}

async function load(i) {
  const S = C.scenes[i];
  if (cache.has(S.key)) return cache.get(S.key);
  const r = await fetch(S.file);
  if (!r.ok) throw new Error(S.file + ": " + r.status);
  const d = decode(await r.arrayBuffer(), S.n);
  // as in the supplement's top views: points above the 85th height percentile of the GT (ceiling) can be hidden
  const up = S.up, n = S.n, h = new Float32Array(n);
  for (let i = 0; i < n; i++) h[i] = d.gt[3 * i] * up[0] + d.gt[3 * i + 1] * up[1] + d.gt[3 * i + 2] * up[2];
  const thr = Float32Array.from(h).sort()[Math.floor(0.85 * (n - 1))];
  const keep = []; for (let i = 0; i < n; i++) if (h[i] <= thr) keep.push(i);
  const sub = a => { const o = new Float32Array(keep.length * 3); keep.forEach((k, j) => { o[3 * j] = a[3 * k]; o[3 * j + 1] = a[3 * k + 1]; o[3 * j + 2] = a[3 * k + 2]; }); return o; };
  const cut = {}; Object.keys(d).forEach(k => cut[k] = sub(d[k]));
  const both = { full: d, cut };
  cache.set(S.key, both);
  return both;
}

function frustum(cam, size) {
  const R = cam.R, t = new THREE.Vector3(cam.t[0] - 0.5, cam.t[1] - 0.5, cam.t[2] - 0.5);
  const ax = (c) => new THREE.Vector3(R[c], R[3 + c], R[6 + c]);   // columns of c2w rotation (OpenCV: x right, y down, z forward)
  const x = ax(0), y = ax(1), z = ax(2);
  const w = size * 0.7, h = size * 0.5, f = size;
  const corner = (sx, sy) => t.clone().add(z.clone().multiplyScalar(f)).add(x.clone().multiplyScalar(sx * w)).add(y.clone().multiplyScalar(sy * h));
  const c = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
  const pts = [t, c[0], t, c[1], t, c[2], t, c[3], c[0], c[1], c[1], c[2], c[2], c[3], c[3], c[0]];
  return new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x2f8f7a }));
}

function apply() {
  const S = C.scenes[state.scene];
  if (!state.data) return;
  const d = state.ceiling ? state.data.full : state.data.cut;
  const set = (p, posKey, errKey) => {
    p.geom.setAttribute("position", new THREE.BufferAttribute(d[posKey], 3));
    p.geom.setAttribute("color", new THREE.BufferAttribute(state.color === "err" && errKey ? d[errKey] : d.rgb, 3));
    p.geom.computeBoundingSphere();
    p.mat.size = state.size;
  };
  const leftGT = state.leftSrc === "gt";
  if (leftGT) set(panes.left, "gt", null);
  else {
    const key = d === state.data.full ? "full" : "cut";
    if (mix.src !== key + state.color + state.scene) {
      mix.src = key + state.color + state.scene;
      mix.pos = new THREE.BufferAttribute(new Float32Array(d.frozen.length), 3).setUsage(THREE.DynamicDrawUsage);
      mix.col = new THREE.BufferAttribute(new Float32Array(d.frozen.length), 3).setUsage(THREE.DynamicDrawUsage);
      mix.d = d;
    }
    panes.left.geom.setAttribute("position", mix.pos); panes.left.geom.setAttribute("color", mix.col);
    panes.left.mat.size = state.size;
    morphUpdate(); panes.left.geom.computeBoundingSphere();
  }
  set(panes.right, "ours", "err_ours");
  $("#morph-row").classList.toggle("is-off", leftGT);
  morphLabel();
  const parts = [esc(S.model) + " on " + esc(S.dataset) + " <i>" + esc(S.short) + "</i>",
                 "mean point error " + pct(S.mean_err.frozen) + " → " + pct(S.mean_err.ours),
                 S.n.toLocaleString() + " of " + S.n_total.toLocaleString() + " points" + (state.ceiling ? "" : ", highest 15% hidden (ceiling)")];
  if (state.color === "err") parts.push("error colour 0 to " + (100 * S.emax).toFixed(0) + "% (turbo)" + (leftGT ? "; ground truth keeps its colour" : ""));
  $("#pc-note").innerHTML = parts.join(" · ");
  Object.values(panes).forEach(p => {
    p.camsObj.clear();
    S.cams.forEach(c => p.camsObj.add(frustum(c, 0.018)));
    p.camsObj.visible = state.cams;
  });
  requestRender();
}

function morphUpdate() {
  if (!mix.pos || state.leftSrc === "gt") return;
  const d = mix.d, t = state.morph, err = state.color === "err";
  const a = d.frozen, b = d.ours, ca = err ? d.err_frozen : d.rgb, cb = err ? d.err_ours : d.rgb;
  const P = mix.pos.array, Q = mix.col.array;
  for (let i = 0; i < P.length; i++) { P[i] = a[i] + (b[i] - a[i]) * t; Q[i] = ca[i] + (cb[i] - ca[i]) * t; }
  mix.pos.needsUpdate = true; mix.col.needsUpdate = true;
  morphLabel(); requestRender();
}
function morphLabel() {
  const L = $("#pc-left-label"), t = state.morph;
  if (state.leftSrc === "gt") { L.textContent = "Ground truth"; L.style.background = "#1f2937"; return; }
  L.textContent = t <= 0.001 ? "Frozen" : t >= 0.999 ? "Free Geometry (morphed)" : "Frozen → Free Geometry " + Math.round(t * 100) + "%";
  L.style.background = t <= 0.001 ? "" : "linear-gradient(90deg, #555 " + (100 - 100 * t).toFixed(0) + "%, #2f8f7a)";
  $("#pc-morph").value = t;
}
// play: frozen -> Free Geometry -> frozen
let play = null;
function playMorph() {
  if (play) { cancelAnimationFrame(play.raf); play = null; playBtn(false); return; }
  if (state.leftSrc === "gt") return;
  const t0 = performance.now(), from = state.morph, A = 1700, Hd = 700;
  play = { raf: 0 }; playBtn(true);
  const step = now => {
    const s = now - t0;
    let t;
    if (s < A) { const k = s / A; t = from + (1 - from) * k * k * (3 - 2 * k); }
    else if (s < A + Hd) t = 1;
    else if (s < 2 * A + Hd) { const k = (s - A - Hd) / A; t = 1 - k * k * (3 - 2 * k); }
    else { state.morph = 0; morphUpdate(); play = null; playBtn(false); return; }
    state.morph = t; morphUpdate(); play.raf = requestAnimationFrame(step);
  };
  play.raf = requestAnimationFrame(step);
}
function playBtn(on) { const b = $("#pc-play"); $("i", b).className = on ? "fas fa-pause" : "fas fa-play"; }

function resetView() {
  const S = C.scenes[state.scene];
  const up = new THREE.Vector3(...S.up).normalize();
  // look from above, slightly tilted, like the paper's top views
  let side = new THREE.Vector3(1, 0, 0); if (Math.abs(side.dot(up)) > 0.9) side.set(0, 1, 0);
  side.sub(up.clone().multiplyScalar(side.dot(up))).normalize();
  camera.up.copy(up);
  camera.position.copy(up.clone().multiplyScalar(0.82).add(side.clone().multiplyScalar(-0.42)));
  Object.values(panes).forEach(p => { p.controls.target.set(0, 0, 0); p.controls.update(); });
  requestRender();
}
function setSpin(on) {
  state.spin = on;
  if (panes.left) { panes.left.controls.autoRotate = on; panes.left.controls.autoRotateSpeed = 1.4; }
  const b = $("#pc-spin"); b.classList.toggle("is-dark", on);
  requestRender();
}

let pending = false;
function requestRender() { if (!pending) { pending = true; requestAnimationFrame(renderAll); } }
function renderAll() {
  pending = false;
  let moving = false;
  Object.values(panes).forEach(p => { if (p.controls.update()) moving = true; });
  Object.values(panes).forEach(p => p.renderer.render(p.scene, camera));
  if (moving) requestRender();
}
function resize() {
  Object.values(panes).forEach(p => {
    const w = p.host.clientWidth, h = p.host.clientHeight;
    if (!w || !h) return;
    p.renderer.setSize(w, h, false);
    camera.aspect = w / h;
  });
  camera.updateProjectionMatrix();
  requestRender();
}

async function selectScene(i) {
  state.scene = i;
  $$("#pc-scenes .scene-chip").forEach((b, j) => b.classList.toggle("is-active", j === i));
  Object.values(hosts).forEach(h => { const o = $(".viewer-overlay", h); if (o) { o.hidden = false; o.textContent = "Loading…"; } });
  try {
    state.data = await load(i);
    Object.values(hosts).forEach(h => { const o = $(".viewer-overlay", h); if (o) o.hidden = true; });
    apply(); resetView();
    if (!state.autoplayed && !reduced) { state.autoplayed = true; setTimeout(() => { if (!play && state.morph === 0) playMorph(); }, 900); }
  } catch (e) {
    Object.values(hosts).forEach(h => { const o = $(".viewer-overlay", h); if (o) o.textContent = "Could not load the point cloud (" + e.message + ")"; });
  }
}

function start() {
  if (state.started) return;
  state.started = true;
  if (!gl) { Object.values(hosts).forEach(h => { $(".viewer-overlay", h).textContent = "[Requires WebGL support]"; }); return; }
  panes.left = makePane("left"); panes.right = makePane("right");
  resize();
  new ResizeObserver(resize).observe(hosts.left);
  selectScene(0);
}

// scene chips
$("#pc-scenes").innerHTML = C.scenes.map((s, i) => '<button class="scene-chip' + (i ? "" : " is-active") + '" data-i="' + i + '"><b>' + esc(s.model) + " · " + esc(s.dataset) + " " + esc(s.short) +
  "</b><small>" + pct(s.mean_err.frozen) + " → " + pct(s.mean_err.ours) + "</small></button>").join("");
$$("#pc-scenes .scene-chip").forEach(b => b.addEventListener("click", () => { start(); selectScene(+b.dataset.i); }));
const seg = (host, key, attr) => $$("button", host).forEach(b => b.addEventListener("click", () => {
  $$("button", host).forEach(x => { const on = x === b; x.classList.toggle("is-selected", on); x.classList.toggle("is-dark", on); });
  state[key] = b.dataset[attr]; apply();
}));
seg($("#pc-color"), "color", "c");
seg($("#pc-leftsrc"), "leftSrc", "s");
$("#pc-cams").addEventListener("click", e => { state.cams = !state.cams; e.currentTarget.classList.toggle("is-dark", state.cams); e.currentTarget.textContent = state.cams ? "Hide cameras" : "Show cameras"; apply(); });
$("#pc-reset").addEventListener("click", resetView);
$("#pc-ceil").addEventListener("click", e => { state.ceiling = !state.ceiling; e.currentTarget.classList.toggle("is-dark", state.ceiling); e.currentTarget.textContent = state.ceiling ? "Hide ceiling" : "Show ceiling"; apply(); });
$("#pc-size").addEventListener("input", e => { state.size = +e.target.value; apply(); });
$("#pc-morph").addEventListener("input", e => { if (play) playMorph(); state.morph = +e.target.value; morphUpdate(); });
$("#pc-play").addEventListener("click", () => { start(); playMorph(); });
$("#pc-spin").addEventListener("click", () => { start(); setSpin(!state.spin); });

// load only when the section comes near the viewport (keeps the first load small)
new IntersectionObserver((es, io) => es.forEach(e => { if (e.isIntersecting) { io.disconnect(); start(); } }), { rootMargin: "300px" }).observe($("#pointclouds"));
window.__pcViewer = { state, panes, camera, playMorph, setSpin, selectScene: i => { start(); selectScene(i); } };
