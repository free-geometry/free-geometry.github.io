/* Hero: the real point map of VGGT on a ScanNet++ room (the page's card static/cards/vggt_spp_v45.bin: frozen and Free Geometry
   points of the same pixels, benchmark alignment), red = point error >= 3 % (the paper's inlier-ratio threshold). It loops
   frozen -> Free Geometry and back, turns slowly, and can be dragged. Paused off screen; one still frame (Free Geometry) under
   prefers-reduced-motion. The button in the corner pauses it. */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const G = window.GALLERY, canvas = document.getElementById("hero-cloud"), stage = document.getElementById("hero-stage"), note = document.getElementById("hero-note");
const chipF = document.getElementById("hero-chip-f"), chipO = document.getElementById("hero-chip-o");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const KEY = "vggt_spp_v45";

function webgl() { try { return !!(canvas.getContext("webgl2") || canvas.getContext("webgl")); } catch (e) { return false; } }

async function boot() {
  const S = G && G.clouds.find(c => c.key === KEY);
  if (!S || !canvas || !webgl()) { if (stage) stage.classList.add("no-gl"); return; }
  const buf = await (await fetch(S.file)).arrayBuffer(), n = S.n;
  const u16 = new Uint16Array(buf, 0, n * 6), u8 = new Uint8Array(buf, n * 12);
  const P = k => { const f = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) f[i] = u16[k * n * 3 + i] / 65535 - 0.5; return f; };
  const fl = u8.subarray(n * 5, n * 6), cA = new Float32Array(n * 3), cB = new Float32Array(n * 3), rgb = new Float32Array(n * 3);
  const RED = [214 / 255, 48 / 255, 39 / 255], GREY = [192 / 255, 196 / 255, 202 / 255];
  for (let i = 0; i < n; i++) { const a = fl[i] & 1 ? RED : GREY, b = fl[i] & 2 ? RED : GREY; for (let c = 0; c < 3; c++) { cA[3 * i + c] = a[c]; cB[3 * i + c] = b[c]; rgb[3 * i + c] = u8[3 * i + c] / 255; } }

  THREE.ColorManagement.enabled = false;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1)); renderer.outputColorSpace = THREE.LinearSRGBColorSpace; renderer.setClearColor(0xffffff, 0);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(34, 1, 0.01, 20);
  const g = new THREE.BufferGeometry();
  const A = P(0), B = P(1);
  g.setAttribute("position", new THREE.BufferAttribute(A, 3)); g.setAttribute("pB", new THREE.BufferAttribute(B, 3));
  g.setAttribute("cA", new THREE.BufferAttribute(cA, 3)); g.setAttribute("cB", new THREE.BufferAttribute(cB, 3));
  const mat = new THREE.ShaderMaterial({
    transparent: false,
    uniforms: { uT: { value: reduced ? 1 : 0 }, uSize: { value: 2.9 }, uPR: { value: renderer.getPixelRatio() }, uIn: { value: reduced ? 1 : 0 } },
    vertexShader: `attribute vec3 pB; attribute vec3 cA; attribute vec3 cB; uniform float uT, uSize, uPR, uIn; varying vec3 vC; varying float vA;
      void main() { vec3 p = mix(position, pB, uT);
        // intro: points rise from a flat sheet into the room
        p.z = mix(p.z * 0.0, p.z, smoothstep(0.0, 1.0, uIn));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); gl_PointSize = uSize * uPR; vC = mix(cA, cB, uT); vA = uIn; }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main() { vec2 d = gl_PointCoord - 0.5; if (dot(d, d) > 0.25) discard; gl_FragColor = vec4(vC, 1.0); }`
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false;
  // scene up axis -> world z (the shader's intro flattens along z)
  const up = new THREE.Vector3(...S.up).normalize();
  pts.quaternion.setFromUnitVectors(up, new THREE.Vector3(0, 0, 1));
  const pivot = new THREE.Group(); pivot.add(pts); scene.add(pivot);
  // centre: robust middle of both predictions
  const q = (arr, t) => { const s = Float32Array.from(arr).sort(); return s[Math.floor(t * (s.length - 1))]; };
  const step = Math.max(1, Math.floor(n / 4000)), cs = [[], [], []];
  for (let i = 0; i < n; i += step) for (let c = 0; c < 3; c++) cs[c].push(A[3 * i + c], B[3 * i + c]);
  const ctr = new THREE.Vector3(...cs.map(v => (q(v, .02) + q(v, .98)) / 2)).applyQuaternion(pts.quaternion);
  pts.position.copy(ctr).negate();
  camera.up.set(0, 0, 1); camera.position.set(0.70, -0.57, 0.52); camera.lookAt(0, 0, 0);
  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enableZoom: false, enablePan: false, enableDamping: true, dampingFactor: 0.08, rotateSpeed: 0.7, autoRotate: !reduced, autoRotateSpeed: 0.55 });

  function size() {
    const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = 34; camera.updateProjectionMatrix();
    camera.position.setLength(w / h < 1.25 ? 1.55 : 1.18);   // narrow stage (phone): step back so the whole room fits
  }
  size(); new ResizeObserver(size).observe(stage);

  // loop: hold frozen 1.8 s, morph 1.6 s, hold Free Geometry 2.8 s, morph back 1.6 s
  const seg = [1.8, 1.6, 2.8, 1.6], period = seg.reduce((a, b) => a + b), ease = x => x * x * (3 - 2 * x);
  const tAt = s => { s %= period; if (s < seg[0]) return 0; s -= seg[0]; if (s < seg[1]) return ease(s / seg[1]); s -= seg[1]; if (s < seg[2]) return 1; s -= seg[2]; return 1 - ease(s / seg[3]); };
  let running = !reduced, visible = true, clock = 0, last = null, raf = 0, intro = reduced ? 1 : 0;
  let lastDraw = -1e9;
  function frame(ts) {
    raf = 0;
    if (ts - lastDraw < 31 && running) { raf = requestAnimationFrame(frame); return; }   // ~30 fps is plenty for a slow orbit
    lastDraw = ts;
    const dt = last === null ? 0 : Math.min(0.05, (ts - last) / 1000); last = ts;
    if (running) { clock += dt; intro = Math.min(1, intro + dt / 1.6); }
    const t = reduced ? 1 : intro < 1 ? 0 : tAt(clock - 1.6);
    mat.uniforms.uT.value = t; mat.uniforms.uIn.value = ease(intro);
    controls.autoRotate = running; const moved = controls.update();
    renderer.render(scene, camera);
    chipF.classList.toggle("is-on", t < 0.5); chipO.classList.toggle("is-on", t >= 0.5);
    if ((running || moved) && visible && !document.hidden) raf = requestAnimationFrame(frame);   // idle when paused and still
  }
  const kick = () => { if (!raf) { last = null; raf = requestAnimationFrame(frame); } };
  controls.addEventListener("change", kick);
  new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) kick(); }).observe(stage);
  document.addEventListener("visibilitychange", kick);
  if (!reduced) { note.hidden = false; note.innerHTML = '<i class="fas fa-pause"></i>'; note.setAttribute("aria-label", "Pause the animation"); }
  note.addEventListener("click", () => { running = !running; note.innerHTML = '<i class="fas fa-' + (running ? "pause" : "play") + '"></i>'; kick(); });
  stage.classList.add("is-on");
  kick();
  window.__hero = { get t() { return mat.uniforms.uT.value; }, get running() { return running; } };
}
boot().catch(() => stage && stage.classList.add("no-gl"));
