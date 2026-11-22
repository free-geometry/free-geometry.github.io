/* Scene studio: one scene, four predictions of the same pixels (frozen, teacher = 16-pass consensus of the frozen model,
   Free Geometry, ground truth), with their cameras; a stage slider morphs the point map and the cameras between them.
   A frame slider walks the 32 frames: the frame's points and camera light up in 3D, its error map shows on the right,
   and the timeline plots the per-frame point and pose error. Click the frame to probe a pixel: its four 3D positions
   are drawn and linked. Data: static/data/studio.js + static/studio/* (tools/export_assets.py studio). */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const D = window.STUDIO, TURBO = window.GALLERY ? window.GALLERY.turbo : null;
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const STAGES = ["F", "T", "O", "G"], NAMES = { F: "Frozen", T: "Teacher", O: "Ours", G: "GT" };
const SCOL = { F: "#6b7280", T: "#d9733f", O: "#2f8f7a", G: "#111827" };
const pct = v => (100 * v).toFixed(1) + "%";
THREE.ColorManagement.enabled = false;
const host = $("#studio");
if (D && host && TURBO) init();

function init() {
  const view = $("#st-view"), frameCv = $("#st-frame"), tl = $("#st-timeline");
  let gl = true;
  try { const c = document.createElement("canvas"); gl = !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { gl = false; }
  const st = { si: 0, t: 0, frame: 0, mode: "out", cams: true, hl: true, probe: null, data: null, plot: "err" };

  // ------------------------------------------------ chips
  $("#st-scenes").innerHTML = D.scenes.map((S, i) => '<button type="button" class="gb gb-scene' + (i ? "" : " is-active") + '" data-i="' + i + '">' +
    esc(S.model) + " · " + esc(S.dataset) + "</button>").join("");
  $$("#st-scenes button").forEach(b => b.addEventListener("click", () => { $$("#st-scenes button").forEach(x => x.classList.toggle("is-active", x === b)); load(+b.dataset.i); }));
  $$("#st-modes button").forEach(b => b.addEventListener("click", () => {
    st.mode = b.dataset.m; $$("#st-modes button").forEach(x => x.classList.toggle("is-active", x === b)); recolour(); drawFrame();
  }));
  $$("#st-stops button").forEach((b, i) => b.addEventListener("click", () => animateTo(i)));
  $("#st-t").addEventListener("input", e => { stopPlay(); setT(+e.target.value); });
  $("#st-f").addEventListener("input", e => setFrame(+e.target.value - 1));
  $("#st-play").addEventListener("click", togglePlay);
  $("#st-cams").addEventListener("click", e => { st.cams = !st.cams; e.currentTarget.classList.toggle("is-on", st.cams); camsObj.visible = st.cams; req(); });

  // ------------------------------------------------ three.js
  let renderer, scene, camera, controls, pts, mat, camsObj, probeObj;
  if (gl) {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1)); renderer.outputColorSpace = THREE.LinearSRGBColorSpace; renderer.setClearColor(0xffffff, 1);
    view.prepend(renderer.domElement);
    scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(40, 1, 0.01, 20);
    controls = new OrbitControls(camera, renderer.domElement);
    Object.assign(controls, { enableDamping: true, dampingFactor: 0.12, screenSpacePanning: true });
    controls.addEventListener("change", req);
    mat = new THREE.ShaderMaterial({
      uniforms: { uSize: { value: 2.6 }, uPR: { value: renderer.getPixelRatio() }, uFrame: { value: 0 }, uHL: { value: 0 } },
      vertexShader: `attribute vec3 color; attribute float aFrame; uniform float uSize, uPR, uFrame, uHL; varying vec3 vC;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          float on = 1.0 - step(0.5, abs(aFrame - uFrame));
          gl_PointSize = uSize * uPR * (1.0 + 0.6 * on * uHL);
          vC = mix(color, vec3(1.0), (1.0 - on) * uHL * 0.5); }`,
      fragmentShader: `varying vec3 vC; void main() { vec2 d = gl_PointCoord - 0.5; if (dot(d, d) > 0.25) discard; gl_FragColor = vec4(vC, 1.0); }`
    });
    pts = new THREE.Points(new THREE.BufferGeometry(), mat); scene.add(pts);
    camsObj = new THREE.Group(); scene.add(camsObj);
    probeObj = new THREE.Group(); scene.add(probeObj);
    new ResizeObserver(resize).observe(view);
    new IntersectionObserver(es => { st.visible = es[0].isIntersecting; if (st.visible) req(); }).observe(view);
  } else view.insertAdjacentHTML("beforeend", '<div class="gv-nogl">WebGL needed</div>');
  let pending = false;
  function req() { if (gl && !pending && st.visible !== false) { pending = true; requestAnimationFrame(draw); } }
  function draw() { pending = false; const mv = controls.update(); renderer.render(scene, camera); if (mv) req(); }
  function resize() { const w = view.clientWidth, h = view.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); req(); }

  // ------------------------------------------------ data
  const cache = new Map();
  function img(src) { return new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => no(new Error(src)); im.src = src; }); }
  function pixels(im) { const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const x = c.getContext("2d"); x.drawImage(im, 0, 0); return x.getImageData(0, 0, c.width, c.height); }
  async function fetchScene(S) {
    if (cache.has(S.key)) return cache.get(S.key);
    const p = (async () => {
      const base = "static/studio/" + S.key;
      const [buf, iF, iT, iO, iR] = await Promise.all([fetch(base + ".bin").then(r => { if (!r.ok) throw new Error(base + ".bin " + r.status); return r.arrayBuffer(); }),
        img(base + "_F.webp"), img(base + "_T.webp"), img(base + "_O.webp"), img(base + "_rgb.webp")]);
      const n = S.n, u16 = new Uint16Array(buf, 0, n * 12), u8 = new Uint8Array(buf, n * 24);
      const pos = {}; STAGES.forEach((k, j) => { const o = ["G", "F", "T", "O"].indexOf(k) * n * 3, f = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) f[i] = u16[o + i] / 65535 - 0.5; pos[k] = f; });
      const rgb = u8.subarray(0, n * 3), frame = u8.subarray(n * 3, n * 4);
      const uv = new Uint16Array(buf.slice(n * 28, n * 32));
      const err = { F: new Uint8Array(buf, n * 32, n), T: new Uint8Array(buf, n * 33, n), O: new Uint8Array(buf, n * 34, n) };
      const byFrame = Array.from({ length: S.frames }, () => []); for (let i = 0; i < n; i++) byFrame[frame[i]].push(i);
      return { n, pos, rgb, frame, uv, err, byFrame, spr: { F: pixels(iF), T: pixels(iT), O: pixels(iO), R: pixels(iR) } };
    })();
    cache.set(S.key, p); p.catch(() => cache.delete(S.key));
    return p;
  }
  async function load(i) {
    st.si = i; const S = D.scenes[i]; host.classList.add("is-loading");
    const d = await fetchScene(S); if (st.si !== i) return;
    st.data = d; st.probe = null; st.frame = Math.min(st.frame, S.frames - 1);
    $("#st-f").max = S.frames; $("#st-f").value = st.frame + 1;
    frameCv.width = S.w2; frameCv.height = S.h2;
    if (gl) {
      const g = pts.geometry;
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(d.n * 3), 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(d.n * 3), 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute("aFrame", new THREE.BufferAttribute(Float32Array.from(d.frame), 1));
      buildCams(); setT(st.t, true); resetView(); probeObj.clear();
    }
    drawFrame(); host.classList.remove("is-loading");
  }

  // ------------------------------------------------ stage morph
  const seg = t => { const a = Math.min(2, Math.floor(t)), k = t - a; return [STAGES[a], STAGES[a + 1], k]; };
  function setT(t, force) {
    st.t = Math.max(0, Math.min(3, t)); $("#st-t").value = st.t;
    const near = Math.round(st.t);
    $$("#st-stops button").forEach((b, i) => b.classList.toggle("is-active", i === near));
    $("#st-view").dataset.stage = STAGES[near];
    if (!gl || !st.data) return;
    const [a, b, k] = seg(st.t), A = st.data.pos[a], B = st.data.pos[b], P = pts.geometry.attributes.position.array;
    for (let i = 0; i < P.length; i++) P[i] = A[i] + (B[i] - A[i]) * k;
    pts.geometry.attributes.position.needsUpdate = true;
    if (force) pts.geometry.computeBoundingSphere();
    recolour(); updateCams(); updateProbe();
    if (Math.round(st.t * 1000) % 1000 === 0 || force) drawFrame();
  }
  function errAt(stage, i) { return stage === "G" ? 0 : st.data.err[stage][i]; }
  function recolour() {
    if (!gl || !st.data) return;
    const d = st.data, C = pts.geometry.attributes.color.array, [a, b, k] = seg(st.t), S = D.scenes[st.si];
    const thrQ = D.thr / S.emax * 255;
    for (let i = 0; i < d.n; i++) {
      let r, g, bl;
      if (st.mode === "rgb") { r = d.rgb[3 * i] / 255; g = d.rgb[3 * i + 1] / 255; bl = d.rgb[3 * i + 2] / 255; }
      else {
        const q = errAt(a, i) * (1 - k) + errAt(b, i) * k;
        if (st.mode === "err") { const j = 3 * Math.round(q); r = TURBO[j] / 255; g = TURBO[j + 1] / 255; bl = TURBO[j + 2] / 255; }
        else if (q >= thrQ) { r = 214 / 255; g = 48 / 255; bl = 39 / 255; } else { r = g = bl = 190 / 255; }
      }
      C[3 * i] = r; C[3 * i + 1] = g; C[3 * i + 2] = bl;
    }
    pts.geometry.attributes.color.needsUpdate = true; req();
  }
  let anim = null;
  function animateTo(target) {
    stopPlay();
    if (reduced) { setT(target); return; }
    const from = st.t, t0 = performance.now(), dur = 380 + 260 * Math.abs(target - from);
    cancelAnimationFrame(anim);
    const f = now => { const x = Math.min(1, (now - t0) / dur), e = x * x * (3 - 2 * x); setT(from + (target - from) * e); if (x < 1) anim = requestAnimationFrame(f); else drawFrame(); };
    anim = requestAnimationFrame(f);
  }
  // play: walk the frames (and morph frozen -> ours once per loop)
  let play = null;
  function togglePlay() { play ? stopPlay() : startPlay(); }
  function startPlay() {
    if (!st.data) return;
    $("#st-play i").className = "fas fa-pause";
    let last = performance.now();
    const f = now => { if (now - last > 260) { last = now; setFrame((st.frame + 1) % D.scenes[st.si].frames); } play = requestAnimationFrame(f); };
    play = requestAnimationFrame(f);
  }
  function stopPlay() { if (play) cancelAnimationFrame(play); play = null; const i = $("#st-play i"); if (i) i.className = "fas fa-play"; }

  // ------------------------------------------------ cameras
  function frustum(c, sz) {
    const t = new THREE.Vector3(c[0], c[1], c[2]), R = c.slice(3);
    const ax = j => new THREE.Vector3(R[j], R[3 + j], R[6 + j]);
    const x = ax(0), y = ax(1), z = ax(2), w = sz * 0.7, h = sz * 0.5;
    const k = (sx, sy) => t.clone().add(z.clone().multiplyScalar(sz)).add(x.clone().multiplyScalar(sx * w)).add(y.clone().multiplyScalar(sy * h));
    const q = [k(-1, -1), k(1, -1), k(1, 1), k(-1, 1)];
    return [t, q[0], t, q[1], t, q[2], t, q[3], q[0], q[1], q[1], q[2], q[2], q[3], q[3], q[0]];
  }
  let camLines = null, camGT = null, camCur = null;
  function buildCams() {
    camsObj.clear();
    const S = D.scenes[st.si];
    const mkLines = (col, op) => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(S.frames * 16 * 3), 3));
      return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: col, transparent: op < 1, opacity: op })); };
    camGT = mkLines(0x111827, 0.28); camLines = mkLines(0x2f8f7a, 1);
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
    camCur = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xd63027 }));
    camsObj.add(camGT, camLines, camCur); camsObj.visible = st.cams;
    fill(camGT, S.cams.G);
  }
  const CSZ = 0.035;
  function fill(obj, list) {
    const a = obj.geometry.attributes.position.array; let o = 0;
    list.forEach(c => frustum(c, CSZ).forEach(v => { a[o++] = v.x; a[o++] = v.y; a[o++] = v.z; }));
    obj.geometry.attributes.position.needsUpdate = true; obj.geometry.computeBoundingSphere();
  }
  function camsAt() {
    const S = D.scenes[st.si], [a, b, k] = seg(st.t), A = S.cams[a], B = S.cams[b];
    return A.map((ca, i) => { const cb = B[i], c = ca.map((v, j) => v + (cb[j] - v) * k);
      for (let j = 0; j < 3; j++) { const n = Math.hypot(c[3 + j], c[6 + j], c[9 + j]) || 1; c[3 + j] /= n; c[6 + j] /= n; c[9 + j] /= n; }
      return c; });
  }
  function updateCams() {
    if (!camLines) return;
    const cs = camsAt(), stg = STAGES[Math.round(st.t)];
    camLines.material.color.set(SCOL[stg] === "#111827" ? 0x111827 : new THREE.Color(SCOL[stg]));
    fill(camLines, cs); fill(camCur, [cs[st.frame]]);
    camGT.visible = st.t < 2.999; req();
  }

  // ------------------------------------------------ frames, 2D panel, probe
  function setFrame(f) {
    st.frame = f; $("#st-f").value = f + 1; $("#st-fnum").textContent = (f + 1) + " / " + D.scenes[st.si].frames;
    if (gl) { mat.uniforms.uFrame.value = f; updateCams(); flash(); }
    drawFrame(); req();
  }
  let hlT = 0;
  function flash() {   // the frame's points stand out while frames change, then the whole cloud returns
    mat.uniforms.uHL.value = 1; clearTimeout(hlT);
    hlT = setTimeout(function fade() { if (play) { hlT = setTimeout(fade, 600); return; }
      const t0 = performance.now(), f = now => { const k = Math.min(1, (now - t0) / 500); mat.uniforms.uHL.value = 1 - k; req(); if (k < 1) requestAnimationFrame(f); };
      reduced ? (mat.uniforms.uHL.value = 0, req()) : requestAnimationFrame(f); }, 1800);
  }
  function drawFrame() {
    if (!st.data) return;
    const S = D.scenes[st.si], d = st.data, x = frameCv.getContext("2d"), w = S.w2, h = S.h2;
    const r = Math.floor(st.frame / S.cols), c = st.frame % S.cols, stg = STAGES[Math.round(st.t)];
    const src = st.mode === "rgb" || stg === "G" ? d.spr.R : d.spr[stg], out = x.createImageData(w, h), O = out.data, I = src.data, SW = src.width;
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const s = ((r * h + yy) * SW + c * w + xx) * 4, t = (yy * w + xx) * 4;
      if (src === d.spr.R) { O[t] = I[s]; O[t + 1] = I[s + 1]; O[t + 2] = I[s + 2]; }
      else if (I[s] === 0) { O[t] = O[t + 1] = O[t + 2] = 255; }
      else if (st.mode === "err") { const j = 3 * Math.round((I[s] - 1) / 254 * 255); O[t] = TURBO[j]; O[t + 1] = TURBO[j + 1]; O[t + 2] = TURBO[j + 2]; }
      else if (I[s + 1] > 127) { O[t] = 214; O[t + 1] = 48; O[t + 2] = 39; } else { O[t] = O[t + 1] = O[t + 2] = 190; }
      O[t + 3] = 255;
    }
    x.putImageData(out, 0, 0);
    $("#st-ftag").textContent = st.mode === "rgb" || stg === "G" ? "Input" : NAMES[stg];
    if (st.probe != null && d.frame[st.probe] === st.frame) {
      const u = d.uv[2 * st.probe] / 2, v = d.uv[2 * st.probe + 1] / 2;
      x.lineWidth = 2; x.strokeStyle = "#fff"; x.beginPath(); x.arc(u, v, 7, 0, 7); x.stroke(); x.strokeStyle = "#111"; x.lineWidth = 1; x.beginPath(); x.arc(u, v, 8.5, 0, 7); x.stroke();
    }
  }
  frameCv.addEventListener("click", e => {
    if (!st.data) return;
    const S = D.scenes[st.si], rc = frameCv.getBoundingClientRect(), u = (e.clientX - rc.left) / rc.width * S.W, v = (e.clientY - rc.top) / rc.height * S.H;
    let best = -1, bd = 1e9;
    st.data.byFrame[st.frame].forEach(i => { const du = st.data.uv[2 * i] - u, dv = st.data.uv[2 * i + 1] - v, dd = du * du + dv * dv; if (dd < bd) { bd = dd; best = i; } });
    if (best < 0 || bd > 30 * 30) { st.probe = null; probeObj && probeObj.clear(); $("#st-probe").innerHTML = ""; drawFrame(); req(); return; }
    st.probe = best; updateProbe(true); drawFrame();
  });
  function updateProbe(focus) {
    if (!st.data) return;
    const S = D.scenes[st.si], i = st.probe, out = $("#st-probe");
    if (i == null) { out.innerHTML = ""; if (probeObj) probeObj.clear(); return; }
    out.innerHTML = STAGES.map(k => '<span class="st-pv"><i style="background:' + SCOL[k] + '"></i>' + NAMES[k] + "</span>").join("");
    if (!gl) return;
    probeObj.clear();
    const P = k => new THREE.Vector3(st.data.pos[k][3 * i], st.data.pos[k][3 * i + 1], st.data.pos[k][3 * i + 2]);
    const line = new THREE.BufferGeometry().setFromPoints(STAGES.map(P));
    probeObj.add(new THREE.Line(line, new THREE.LineBasicMaterial({ color: 0x111827 })));
    STAGES.forEach(k => { const s = new THREE.Mesh(new THREE.SphereGeometry(0.013, 14, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(SCOL[k]) })); s.position.copy(P(k)); probeObj.add(s); });
    const cur = pts.geometry.attributes.position.array, m = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 12), new THREE.MeshBasicMaterial({ color: 0xd63027, transparent: true, opacity: 0.85 }));
    m.position.set(cur[3 * i], cur[3 * i + 1], cur[3 * i + 2]); probeObj.add(m);
    if (focus) glide(P("G"));
    req();
  }
  function glide(p) {   // move the orbit target to the probed point
    if (reduced) { controls.target.copy(p); req(); return; }
    const a = controls.target.clone(), t0 = performance.now();
    const f = now => { const k = Math.min(1, (now - t0) / 500), e = k * k * (3 - 2 * k); controls.target.lerpVectors(a, p, e); req(); if (k < 1) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }
  function resetView() {
    const S = D.scenes[st.si], u = new THREE.Vector3(...S.up).normalize();
    let s1 = new THREE.Vector3(1, 0, 0); if (Math.abs(s1.dot(u)) > 0.9) s1.set(0, 1, 0);
    s1.sub(u.clone().multiplyScalar(s1.dot(u))).normalize(); const s2 = new THREE.Vector3().crossVectors(u, s1);
    camera.up.copy(u);
    camera.position.copy(u.clone().multiplyScalar(0.9).add(s1.multiplyScalar(-0.8)).add(s2.multiplyScalar(0.4)).normalize().multiplyScalar(1.25));
    controls.target.set(0, 0, 0); controls.update(); req();
  }
  $("#st-reset").addEventListener("click", () => gl && resetView());

  // ------------------------------------------------ start when near
  new IntersectionObserver((es, io) => es.forEach(e => { if (e.isIntersecting) { io.disconnect(); load(0).then(() => { setFrame(0); if (gl) { clearTimeout(hlT); mat.uniforms.uHL.value = 0; req(); } }); } }), { rootMargin: "400px" }).observe(host);
  window.__studio = { st, load, setT, setFrame, animateTo, probeAt: (fx, fy) => frameCv.dispatchEvent(new MouseEvent("click", { clientX: fx, clientY: fy })) };
}
