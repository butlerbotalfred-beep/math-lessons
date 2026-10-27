// The 3D side of the lesson world: a blocky path seen from behind Steve, signposts along it, coins, and Steve himself
// built from blocks so his arms and legs can swing as he walks. world.js owns the lesson logic and calls into this.
import * as THREE from "./three.module.min.js";

const SP = 12, D0 = 10, STAND = 3.4, SPEED = 3.4;   // sign spacing, first sign, where Steve stops before a sign, blocks/s
const signD = i => D0 + i * SP;
const standD = i => signD(i) - STAND;
const pathX = d => 2.2 * Math.sin(d * 0.07);
const slope = d => 2.2 * 0.07 * Math.cos(d * 0.07);

// ---- pixel textures, drawn on tiny canvases so they stay crisp and blocky ----
function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function tex(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function speckle(base, spots, seed) {
  return tex(16, 16, (g) => {
    const r = rng(seed); g.fillStyle = base; g.fillRect(0, 0, 16, 16);
    for (let k = 0; k < 90; k++) { g.fillStyle = spots[Math.floor(r() * spots.length)]; g.fillRect(Math.floor(r() * 16), Math.floor(r() * 16), 1, 1); }
  });
}
const lam = (opts) => new THREE.MeshLambertMaterial(opts);

function makeMaterials() {
  const grassTop = speckle("#5fbf3f", ["#4fae34", "#6fcf4a", "#58b83a", "#7ad653"], 3);
  const dirt = speckle("#8b5a2b", ["#7a4c22", "#9c6a36", "#6e4320"], 5);
  const grassSide = tex(16, 16, (g) => {
    const r = rng(9); g.fillStyle = "#8b5a2b"; g.fillRect(0, 0, 16, 16);
    for (let k = 0; k < 70; k++) { g.fillStyle = ["#7a4c22", "#9c6a36"][k % 2]; g.fillRect(Math.floor(r() * 16), Math.floor(r() * 16), 1, 1); }
    g.fillStyle = "#5fbf3f"; g.fillRect(0, 0, 16, 4);
    for (let x = 0; x < 16; x++) if (r() > 0.5) g.fillRect(x, 4, 1, 1 + Math.floor(r() * 2));
  });
  const path = speckle("#d1b17a", ["#c19f66", "#ddc08c", "#b8955c", "#e4c995"], 11);
  const log = tex(16, 16, (g) => { g.fillStyle = "#6e4a27"; g.fillRect(0, 0, 16, 16); g.fillStyle = "#5a3b1e"; for (let x = 1; x < 16; x += 3) g.fillRect(x, 0, 1, 16); });
  const leaves = tex(16, 16, (g) => {
    const r = rng(13); g.fillStyle = "#3f9a32"; g.fillRect(0, 0, 16, 16);
    for (let k = 0; k < 110; k++) { g.fillStyle = ["#2f7d27", "#52b043", "#36892c"][k % 3]; g.fillRect(Math.floor(r() * 16), Math.floor(r() * 16), 1, 1); }
  });
  const stone = speckle("#9a9a9a", ["#8a8a8a", "#ababab", "#7c7c7c"], 17);
  const side = lam({ map: grassSide }), top = lam({ map: grassTop }), bot = lam({ map: dirt });
  return {
    grass: [side, side, top, bot, side, side],
    dirt: lam({ map: dirt }),
    path: lam({ map: path }),
    log: lam({ map: log }),
    leaves: lam({ map: leaves }),
    stone: lam({ map: stone }),
    water: lam({ color: 0x3aa0ff, transparent: true, opacity: 0.8 }),
    cloud: lam({ color: 0xffffff, emissive: 0x666666 }),
  };
}

// ---- the world's blocks ----
function buildTerrain(scene, end) {
  const M = makeMaterials();
  const lists = { grass: [], dirt: [], path: [], log: [], leaves: [], stone: [], water: [] };
  const r = rng(42);
  const height = (x, d, rel) => {
    if (Math.abs(rel) < 4.5) return 0;
    const h = Math.sin(x * 0.35 + d * 0.21) * 1.3 + Math.sin(d * 0.13 - x * 0.17) * 1.6 + (Math.abs(rel) - 4.5) * 0.45;
    return Math.max(0, Math.min(6, Math.round(h)));
  };
  for (let d = -10; d <= end; d++) {
    const px = pathX(d);
    for (let x = -16; x <= 16; x++) {
      const rel = x - px;
      const pond = rel < -5.5 && Math.sin(d * 0.05 + 1) > 0.45;
      if (Math.abs(rel) <= 1.3) { lists.path.push([x, -0.5, -d]); continue; }
      if (pond) { lists.water.push([x, -0.62, -d]); lists.dirt.push([x, -1.5, -d]); continue; }
      const h = height(x, d, rel);
      for (let y = Math.max(0, h - 2); y < h; y++) lists[y < h - 1 ? "dirt" : "stone"].push([x, y - 0.5, -d]);
      if (h > 0 && h >= 3 && r() < 0.3) lists.stone.push([x, h - 0.5, -d]); else lists.grass.push([x, h - 0.5, -d]);
      if (Math.abs(rel) > 5 && Math.abs(rel) < 12 && h <= 2 && r() < 0.025) {
        const th = 3 + Math.floor(r() * 2), base = h;
        for (let k = 0; k < th; k++) lists.log.push([x, base + k + 0.5, -d]);
        for (let lx = -1; lx <= 1; lx++) for (let lz = -1; lz <= 1; lz++) for (let ly = 0; ly < 2; ly++)
          if (lx || lz || ly) lists.leaves.push([x + lx, base + th + ly - 0.5, -d + lz]);
        lists.leaves.push([x, base + th + 1.5, -d]);
      }
    }
  }
  const box = new THREE.BoxGeometry(1, 1, 1), m4 = new THREE.Matrix4();
  for (const [k, list] of Object.entries(lists)) {
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(box, M[k], list.length);
    list.forEach((p, i) => { m4.makeTranslation(p[0], p[1], p[2]); mesh.setMatrixAt(i, m4); });
    scene.add(mesh);
  }
  // clouds
  const cr = rng(7), clouds = new THREE.Group();
  for (let k = 0; k < 26; k++) {
    const c = new THREE.Mesh(box, M.cloud);
    c.scale.set(4 + cr() * 7, 1, 3 + cr() * 4);
    c.position.set(-40 + cr() * 80, 16 + cr() * 6, 10 - cr() * (end + 40));
    clouds.add(c);
  }
  scene.add(clouds);
  return clouds;
}

// ---- Steve, built from blocks ----
function face(draw) { return tex(16, 16, draw); }
function makeSteve() {
  const SKIN = "#f2c49b", HAIR = "#6b3a1e", HAIR2 = "#5a2f17", SHIRT = "#4a90d9", SHIRT2 = "#3b7bc2", STRAP = "#6b4423", SHORTS = "#7a5230", BOOT = "#5a3a22";
  const fill = (c) => face((g) => { g.fillStyle = c; g.fillRect(0, 0, 16, 16); });
  const front = face((g) => {
    g.fillStyle = SKIN; g.fillRect(0, 0, 16, 16);
    g.fillStyle = HAIR; g.fillRect(0, 0, 16, 5); g.fillRect(0, 5, 2, 3); g.fillRect(14, 5, 2, 3); g.fillRect(3, 5, 3, 1); g.fillRect(9, 5, 4, 1);
    g.fillStyle = "#ffffff"; g.fillRect(3, 8, 3, 3); g.fillRect(10, 8, 3, 3);
    g.fillStyle = "#4a3020"; g.fillRect(4, 8, 2, 3); g.fillRect(11, 8, 2, 3);
    g.fillStyle = "#1d1d1d"; g.fillRect(5, 9, 1, 2); g.fillRect(12, 9, 1, 2);
    g.fillStyle = "#e9a882"; g.fillRect(7, 11, 2, 1);
    g.fillStyle = "#a33d2b"; g.fillRect(5, 13, 6, 1); g.fillStyle = "#ffffff"; g.fillRect(6, 13, 4, 1); g.fillStyle = "#a33d2b"; g.fillRect(6, 14, 4, 1);
  });
  const headSide = face((g) => { g.fillStyle = SKIN; g.fillRect(0, 0, 16, 16); g.fillStyle = HAIR; g.fillRect(0, 0, 16, 6); g.fillRect(8, 6, 8, 6); g.fillStyle = "#e9a882"; g.fillRect(4, 8, 2, 3); });
  const hair = face((g) => { const r = rng(21); g.fillStyle = HAIR; g.fillRect(0, 0, 16, 16); for (let k = 0; k < 40; k++) { g.fillStyle = HAIR2; g.fillRect(Math.floor(r() * 16), Math.floor(r() * 16), 1, 2); } });
  const shirtFront = face((g) => {
    g.fillStyle = SHIRT; g.fillRect(0, 0, 16, 16); g.fillStyle = SHIRT2; g.fillRect(6, 0, 4, 2);
    g.fillStyle = STRAP; for (let k = 0; k < 14; k++) g.fillRect(13 - k, k, 3, 1);
    g.fillStyle = "#4a2f17"; g.fillRect(0, 13, 16, 3); g.fillStyle = "#e7b53a"; g.fillRect(7, 13, 2, 3);
  });
  const shirtBack = face((g) => { g.fillStyle = SHIRT; g.fillRect(0, 0, 16, 16); g.fillStyle = STRAP; for (let k = 0; k < 14; k++) g.fillRect(k, k, 3, 1); g.fillStyle = "#4a2f17"; g.fillRect(0, 13, 16, 3); });
  const arm = face((g) => { g.fillStyle = SKIN; g.fillRect(0, 0, 16, 16); g.fillStyle = SHIRT; g.fillRect(0, 0, 16, 6); g.fillStyle = SHIRT2; g.fillRect(0, 5, 16, 1); });
  const leg = face((g) => { g.fillStyle = SKIN; g.fillRect(0, 0, 16, 16); g.fillStyle = SHORTS; g.fillRect(0, 0, 16, 7); g.fillStyle = BOOT; g.fillRect(0, 10, 16, 6); g.fillStyle = "#7a5233"; g.fillRect(0, 10, 16, 1); });
  const shieldFace = face((g) => {
    g.fillStyle = "#e7b53a"; g.fillRect(0, 0, 16, 16); g.fillStyle = "#2f63b8"; g.fillRect(1, 1, 14, 14);
    g.fillStyle = "#f5c842"; [[7, 3, 2, 2], [6, 5, 4, 2], [3, 7, 10, 2], [5, 9, 6, 2], [4, 11, 3, 2], [9, 11, 3, 2]].forEach(a => g.fillRect(...a));
  });
  const m = (t) => lam({ map: t });
  const box = (w, h, d, mats) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
  // BoxGeometry face order: +x, -x, +y, -y, +z (front), -z (back)
  const steve = new THREE.Group(), body = new THREE.Group(); steve.add(body);
  const head = box(0.62, 0.62, 0.62, [m(headSide), m(headSide), m(hair), m(fill(SKIN)), m(front), m(hair)]);
  head.position.y = 1.66; body.add(head);
  [[-0.2, 0.36, 0.1, 0.5], [0.05, 0.38, -0.05, -0.3], [0.22, 0.35, 0.05, 0.4]].forEach(([x, y, z, rz]) => {
    const tuft = box(0.2, 0.18, 0.4, m(hair)); tuft.position.set(x, y, z); tuft.rotation.z = rz; head.add(tuft);
  });
  const torso = box(0.56, 0.66, 0.32, [m(fill(SHIRT)), m(fill(SHIRT)), m(fill(SHIRT)), m(fill(SHIRT)), m(shirtFront), m(shirtBack)]);
  torso.position.y = 1.02; body.add(torso);
  const limb = (w, h, d, t, x, y) => {
    const pivot = new THREE.Group(); pivot.position.set(x, y, 0);
    const mesh = box(w, h, d, m(t)); mesh.position.y = -h / 2; pivot.add(mesh); body.add(pivot); return pivot;
  };
  const armR = limb(0.22, 0.62, 0.24, arm, 0.39, 1.33), armL = limb(0.22, 0.62, 0.24, arm, -0.39, 1.33);
  const legR = limb(0.25, 0.68, 0.27, leg, 0.14, 0.68), legL = limb(0.25, 0.68, 0.27, leg, -0.14, 0.68);
  // wooden sword in the right hand, pointing forward and up
  const sword = new THREE.Group(); sword.position.set(0, -0.58, 0.06); sword.rotation.x = 1.1; armR.add(sword);
  const wood = lam({ color: 0xc98a4b }), dark = lam({ color: 0x6e4a27 });
  const handle = box(0.07, 0.22, 0.07, dark); sword.add(handle);
  const guard = box(0.3, 0.06, 0.09, dark); guard.position.y = 0.13; sword.add(guard);
  const blade = box(0.11, 0.7, 0.05, wood); blade.position.y = 0.5; sword.add(blade);
  // star shield on the left arm
  const shield = box(0.07, 0.56, 0.56, [m(shieldFace), m(shieldFace), m(fill("#e7b53a")), m(fill("#e7b53a")), m(fill("#e7b53a")), m(fill("#e7b53a"))]);
  shield.position.set(-0.16, -0.36, 0.02); armL.add(shield);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; steve.add(shadow);
  return { steve, body, head, armR, armL, legR, legL };
}

// ---- signs ----
function boardTexture(text, gold, big) {
  return tex(big ? 128 : 96, big ? 88 : 60, (g, w, h) => {
    if (big) {
      g.fillStyle = "#fffef8"; g.fillRect(0, 0, w, h);
      g.fillStyle = "#bfdbfe"; for (let y = 22; y < h; y += 10) g.fillRect(4, y, w - 8, 1);
      g.fillStyle = "#3b1d86"; g.font = "bold 20px Lilita One, Fredoka, sans-serif"; g.textAlign = "center"; g.fillText("Worksheet", w / 2, 20);
      g.fillStyle = "#f2a900"; g.font = "bold 26px sans-serif"; g.fillText("★★★", w / 2, 60);
      g.strokeStyle = "#3b1d86"; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
      return;
    }
    const a = gold ? ["#e7b955", "#c9952f"] : ["#c98042", "#a8642c"];
    for (let y = 0; y < h; y += 15) { g.fillStyle = a[0]; g.fillRect(0, y, w, 13); g.fillStyle = a[1]; g.fillRect(0, y + 13, w, 2); }
    g.strokeStyle = "#5e3413"; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
    g.font = "bold 44px Lilita One, Fredoka, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.lineWidth = 7; g.strokeStyle = "#3a1f08"; g.strokeText(text, w / 2, h / 2 + 2); g.fillStyle = "#ffffff"; g.fillText(text, w / 2, h / 2 + 2);
  });
}

export function createView(o) {
  const { container, N, onTap, onArrive, onPick } = o;
  const END = signD(N) + 26;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.domElement.className = "world3d";
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fd3ff);
  scene.fog = new THREE.Fog(0xa9ddff, 28, 75);
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x5d7f3c, 2.2));
  const sun = new THREE.DirectionalLight(0xfff4dd, 1.8); sun.position.set(6, 12, 4); scene.add(sun);
  const clouds = buildTerrain(scene, END);

  // signs
  const signs = [], post = lam({ color: 0x7a4f28 });
  for (let i = 0; i <= N; i++) {
    const g = new THREE.Group(), big = i === N, d = signD(i);
    const w = big ? 2.8 : 1.7, h = big ? 1.9 : 1.06;
    const label = big ? "" : String(i + 1);
    const mats = { plain: lam({ map: boardTexture(label, false, big) }), gold: big ? null : lam({ map: boardTexture(label, true) }) };
    const edge = lam({ color: big ? 0x3b1d86 : 0x5e3413 });
    const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.14), [edge, edge, edge, edge, mats.plain, edge]);
    board.position.y = big ? 2.1 : 2.15; g.add(board);
    const legs = big ? [-0.9, 0.9] : [0];
    legs.forEach(x => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.2, big ? 1.5 : 1.7, 0.2), post); p.position.set(x, big ? 0.75 : 0.85, 0); g.add(p); });
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.6, 4), lam({ color: 0xffe14d, emissive: 0x7a6200 }));
    arrow.rotation.x = Math.PI; arrow.position.y = board.position.y + h / 2 + 0.7; arrow.visible = false; g.add(arrow);
    const got = new THREE.Group(); got.position.y = board.position.y + h / 2 + 0.22; g.add(got);
    if (big) g.position.set(pathX(d), 0, -d);
    else { g.position.set(pathX(d) + 2.4, 0, -d); g.rotation.y = -0.35; }
    scene.add(g);
    board.userData.sign = i; g.children.forEach(c => { c.userData.sign = i; });
    signs.push({ g, board, mats, arrow, got, bump: 0 });
  }

  // coins
  const coinGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.1, 24); coinGeo.rotateX(Math.PI / 2);
  const coinMat = lam({ color: 0xffcc22, emissive: 0x8a6400 });
  let coins = [];           // { mesh, d, from, to, t0, dur }

  // Steve
  const S = makeSteve(); scene.add(S.steve);
  let fps = 60, d = standD(0), target = d, held = false, auto = false, phase = 0, yaw = 0.5, paused = false, nextStop = 0;
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  function snapCamera() {
    camPos.set(pathX(d - 6) * 0.7 + pathX(d) * 0.3, 4.3, -(d - 6.2));
    camLook.set(pathX(d + 6), 0.6, -(d + 6));
  }

  function project(p) {
    const v = p.clone().project(camera), r = renderer.domElement.getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  }

  // tapping a sign
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  renderer.domElement.addEventListener("click", (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(signs.map(s => s.g), true).find(h => h.object.userData.sign != null);
    if (hit) onTap(hit.object.userData.sign);
  });

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.25, (now - last) / 1000); last = now; fps = fps * 0.95 + 0.05 / Math.max(dt, 1e-3);
    requestAnimationFrame(frame);
    if (paused) return;
    // walking
    const moving = (held || auto) && d < target - 1e-3;
    if (moving) {
      d = Math.min(target, d + SPEED * dt);
      coins = coins.filter(c => {
        if (c.t0 != null || c.d > d + 0.4) return true;
        const p = project(c.mesh.position); scene.remove(c.mesh); onPick(p); return false;
      });
      if (d >= target - 1e-3) { auto = false; held = false; onArrive(nextStop); }
    }
    // Steve's pose
    phase = moving ? phase + dt * 10 : phase * 0.85;
    const sw = Math.sin(phase) * (moving ? 0.75 : 0);
    S.legR.rotation.x = sw; S.legL.rotation.x = -sw;
    S.armL.rotation.x = -sw * 0.8; S.armR.rotation.x = sw * 0.35 - 0.15;
    S.body.position.y = moving ? Math.abs(Math.sin(phase)) * 0.07 : Math.sin(now / 600) * 0.012;
    S.armL.rotation.z = moving ? 0 : 0.08; S.armR.rotation.z = moving ? 0 : -0.08;
    const want = moving ? Math.atan2(slope(d), -1) : 0.55;  // walking: facing down the path; standing: turned toward us
    let dy = ((want - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI; yaw += dy * Math.min(1, dt * 8);
    S.steve.rotation.y = yaw;
    S.steve.position.set(pathX(d), 0, -d);
    // camera follows from behind
    const cp = new THREE.Vector3(pathX(d - 6) * 0.7 + pathX(d) * 0.3, 4.3, -(d - 6.2)), cl = new THREE.Vector3(pathX(d + 6), 0.6, -(d + 6));
    const k = Math.min(1, dt * 4); camPos.lerp(cp, k); camLook.lerp(cl, k);
    camera.position.copy(camPos); camera.lookAt(camLook);
    // signs, coins, clouds
    signs.forEach((s, i) => {
      if (s.arrow.visible) s.arrow.position.y = s.board.position.y + 1.25 + Math.sin(now / 250) * 0.15;
      if (s.bump > 0) { s.bump = Math.max(0, s.bump - dt * 4); s.board.position.y = (i === N ? 2.1 : 2.15) + Math.sin(s.bump * Math.PI) * 0.35; }
      s.got.children.forEach(c => { c.rotation.y += dt * 2; });
    });
    coins.forEach(c => {
      c.mesh.rotation.y += dt * 4;
      if (c.t0 != null) {
        const t = Math.min(1, (now - c.t0) / c.dur);
        c.mesh.position.lerpVectors(c.from, c.to, t); c.mesh.position.y += Math.sin(t * Math.PI) * 2.2;
        c.mesh.scale.setScalar(0.4 + 0.6 * Math.min(1, t * 2));
        if (t >= 1) { c.t0 = null; if (c.done) c.done(); }
      } else c.mesh.position.y = 0.95 + Math.sin(now / 300 + c.d) * 0.08;
    });
    clouds.position.x = Math.sin(now / 40000) * 6;
    renderer.render(scene, camera);
  }

  const view = {
    // put Steve at stop i (no walking)
    place(i) { d = target = standD(i); snapCamera(); },
    // stop Steve will walk to when the button is held
    setTarget(i) { nextStop = i; target = Math.max(d, standD(i)); },
    hold(on) { held = on; },
    walk() { auto = true; },
    walking() { return (held || auto) && d < target - 1e-3; },
    pause(on) { paused = on; last = performance.now(); },
    setSigns(st, busy) {
      signs.forEach((s, i) => {
        const done = i < N && st.pts[i] > 0;
        if (s.mats.gold) s.board.material[4] = done ? s.mats.gold : s.mats.plain;
        s.board.material[4].color.setScalar(i > st.at ? 0.55 : 1);
        s.arrow.visible = i === st.at && !busy;
        if (done && !s.got.children.length) for (let k = 0; k < st.pts[i]; k++) {
          const c = new THREE.Mesh(coinGeo, coinMat); c.scale.setScalar(0.45); c.position.x = (k - (st.pts[i] - 1) / 2) * 0.34; s.got.add(c);
        }
      });
    },
    // the board's rectangle on screen, for the clip to grow out of
    signRect(i) {
      const s = signs[i], b = s.board, geo = b.geometry.parameters, pts = [];
      s.g.updateMatrixWorld(true);
      for (const x of [-1, 1]) for (const y of [-1, 1]) pts.push(project(b.localToWorld(new THREE.Vector3(x * geo.width / 2, y * geo.height / 2, 0.07))));
      const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
      return { left: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    },
    bump(i) { signs[i].bump = 1; },
    // n coins fly out of sign i and land along the path toward the next stop
    dropCoin(i, k, n) {
      return new Promise(res => {
        const s = signs[i], from = s.board.getWorldPosition(new THREE.Vector3()); from.y += 0.6;
        const d0 = signD(i) + 1.5, d1 = standD(i + 1) - 1;
        const cd = n === 1 ? (d0 + d1) / 2 : d0 + (d1 - d0) * k / (n - 1);
        const mesh = new THREE.Mesh(coinGeo, coinMat); mesh.position.copy(from); scene.add(mesh);
        coins.push({ mesh, d: cd, from, to: new THREE.Vector3(pathX(cd), 0.95, -cd), t0: performance.now(), dur: 750, done: res });
      });
    },
    debug() { return { d, target, fps }; },
    resize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); },
  };
  snapCamera();
  requestAnimationFrame(frame);
  return view;
}
