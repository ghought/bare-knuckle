import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function std(opts) { return new THREE.MeshStandardMaterial(opts); }
function add(parent, geo, mat, pos, { cast = true, recv = true, rot } = {}) {
  const m = new THREE.Mesh(geo, mat);
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  m.castShadow = cast; m.receiveShadow = recv;
  parent.add(m);
  return m;
}

// ---------- Volumetric light cone ----------
const coneShader = {
  vertexShader: `
    varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vW;
    void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vW = (modelMatrix*vec4(position,1.0)).xyz; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `
    uniform vec3 uColor; uniform float uOpacity; uniform float uTime;
    varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vW;
    float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
    float n3(vec3 p){ vec3 i=floor(p); vec3 f=fract(p); f=f*f*(3.0-2.0*f);
      return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                 mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
    void main(){
      vec3 nn = normalize(vN + vec3(1e-5)); vec3 vv = normalize(vV + vec3(1e-5));
      float edge = pow(clamp(abs(dot(nn, vv)), 1e-4, 1.0), 2.2);
      float fall = pow(clamp(vUv.y, 1e-4, 1.0), 1.3);
      float n = 0.65 + 0.7 * n3(mod(vW * 1.6 + vec3(0.0, -uTime*0.15, uTime*0.05), 256.0));
      float a = clamp(edge * fall * n * uOpacity, 0.0, 1.0);
      if (a != a) a = 0.0;
      gl_FragColor = vec4(uColor * a, a);
    }`,
};
const coneMats = [];
function lightCone(parent, pos, color, topR, botR, height, opacity = 0.12) {
  const g = new THREE.CylinderGeometry(topR, botR, height, 40, 1, true);
  g.translate(0, -height / 2, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uTime: { value: 0 } },
    vertexShader: coneShader.vertexShader, fragmentShader: coneShader.fragmentShader,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
  coneMats.push(mat);
  const m = new THREE.Mesh(g, mat); m.position.set(...pos); m.renderOrder = 5;
  parent.add(m);
  return m;
}

function dust(parent, center, radius, height, count = 600, color = '#ffe8c0') {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
    pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = Math.random() * height; pos[i * 3 + 2] = Math.sin(a) * r;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ size: 0.018, map: TX.glowSprite(), color, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const p = new THREE.Points(g, m); p.position.copy(center);
  parent.add(p);
  return p;
}

function bulb(parent, pos, color = '#ffb56b', intensity = 3, withLight = true, distance = 6) {
  const g = new THREE.Group(); g.position.set(...pos); parent.add(g);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(6) }));
  g.add(glass);
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.6, 4), std({ color: '#111' }));
  wire.position.y = 0.33; g.add(wire);
  if (withLight) { const l = new THREE.PointLight(color, intensity, distance, 2); g.add(l); g.userData.light = l; }
  return g;
}

// ---------- Crowd ----------
function crowdGeometry() {
  const parts = [];
  const body = new THREE.CapsuleGeometry(0.19, 0.55, 4, 10); body.translate(0, 1.05, 0); body.scale(1, 1, 0.65); parts.push(body);
  const head = new THREE.SphereGeometry(0.105, 12, 10); head.translate(0, 1.62, 0.0); parts.push(head);
  const legs = new THREE.CapsuleGeometry(0.14, 0.6, 4, 8); legs.translate(0, 0.42, 0); legs.scale(1.1, 1, 0.7); parts.push(legs);
  const armL = new THREE.CapsuleGeometry(0.055, 0.5, 4, 6); armL.rotateZ(0.5); armL.translate(0.28, 1.25, 0.1); parts.push(armL);
  const armR = new THREE.CapsuleGeometry(0.055, 0.5, 4, 6); armR.rotateZ(-0.5); armR.translate(-0.28, 1.25, 0.1); parts.push(armR);
  return mergeGeometries(parts.map(p => p.toNonIndexed ? p.toNonIndexed() : p));
}

class Crowd {
  constructor(parent, spots, envMap) {
    this.n = spots.length;
    const mat = std({ color: '#ffffff', roughness: 0.85, envMap, envMapIntensity: 0.15 });
    this.mesh = new THREE.InstancedMesh(crowdGeometry(), mat, this.n);
    this.mesh.castShadow = false; this.mesh.receiveShadow = true;
    this.spots = spots;
    this.phase = spots.map(() => Math.random() * 10);
    this.freq = spots.map(() => 3 + Math.random() * 4);
    this.scale = spots.map(() => 0.92 + Math.random() * 0.18);
    const palette = ['#2a2c30', '#3b2f2a', '#1d2330', '#4a4a48', '#5a2a22', '#23302a', '#6b6052', '#2b2b2b', '#3d4a5c', '#704a30'];
    const c = new THREE.Color();
    spots.forEach((s, i) => { c.set(palette[(Math.random() * palette.length) | 0]).multiplyScalar(0.6 + Math.random() * 0.5); this.mesh.setColorAt(i, c); });
    this.excite = 0.2;
    this.dummy = new THREE.Object3D();
    parent.add(this.mesh);
    this.update(0, 0);
  }
  update(dt, t) {
    const d = this.dummy;
    this.excite = Math.max(0.15, this.excite - dt * 0.35);
    for (let i = 0; i < this.n; i++) {
      const s = this.spots[i];
      const bob = Math.max(0, Math.sin(t * this.freq[i] + this.phase[i])) * 0.06 * (0.3 + this.excite * 1.4);
      d.position.set(s.x, s.y + bob, s.z);
      d.rotation.set(0, s.ry + Math.sin(t * 0.7 + this.phase[i]) * 0.15, Math.sin(t * this.freq[i] * 0.5 + this.phase[i]) * 0.04 * this.excite);
      d.scale.setScalar(this.scale[i]);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  roar(a = 1) { this.excite = Math.min(1.6, this.excite + a); }
}

function crowdRing(cx, cz, rMin, rMax, count, baseY = 0, tierStep = 0, rings = 1) {
  const spots = [];
  for (let i = 0; i < count; i++) {
    const ring = Math.floor(Math.random() * rings);
    const r = rMin + (rMax - rMin) * (rings > 1 ? (ring + Math.random() * 0.6) / rings : Math.random());
    const a = Math.random() * Math.PI * 2;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    spots.push({ x, z, y: baseY + ring * tierStep, ry: Math.atan2(cx - x, cz - z) });
  }
  return spots;
}
function crowdSquare(half, depth, count, baseY = 0, tierStep = 0, rows = 1) {
  const spots = [];
  for (let i = 0; i < count; i++) {
    const side = (Math.random() * 4) | 0;
    const row = (Math.random() * rows) | 0;
    const off = half + 0.6 + row * (depth / rows) + Math.random() * (depth / rows) * 0.7;
    const along = (Math.random() * 2 - 1) * (half + 0.6 + row * 0.8);
    let x, z;
    if (side === 0) { x = along; z = off; } else if (side === 1) { x = along; z = -off; } else if (side === 2) { x = off; z = along; } else { x = -off; z = along; }
    spots.push({ x, z, y: baseY + row * tierStep, ry: Math.atan2(-x, -z) });
  }
  return spots;
}

// ---------- Ring ----------
function buildRing(parent, { half = 2.9, height = 0.55, label = 'ASHCROFT', sub = 'BARE KNUCKLE', ropeColors = ['#c8102e', '#efe6d2', '#c8102e'], apron = '#141414', envMap, accent = '#c8102e' }) {
  const g = new THREE.Group(); parent.add(g);
  const apronMat = std({ color: apron, roughness: 0.7, map: TX.textSign(label + ' · ' + sub, { w: 2048, h: 128, bg: apron, fg: accent, size: 80, border: false }) });
  apronMat.map.repeat.set(1, 1);
  const plat = add(g, new THREE.BoxGeometry(half * 2 + 0.3, height, half * 2 + 0.3), [apronMat, apronMat, std({ color: '#222' }), std({ color: '#111' }), apronMat, apronMat], [0, height / 2, 0]);
  const canvasMat = new THREE.MeshPhysicalMaterial({ map: TX.ringCanvas(label, sub, 5, accent), roughness: 0.82, sheen: 0.4, sheenColor: new THREE.Color('#ffffff').multiplyScalar(0.2), envMap, envMapIntensity: 0.25 });
  const top = add(g, new THREE.PlaneGeometry(half * 2 + 0.3, half * 2 + 0.3), canvasMat, [0, height + 0.002, 0], { rot: [-Math.PI / 2, 0, 0], cast: false });
  const postMat = std({ color: '#aab0b5', roughness: 0.3, metalness: 1, envMap, envMapIntensity: 1 });
  const padMats = [std({ color: '#b3101f', roughness: 0.5 }), std({ color: '#e8e0d0', roughness: 0.6 }), std({ color: '#1d3e8a', roughness: 0.5 }), std({ color: '#e8e0d0', roughness: 0.6 })];
  const corners = [[half, half], [-half, half], [-half, -half], [half, -half]];
  corners.forEach(([x, z], i) => {
    add(g, new THREE.CylinderGeometry(0.055, 0.06, 1.55, 14), postMat, [x, height + 0.77, z]);
    add(g, new RoundedBoxGeometry(0.16, 1.1, 0.16, 2, 0.04), padMats[i], [x, height + 0.82, z], { rot: [0, Math.PI / 4, 0] });
  });
  const ropeH = [0.42, 0.8, 1.18];
  ropeH.forEach((h, ri) => {
    const rm = new THREE.MeshPhysicalMaterial({ color: ropeColors[ri], roughness: 0.4, clearcoat: 0.6, envMap, envMapIntensity: 0.6 });
    for (let s = 0; s < 4; s++) {
      const [x1, z1] = corners[s], [x2, z2] = corners[(s + 1) % 4];
      const len = Math.hypot(x2 - x1, z2 - z1);
      const rope = add(g, new THREE.CylinderGeometry(0.022, 0.022, len, 8), rm, [(x1 + x2) / 2, height + h, (z1 + z2) / 2]);
      rope.rotation.set(Math.PI / 2, 0, 0);
      rope.rotation.y = Math.atan2(x2 - x1, z2 - z1);
      rope.rotation.order = 'YXZ';
      rope.rotation.set(Math.PI / 2, Math.atan2(x2 - x1, z2 - z1), 0);
    }
  });
  // steps
  add(g, new THREE.BoxGeometry(0.8, height * 0.5, 0.4), std({ color: '#2a2a2a', roughness: 0.7 }), [half - 0.6, height * 0.25, half + 0.38]);
  return { group: g, floorY: height, half };
}

function wallBox(parent, w, h, d, pos, mat) { return add(parent, new THREE.BoxGeometry(w, h, d), mat, pos); }

function room(parent, { w, d, h, wallMat, floorMat, ceilMat }) {
  add(parent, new THREE.PlaneGeometry(w, d), floorMat, [0, 0, 0], { rot: [-Math.PI / 2, 0, 0], cast: false });
  if (ceilMat) add(parent, new THREE.PlaneGeometry(w, d), ceilMat, [0, h, 0], { rot: [Math.PI / 2, 0, 0], cast: false });
  wallBox(parent, w, h, 0.3, [0, h / 2, -d / 2 - 0.15], wallMat);
  wallBox(parent, w, h, 0.3, [0, h / 2, d / 2 + 0.15], wallMat);
  wallBox(parent, 0.3, h, d, [-w / 2 - 0.15, h / 2, 0], wallMat);
  wallBox(parent, 0.3, h, d, [w / 2 + 0.15, h / 2, 0], wallMat);
}

function brickMat(rep, tint, seed = 3) {
  const b = TX.brick(seed, tint);
  const map = b.map.clone(); map.needsUpdate = true; map.repeat.set(...rep);
  const bump = b.bump.clone(); bump.needsUpdate = true; bump.repeat.set(...rep);
  return std({ map, bumpMap: bump, bumpScale: 2.5, roughness: 0.92 });
}

function posterOn(parent, pos, rotY, lines, colors, seed, w = 0.6) {
  const m = add(parent, new THREE.PlaneGeometry(w, w * 1.4), std({ map: TX.poster(lines, colors, seed), roughness: 0.8 }), pos, { rot: [0, rotY, (Math.random() - 0.5) * 0.06], cast: false });
  return m;
}

// =====================================================================
// FIGHT VENUES
// =====================================================================
export const VENUES = {
  cellar: { name: 'The Cellar', sub: 'Under the King\'s Head, Ashcroft' },
  mill: { name: 'Hartley\'s Mill', sub: 'Northern Circuit · Oldham Road' },
  hall: { name: 'The Corn Exchange', sub: 'National Championship · Manchester' },
};

export function buildVenue(theme, envMap) {
  const scene = new THREE.Scene();
  const ctrl = { scene, theme, updaters: [] };
  scene.environment = null;
  let crowd, ring;

  if (theme === 'cellar') {
    scene.background = new THREE.Color('#0b0806');
    scene.fog = new THREE.FogExp2('#120c08', 0.06);
    const W = 13, D = 13, H = 3.8;
    room(scene, { w: W, d: D, h: H, wallMat: brickMat([4, 1.3], [118, 56, 40], 3), floorMat: std({ map: (() => { const t = TX.concrete(11).map.clone(); t.needsUpdate = true; t.repeat.set(3, 3); return t; })(), roughness: 0.75 }), ceilMat: std({ color: '#1a1410', roughness: 1 }) });
    // ceiling joists
    for (let i = -5; i <= 5; i++) add(scene, new THREE.BoxGeometry(0.16, 0.24, D), std({ color: '#2a1d14', roughness: 0.9 }), [i * 1.2, H - 0.12, 0]);
    ring = buildRing(scene, { half: 2.7, height: 0.3, label: 'THE CELLAR', sub: 'ASHCROFT · EST. 1868', ropeColors: ['#d9d0bd', '#d9d0bd', '#d9d0bd'], apron: '#1a120d', accent: '#9b1b1b', envMap });
    // main lamp
    const spot = new THREE.SpotLight('#ffd2a0', 34, 12, 0.62, 0.55, 2);
    spot.position.set(0, H - 0.3, 0); spot.target.position.set(0, 0, 0);
    spot.castShadow = true; spot.shadow.mapSize.set(2048, 2048); spot.shadow.bias = -0.0004; spot.shadow.normalBias = 0.02; spot.shadow.camera.near = 0.5; spot.shadow.camera.far = 8;
    scene.add(spot, spot.target);
    add(scene, new THREE.CylinderGeometry(0.35, 0.5, 0.25, 24, 1, true), std({ color: '#1c3020', roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide }), [0, H - 0.3, 0]);
    add(scene, new THREE.CircleGeometry(0.34, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd9a8').multiplyScalar(5) }), [0, H - 0.41, 0], { rot: [Math.PI / 2, 0, 0], cast: false });
    lightCone(scene, [0, H - 0.4, 0], '#ffcf96', 0.34, 2.6, H - 0.4, 0.09);
    dust(scene, V(0, 0.3, 0), 2.3, H - 0.8, 700);
    // string of bulbs around walls
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      bulb(scene, [Math.cos(a) * 5.2, H - 0.75, Math.sin(a) * 5.2], '#ffae5c', i % 3 === 0 ? 2.2 : 0, i % 3 === 0, 5);
    }
    const hemi = new THREE.HemisphereLight('#6b4a32', '#0a0605', 0.35); scene.add(hemi);
    const rim = new THREE.PointLight('#5a7aa8', 6, 9, 2); rim.position.set(-4, 2.6, -4); scene.add(rim);
    crowd = new Crowd(scene, crowdSquare(3.0, 2.5, 90, 0, 0, 2), envMap);
    // posters & barrels
    posterOn(scene, [-3, 1.7, -D / 2 + 0.01], 0, [{ t: 'FIGHT', size: 90 }, { t: 'NIGHT', size: 90, y: 230 }, { t: 'FRIDAYS', size: 54, y: 330 }, { t: 'NO ROUNDS', size: 44, y: 440, font: '"Barlow Condensed"' }, { t: 'NO GLOVES', size: 44, y: 500, font: '"Barlow Condensed"' }, { t: 'NO RUBBISH', size: 44, y: 560, font: '"Barlow Condensed"' }], ['#e8dcc0', '#111', '#8b1212'], 4);
    posterOn(scene, [3.2, 1.6, -D / 2 + 0.01], 0, [{ t: 'BOXING', size: 80 }, { t: 'KING\'S HEAD', size: 58, y: 240 }, { t: 'MEMBERS ONLY', size: 40, y: 330, font: '"Barlow Condensed"' }], ['#d8cdb0', '#1b1b1b', '#1d3e8a'], 7);
    const barrelMat = std({ color: '#6b4426', roughness: 0.7, map: TX.woodPlanks(3, [110, 70, 40], 64).map });
    for (let i = 0; i < 5; i++) add(scene, new THREE.CylinderGeometry(0.32, 0.32, 0.8, 18), barrelMat, [5.6, 0.4, -5.6 + i * 0.75]);
    ctrl.grade = { uWarm: 0.7, uVignette: 1.0, uGrain: 0.07, uContrast: 1.1, uDesat: 0 };
    ctrl.bloom = [0.45, 0.55, 0.95]; ctrl.exposure = 1.0;
  } else if (theme === 'mill') {
    scene.background = new THREE.Color('#06080b');
    scene.fog = new THREE.FogExp2('#0d0f12', 0.045);
    const W = 30, D = 22, H = 9;
    room(scene, { w: W, d: D, h: H, wallMat: brickMat([10, 3], [104, 50, 36], 8), floorMat: std({ map: (() => { const t = TX.concrete(21).map.clone(); t.needsUpdate = true; t.repeat.set(6, 5); return t; })(), roughness: 0.6, envMap, envMapIntensity: 0.3 }), ceilMat: std({ color: '#0d0d0e', roughness: 1 }) });
    const steel = std({ color: '#2b2e31', roughness: 0.5, metalness: 0.8, envMap, envMapIntensity: 0.4 });
    for (let i = -3; i <= 3; i++) {
      add(scene, new THREE.BoxGeometry(0.35, 0.5, D), steel, [i * 4.2, H - 0.8, 0]);
      for (const z of [-7, 7]) add(scene, new THREE.BoxGeometry(0.3, H, 0.3), steel, [i * 4.2, H / 2, z]);
    }
    // high windows (moonlight)
    const winMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#5d7fb0').multiplyScalar(1.4) });
    for (let i = -3; i <= 3; i++) {
      const wx = i * 4.2 + 2.1;
      add(scene, new THREE.PlaneGeometry(1.6, 2.4), winMat, [wx, H - 2.6, -D / 2 + 0.02], { cast: false });
      lightCone(scene, [wx, H - 2.6, -D / 2 + 0.5], '#6f8fc0', 0.8, 2.2, 7, 0.03).rotation.x = -0.6;
    }
    ring = buildRing(scene, { half: 2.9, height: 0.7, label: 'NORTHERN', sub: 'VANCE PROMOTIONS', apron: '#101418', accent: '#d1a640', ropeColors: ['#d1a640', '#efe6d2', '#d1a640'], envMap });
    for (const [x, z, c] of [[-1.3, -1.3, '#ffcc88'], [1.3, 1.3, '#ffcc88'], [1.3, -1.3, '#ffb070'], [-1.3, 1.3, '#ffb070']]) {
      const s = new THREE.SpotLight(c, 42, 16, 0.42, 0.6, 2);
      s.position.set(x * 1.6, H - 1.4, z * 1.6); s.target.position.set(x * 0.2, 0.7, z * 0.2);
      if (x < 0 && z < 0) { s.castShadow = true; s.shadow.mapSize.set(2048, 2048); s.shadow.bias = -0.0004; s.shadow.normalBias = 0.02; }
      scene.add(s, s.target);
      add(scene, new THREE.CylinderGeometry(0.22, 0.3, 0.4, 16), std({ color: '#111', metalness: 0.8, roughness: 0.4 }), [x * 1.6, H - 1.3, z * 1.6]);
      const cone = lightCone(scene, [x * 1.6, H - 1.5, z * 1.6], c, 0.2, 2.1, H - 2.0, 0.05);
      cone.lookAt(x * 0.2, 0.7, z * 0.2); cone.rotateX(-Math.PI / 2);
    }
    dust(scene, V(0, 0.7, 0), 3.5, 7, 1200);
    scene.add(new THREE.HemisphereLight('#3a4152', '#070605', 0.4));
    const sodium = new THREE.PointLight('#ff8a3a', 25, 16, 2); sodium.position.set(10, 5, 6); scene.add(sodium);
    const sodium2 = new THREE.PointLight('#ff8a3a', 25, 16, 2); sodium2.position.set(-10, 5, -6); scene.add(sodium2);
    const rim = new THREE.PointLight('#6b8bc8', 20, 14, 2); rim.position.set(0, 4, -8); scene.add(rim);
    crowd = new Crowd(scene, crowdSquare(3.1, 5.5, 230, 0, 0.25, 4), envMap);
    posterOn(scene, [-6, 2.2, -D / 2 + 0.05], 0, [{ t: 'VANCE', size: 100 }, { t: 'PROMOTIONS', size: 60, y: 240 }, { t: 'NORTHERN', size: 60, y: 360 }, { t: 'CIRCUIT', size: 60, y: 430 }], ['#111', '#d1a640', '#d1a640'], 11, 1.4);
    posterOn(scene, [6, 2.2, -D / 2 + 0.05], 0, [{ t: 'CASH', size: 100 }, { t: 'BETS', size: 100, y: 260 }, { t: 'AT THE BAR', size: 50, y: 380 }], ['#e8dcc0', '#111', '#8b1212'], 12, 1.4);
    ctrl.grade = { uWarm: 0.55, uVignette: 1.0, uGrain: 0.06, uContrast: 1.12, uDesat: 0.05 };
    ctrl.bloom = [0.45, 0.55, 0.95]; ctrl.exposure = 1.0;
  } else { // hall
    scene.background = new THREE.Color('#040406');
    scene.fog = new THREE.FogExp2('#08070c', 0.035);
    const W = 40, D = 34, H = 14;
    room(scene, { w: W, d: D, h: H, wallMat: std({ color: '#141218', roughness: 0.9 }), floorMat: std({ color: '#0f0e10', roughness: 0.35, metalness: 0.2, envMap, envMapIntensity: 0.6 }) });
    ring = buildRing(scene, { half: 3.0, height: 0.9, label: 'NATIONAL', sub: 'BARE KNUCKLE CHAMPIONSHIP', apron: '#0a0a0c', accent: '#c8102e', ropeColors: ['#c8102e', '#efe6d2', '#1d3e8a'], envMap });
    // truss
    const truss = std({ color: '#3a3d42', metalness: 0.9, roughness: 0.35, envMap });
    const tH = 7.5;
    for (const s of [-1, 1]) {
      add(scene, new THREE.BoxGeometry(8, 0.25, 0.25), truss, [0, tH, s * 4]);
      add(scene, new THREE.BoxGeometry(0.25, 0.25, 8), truss, [s * 4, tH, 0]);
    }
    const cols = ['#fff1dc', '#fff1dc', '#ffe2b8', '#ffe2b8', '#ff2b3d', '#3d6bff'];
    const spots = [[-3, -3], [3, 3], [3, -3], [-3, 3], [-4, 0], [4, 0]];
    spots.forEach(([x, z], i) => {
      const s = new THREE.SpotLight(cols[i], i < 4 ? 55 : 40, 18, i < 4 ? 0.32 : 0.45, 0.5, 2);
      s.position.set(x, tH - 0.2, z); s.target.position.set(x * 0.12, 0.9, z * 0.12);
      if (i === 0) { s.castShadow = true; s.shadow.mapSize.set(2048, 2048); s.shadow.bias = -0.0004; s.shadow.normalBias = 0.02; }
      scene.add(s, s.target);
      add(scene, new THREE.CylinderGeometry(0.14, 0.2, 0.35, 14), std({ color: '#0c0c0c', metalness: 0.8 }), [x, tH - 0.1, z]);
      const cone = lightCone(scene, [x, tH - 0.25, z], cols[i], 0.13, i < 4 ? 2.2 : 3, 7, i < 4 ? 0.05 : 0.07);
      cone.lookAt(x * 0.12, 0.9, z * 0.12); cone.rotateX(-Math.PI / 2);
    });
    dust(scene, V(0, 0.9, 0), 4, 7, 1500);
    scene.add(new THREE.HemisphereLight('#2a2a3a', '#050505', 0.35));
    crowd = new Crowd(scene, crowdSquare(3.3, 10, 420, 0, 0.55, 8), envMap);
    // tiers
    for (let r = 0; r < 8; r++) {
      const off = 3.9 + r * 1.25 + 0.6;
      for (const [x, z, w, d] of [[0, off, off * 2, 1.25], [0, -off, off * 2, 1.25], [off, 0, 1.25, off * 2], [-off, 0, 1.25, off * 2]])
        add(scene, new THREE.BoxGeometry(w, 0.55 * (r + 1), d), std({ color: '#121014', roughness: 0.9 }), [x, 0.55 * (r + 1) / 2 - 0.55, z], { cast: false });
    }
    // banners
    const banner = TX.textSign('NATIONAL BARE KNUCKLE CHAMPIONSHIP', { w: 2048, h: 256, bg: '#7a0a1c', fg: '#efe6d2', size: 140, border: false });
    add(scene, new THREE.PlaneGeometry(14, 1.75), std({ map: banner, emissive: '#ffffff', emissiveMap: banner, emissiveIntensity: 0.35 }), [0, 9, -D / 2 + 0.2], { cast: false });
    add(scene, new THREE.PlaneGeometry(14, 1.75), std({ map: banner, emissive: '#ffffff', emissiveMap: banner, emissiveIntensity: 0.35 }), [0, 9, D / 2 - 0.2], { rot: [0, Math.PI, 0], cast: false });
    // big screens glow
    for (const x of [-12, 12]) {
      add(scene, new THREE.PlaneGeometry(6, 3.4), new THREE.MeshBasicMaterial({ color: new THREE.Color('#2a3c6a').multiplyScalar(1.2) }), [x, 7, -D / 2 + 0.25], { cast: false });
    }
    ctrl.grade = { uWarm: 0.45, uVignette: 1.0, uGrain: 0.05, uContrast: 1.14, uDesat: 0 };
    ctrl.bloom = [0.55, 0.6, 0.92]; ctrl.exposure = 1.0;
  }

  ctrl.crowd = crowd;
  ctrl.ring = ring;
  ctrl.floorY = ring.floorY;
  ctrl.bounds = ring.half - 0.45;
  const dustPts = [];
  scene.traverse(o => { if (o.isPoints) dustPts.push(o); });
  ctrl.update = (dt, raw, t) => {
    for (const m of coneMats) m.uniforms.uTime.value = t;
    crowd.update(dt, t);
    dustPts.forEach((p, i) => p.rotation.y += dt * 0.02 * (i % 2 ? 1 : -1));
    ctrl.updaters.forEach(u => u(dt, raw, t));
  };
  return ctrl;
}

// =====================================================================
// PUB: The King's Head
// =====================================================================
export function buildPub(envMap) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0d0806');
  scene.fog = new THREE.FogExp2('#1a100a', 0.04);
  const ctrl = { scene, updaters: [] };
  const W = 12, D = 9, H = 3.1;
  const wood = TX.woodPlanks(7, [86, 52, 30], 96);
  const floorMap = wood.map.clone(); floorMap.needsUpdate = true; floorMap.repeat.set(3, 2.4);
  const floorRough = wood.rough.clone(); floorRough.needsUpdate = true; floorRough.repeat.set(3, 2.4);
  add(scene, new THREE.PlaneGeometry(W, D), std({ map: floorMap, roughnessMap: floorRough, roughness: 0.75, envMap, envMapIntensity: 0.5 }), [0, 0, 0], { rot: [-Math.PI / 2, 0, 0], cast: false });
  add(scene, new THREE.PlaneGeometry(W, D), std({ color: '#2a1b10', roughness: 0.9 }), [0, H, 0], { rot: [Math.PI / 2, 0, 0], cast: false });
  // walls: green upper, panelled lower
  const upper = std({ color: '#1f3a2a', roughness: 0.85, map: TX.fabric('#ffffff', 12) });
  const panelMap = TX.woodPlanks(17, [70, 40, 22], 256).map.clone(); panelMap.needsUpdate = true; panelMap.repeat.set(4, 0.5);
  const panel = std({ map: panelMap, roughness: 0.45, envMap, envMapIntensity: 0.5 });
  const wallDefs = [[W, D / 2, 0, 0], [W, -D / 2, 0, Math.PI], [D, W / 2, 1, -Math.PI / 2], [D, -W / 2, 1, Math.PI / 2]];
  for (const [len, off, axis, ry] of wallDefs) {
    const pos = axis ? [off, 0, 0] : [0, 0, off];
    const up = add(scene, new THREE.PlaneGeometry(len, H - 1.1), upper, [pos[0], 1.1 + (H - 1.1) / 2, pos[2]], { rot: [0, ry + Math.PI, 0], cast: false });
    const lo = add(scene, new THREE.PlaneGeometry(len, 1.1), panel, [pos[0], 0.55, pos[2]], { rot: [0, ry + Math.PI, 0], cast: false });
    // dado rail
    const rail = add(scene, new THREE.BoxGeometry(axis ? 0.06 : len, 0.06, axis ? len : 0.06), panel, [pos[0] * 0.995, 1.12, pos[2] * 0.995]);
  }
  // beams
  for (let i = -2; i <= 2; i++) add(scene, new THREE.BoxGeometry(0.22, 0.26, D), std({ color: '#24170e', roughness: 0.8 }), [i * 2.6, H - 0.13, 0]);

  // ----- Bar -----
  const barZ = -2.4, barLen = 6.4;
  const barWood = std({ map: (() => { const t = TX.woodPlanks(27, [70, 36, 18], 128).map.clone(); t.needsUpdate = true; t.repeat.set(2, 1); return t; })(), roughness: 0.4, envMap, envMapIntensity: 0.6 });
  add(scene, new THREE.BoxGeometry(barLen, 1.0, 0.62), barWood, [0, 0.5, barZ]);
  const top = new THREE.MeshPhysicalMaterial({ color: '#3a1d0d', roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08, envMap, envMapIntensity: 1 });
  add(scene, new THREE.BoxGeometry(barLen + 0.2, 0.06, 0.8), top, [0, 1.03, barZ]);
  // brass foot rail
  const brass = std({ color: '#8a6428', metalness: 1, roughness: 0.32, envMap, envMapIntensity: 0.45 });
  const rail = add(scene, new THREE.CylinderGeometry(0.025, 0.025, barLen, 10), brass, [0, 0.18, barZ + 0.42]); rail.rotation.z = Math.PI / 2;
  // panels on bar front
  for (let i = 0; i < 8; i++) add(scene, new THREE.BoxGeometry(0.62, 0.55, 0.02), barWood, [-barLen / 2 + 0.4 + i * 0.8, 0.55, barZ + 0.32]);
  // pumps
  for (let i = 0; i < 4; i++) {
    const x = 1.95 + i * 0.32;
    add(scene, new THREE.CylinderGeometry(0.035, 0.04, 0.18, 12), brass, [x, 1.15, barZ + 0.1]);
    const handle = add(scene, new THREE.CylinderGeometry(0.022, 0.03, 0.36, 12), std({ color: ['#2a1308', '#e8e0d0', '#2a1308', '#7a0a1c'][i], roughness: 0.3, envMap }), [x, 1.42, barZ + 0.1]);
    handle.rotation.x = -0.15;
    add(scene, new THREE.BoxGeometry(0.08, 0.06, 0.01), std({ color: ['#c8102e', '#d1a640', '#1d3e8a', '#3f8f4f'][i], emissive: ['#c8102e', '#d1a640', '#1d3e8a', '#3f8f4f'][i], emissiveIntensity: 0.3 }), [x, 1.5, barZ + 0.12]);
  }
  // pint glasses on bar
  const glassMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.05, transmission: 0, transparent: true, opacity: 0.25, envMap, envMapIntensity: 1.5 });
  const aleMat = std({ color: '#7a3a0e', roughness: 0.2, emissive: '#3a1404', emissiveIntensity: 0.4, transparent: true, opacity: 0.92 });
  const headMat = std({ color: '#efe2c4', roughness: 0.8 });
  for (const x of [-2.6, -0.95, 1.05]) {
    add(scene, new THREE.CylinderGeometry(0.042, 0.034, 0.15, 16), glassMat, [x, 1.14, barZ + 0.15]);
    add(scene, new THREE.CylinderGeometry(0.038, 0.031, 0.12, 16), aleMat, [x, 1.125, barZ + 0.15]);
    add(scene, new THREE.CylinderGeometry(0.039, 0.039, 0.015, 16), headMat, [x, 1.192, barZ + 0.15]);
  }
  // back bar: shelves + mirror + bottles
  const backZ = -D / 2 + 0.3;
  add(scene, new THREE.BoxGeometry(barLen, 0.9, 0.5), barWood, [0, 0.45, backZ + 0.05]);
  const mirror = std({ color: '#5a5a58', metalness: 1, roughness: 0.15, envMap, envMapIntensity: 0.8 });
  add(scene, new THREE.PlaneGeometry(barLen - 0.4, 1.3), mirror, [0, 1.75, -D / 2 + 0.03], { cast: false });
  for (const y of [1.25, 1.75, 2.25]) add(scene, new THREE.BoxGeometry(barLen - 0.2, 0.04, 0.26), barWood, [0, y, -D / 2 + 0.16]);
  const bottleCols = ['#1f5a2a', '#6a3a12', '#c9a86a', '#2a1a0a', '#8a1a1a', '#3a6a7a', '#d8c070'];
  const bottleGeo = mergeGeometries([new THREE.CylinderGeometry(0.035, 0.035, 0.2, 10).translate(0, 0.1, 0), new THREE.CylinderGeometry(0.012, 0.03, 0.09, 8).translate(0, 0.245, 0)]);
  const bottles = new THREE.InstancedMesh(bottleGeo, std({ color: '#ffffff', roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.85, emissive: '#2a1406', emissiveIntensity: 0.25, envMap, envMapIntensity: 0.5 }), 66);
  const dmy = new THREE.Object3D(); const col = new THREE.Color(); let bi = 0;
  for (const y of [1.27, 1.77, 2.27]) for (let i = 0; i < 22; i++) {
    dmy.position.set(-2.9 + i * 0.27 + Math.random() * 0.05, y, -D / 2 + 0.16 + (Math.random() - 0.5) * 0.06);
    dmy.scale.set(1, 0.8 + Math.random() * 0.5, 1); dmy.updateMatrix();
    bottles.setMatrixAt(bi, dmy.matrix); bottles.setColorAt(bi, col.set(bottleCols[(Math.random() * bottleCols.length) | 0])); bi++;
  }
  scene.add(bottles);
  // glow behind bottles
  const bottleGlow = new THREE.PointLight('#ff9a4a', 2.5, 4, 2); bottleGlow.position.set(0, 1.8, -D / 2 + 0.5); scene.add(bottleGlow);
  // pub sign
  const sign = TX.textSign('THE KING\'S HEAD', { w: 1024, h: 192, bg: '#10261a', fg: '#d9b45a', size: 120 });
  add(scene, new THREE.PlaneGeometry(3.2, 0.6), std({ map: sign, roughness: 0.4, emissive: '#ffffff', emissiveMap: sign, emissiveIntensity: 0.15 }), [0, 2.72, -D / 2 + 0.04], { cast: false });

  // ----- Lighting -----
  scene.add(new THREE.HemisphereLight('#6a4a30', '#140a05', 0.5));
  const pendants = [];
  for (const x of [-2, 0, 2]) {
    const g = new THREE.Group(); g.position.set(x, H - 0.85, barZ + 0.2); scene.add(g);
    add(g, new THREE.CylinderGeometry(0.08, 0.22, 0.2, 20, 1, true), std({ color: '#163322', metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide, envMap }), [0, 0, 0]);
    add(g, new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc98a').multiplyScalar(3) }), [0, -0.06, 0], { cast: false });
    add(g, new THREE.CylinderGeometry(0.006, 0.006, 0.8, 4), std({ color: '#111' }), [0, 0.5, 0]);
    pendants.push(g);
  }
  const barSpot = new THREE.SpotLight('#ffbf7a', 12, 9, 1.0, 0.7, 2);
  barSpot.position.set(0.5, H - 0.4, barZ + 0.8); barSpot.target.position.set(0, 0.9, barZ - 0.5);
  barSpot.castShadow = true; barSpot.shadow.mapSize.set(2048, 2048); barSpot.shadow.bias = -0.0005; barSpot.shadow.normalBias = 0.02;
  scene.add(barSpot, barSpot.target);
  for (const x of [-2.2, 2.2]) { const l = new THREE.PointLight('#ffb36a', 2.2, 6, 2); l.position.set(x, H - 1, barZ + 0.3); scene.add(l); }
  // fireplace (left wall)
  const fx = -W / 2 + 0.35;
  add(scene, new THREE.BoxGeometry(0.5, 1.2, 1.6), brickMat([1, 1], [110, 50, 36], 5), [fx, 0.6, 1.2]);
  add(scene, new THREE.BoxGeometry(0.52, 0.12, 1.9), barWood, [fx + 0.02, 1.25, 1.2]);
  add(scene, new THREE.BoxGeometry(0.1, 0.6, 0.9), new THREE.MeshBasicMaterial({ color: '#050302' }), [fx + 0.22, 0.4, 1.2]);
  const embers = add(scene, new THREE.BoxGeometry(0.2, 0.12, 0.7), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff5a10').multiplyScalar(4) }), [fx + 0.25, 0.16, 1.2], { cast: false });
  const fire = new THREE.PointLight('#ff6a1c', 8, 7, 2); fire.position.set(fx + 0.8, 0.6, 1.2); scene.add(fire);
  // window (right wall) with rain
  const rain = TX.rainWindow();
  const winMat = new THREE.MeshBasicMaterial({ map: rain, color: new THREE.Color('#ffffff').multiplyScalar(1.3) });
  for (const z of [-1, 2]) {
    add(scene, new THREE.PlaneGeometry(1.2, 1.5), winMat, [W / 2 - 0.02, 1.85, z], { rot: [0, -Math.PI / 2, 0], cast: false });
    add(scene, new THREE.BoxGeometry(0.06, 1.6, 0.05), barWood, [W / 2 - 0.04, 1.85, z]);
    add(scene, new THREE.BoxGeometry(0.06, 0.05, 1.3), barWood, [W / 2 - 0.04, 1.85, z]);
  }
  const floorLight = new THREE.PointLight('#ffc890', 1.2, 5, 2); floorLight.position.set(0, 2.7, 0.9); scene.add(floorLight);
  const winLight = new THREE.PointLight('#5f86c0', 5, 6, 2); winLight.position.set(W / 2 - 0.8, 2, 0.5); scene.add(winLight);
  // chalkboard & dartboard
  add(scene, new THREE.PlaneGeometry(0.9, 1.12), std({ map: TX.chalkboard([{ t: 'KING\'S HEAD', s: 52, f: 'Anton' }, { t: 'TUES · DARTS', s: 40 }, { t: 'THURS · QUIZ', s: 40 }, { t: 'SAT · KARAOKE', s: 40 }, { t: '', s: 20 }, { t: 'FRI · FIGHT NIGHT', s: 46, c: '#ff6b6b' }, { t: '(ask Terry)', s: 30, c: '#bbb' }]), roughness: 0.9 }), [-W / 2 + 0.03, 1.9, -1.6], { rot: [0, Math.PI / 2, 0], cast: false });
  add(scene, new THREE.CircleGeometry(0.23, 32), std({ map: TX.dartboard(), roughness: 0.8 }), [W / 2 - 0.03, 1.75, 3.4], { rot: [0, -Math.PI / 2, 0], cast: false });
  // fight posters on back-right wall
  posterOn(scene, [4.2, 1.9, -D / 2 + 0.02], 0, [{ t: 'FIGHT', size: 90 }, { t: 'NIGHT', size: 90, y: 230 }, { t: 'THE CELLAR', size: 50, y: 330 }, { t: 'FRIDAYS · 9PM', size: 40, y: 420, font: '"Barlow Condensed"' }], ['#e8dcc0', '#111', '#8b1212'], 31, 0.55);
  posterOn(scene, [-4.2, 1.9, -D / 2 + 0.02], 0, [{ t: 'ASHCROFT', size: 66 }, { t: 'TOWN FC', size: 70, y: 230 }, { t: 'UP THE MILLERS', size: 40, y: 330, font: '"Barlow Condensed"' }], ['#e8dcc0', '#111', '#1f5a2a'], 33, 0.55);
  // tables & stools
  const stoolMat = std({ color: '#2a170b', roughness: 0.5, envMap, envMapIntensity: 0.4 });
  const leather = std({ color: '#5a1512', roughness: 0.45, envMap, envMapIntensity: 0.5 });
  for (let i = 0; i < 6; i++) {
    const x = -2.5 + i * 1.0;
    add(scene, new THREE.CylinderGeometry(0.2, 0.2, 0.08, 18), leather, [x, 0.74, barZ + 0.75]);
    add(scene, new THREE.CylinderGeometry(0.03, 0.04, 0.72, 8), brass, [x, 0.36, barZ + 0.75]);
    add(scene, new THREE.CylinderGeometry(0.2, 0.22, 0.03, 18), stoolMat, [x, 0.02, barZ + 0.75]);
  }
  for (const [x, z] of [[-3.5, 1.6], [-1.2, 2.6], [2.2, 2.2], [4.0, 0.6]]) {
    add(scene, new THREE.CylinderGeometry(0.45, 0.45, 0.05, 24), barWood, [x, 0.74, z]);
    add(scene, new THREE.CylinderGeometry(0.05, 0.07, 0.72, 10), stoolMat, [x, 0.36, z]);
    for (const a of [0.3, 2.4, 4.3]) {
      const cx = x + Math.cos(a) * 0.75, cz = z + Math.sin(a) * 0.75;
      add(scene, new THREE.BoxGeometry(0.42, 0.05, 0.42), stoolMat, [cx, 0.46, cz], { rot: [0, a, 0] });
      for (const [dx, dz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) add(scene, new THREE.CylinderGeometry(0.018, 0.018, 0.46, 6), stoolMat, [cx + dx, 0.23, cz + dz]);
    }
    add(scene, new THREE.CylinderGeometry(0.042, 0.034, 0.15, 16), glassMat, [x + 0.1, 0.85, z]);
    add(scene, new THREE.CylinderGeometry(0.038, 0.031, 0.1, 16), aleMat, [x + 0.1, 0.83, z]);
  }
  dust(scene, V(0, 0.5, -1), 4, 2.2, 400, '#ffd7a0');

  ctrl.grade = { uWarm: 0.75, uVignette: 1.0, uGrain: 0.06, uContrast: 1.06, uDesat: 0 };
  ctrl.bloom = [0.4, 0.55, 0.97]; ctrl.exposure = 1.0;
  ctrl.barZ = barZ;
  ctrl.spots = {
    bartender: V(0.2, 0, barZ - 0.75),
    maggie: V(-1.8, 0, barZ - 0.75),
    terry: V(1.5, 0, barZ + 0.75),
    stoolL: V(-1.5, 0, barZ + 0.75),
  };
  ctrl.update = (dt, raw, t) => {
    fire.intensity = 7 + Math.sin(t * 13) * 1.2 + Math.sin(t * 7.3) * 1.4 + Math.random() * 0.8;
    embers.material.color.setRGB(4 + Math.sin(t * 9) * 0.8, 1.2 + Math.sin(t * 6) * 0.2, 0.2);
    rain.offset.y = (t * 0.03) % 1;
    for (const m of coneMats) m.uniforms.uTime.value = t;
    pendants.forEach((p, i) => p.rotation.z = Math.sin(t * 0.6 + i) * 0.015);
    ctrl.updaters.forEach(u => u(dt, raw, t));
  };
  return ctrl;
}

// =====================================================================
// GYM: the back room
// =====================================================================
export function buildGym(envMap) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0a0807');
  scene.fog = new THREE.FogExp2('#110c09', 0.05);
  const ctrl = { scene, updaters: [] };
  const W = 10, D = 9, H = 3.4;
  room(scene, { w: W, d: D, h: H, wallMat: brickMat([3, 1.1], [112, 60, 46], 13), floorMat: std({ map: (() => { const t = TX.concrete(31).map.clone(); t.needsUpdate = true; t.repeat.set(2, 2); return t; })(), roughness: 0.7 }), ceilMat: std({ color: '#191311', roughness: 1 }) });
  // rubber mat
  add(scene, new THREE.BoxGeometry(4.5, 0.03, 4.5), std({ color: '#1b1b1d', roughness: 0.8, map: TX.fabric('#ffffff', 21) }), [0, 0.015, 0], { cast: false });
  // lamp
  const spot = new THREE.SpotLight('#ffd8aa', 9, 10, 0.8, 0.6, 2);
  spot.position.set(0.3, H - 0.35, 0.2); spot.target.position.set(0, 0, 0);
  spot.castShadow = true; spot.shadow.mapSize.set(2048, 2048); spot.shadow.bias = -0.0004; spot.shadow.normalBias = 0.02;
  scene.add(spot, spot.target);
  add(scene, new THREE.CylinderGeometry(0.25, 0.4, 0.22, 20, 1, true), std({ color: '#2a2a2a', metalness: 0.7, roughness: 0.4, side: THREE.DoubleSide }), [0.3, H - 0.3, 0.2]);
  add(scene, new THREE.CircleGeometry(0.24, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe0b0').multiplyScalar(5) }), [0.3, H - 0.4, 0.2], { rot: [Math.PI / 2, 0, 0], cast: false });
  lightCone(scene, [0.3, H - 0.4, 0.2], '#ffd6a0', 0.24, 2.3, H - 0.4, 0.1);
  dust(scene, V(0.3, 0, 0.2), 2, H - 0.6, 500);
  scene.add(new THREE.HemisphereLight('#5a4030', '#080504', 0.4));
  const fill = new THREE.PointLight('#6a86b8', 6, 9, 2); fill.position.set(-3.5, 2.2, 3); scene.add(fill);
  const warm = new THREE.PointLight('#ff9a50', 4, 8, 2); warm.position.set(3.5, 2.0, -3); scene.add(warm);
  // heavy bag
  const bag = new THREE.Group(); bag.position.set(0, H - 0.2, -0.9); scene.add(bag);
  const chain = add(bag, new THREE.CylinderGeometry(0.008, 0.008, 1.0, 4), std({ color: '#777', metalness: 1, roughness: 0.4 }), [0, -0.5, 0]);
  const leatherBag = new THREE.MeshPhysicalMaterial({ color: '#5a1a14', roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.4, envMap, envMapIntensity: 0.6 });
  const bagBody = add(bag, new THREE.CylinderGeometry(0.19, 0.19, 1.15, 26), leatherBag, [0, -1.6, 0]);
  add(bag, new THREE.SphereGeometry(0.19, 26, 10, 0, Math.PI * 2, 0, Math.PI / 2), leatherBag, [0, -1.025, 0]);
  add(bag, new THREE.SphereGeometry(0.19, 26, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), leatherBag, [0, -2.175, 0]);
  for (const y of [-1.2, -2.0]) add(bag, new THREE.CylinderGeometry(0.193, 0.193, 0.04, 26), std({ color: '#1a1a1a', roughness: 0.6 }), [0, y, 0]);
  ctrl.bag = bag;
  ctrl.bagState = { ax: 0, az: 0, vx: 0, vz: 0 };
  ctrl.hitBag = (strength, dirX = 0) => { ctrl.bagState.vx += strength * 0.9; ctrl.bagState.vz += dirX * strength * 0.5; };
  // bench + weights + skipping rope hook + mirror
  const metal = std({ color: '#2a2c2f', metalness: 0.8, roughness: 0.4, envMap });
  add(scene, new THREE.BoxGeometry(1.4, 0.08, 0.35), std({ color: '#3a1010', roughness: 0.5 }), [3.2, 0.45, 2.6]);
  add(scene, new THREE.BoxGeometry(0.06, 0.45, 0.3), metal, [2.7, 0.22, 2.6]); add(scene, new THREE.BoxGeometry(0.06, 0.45, 0.3), metal, [3.7, 0.22, 2.6]);
  for (let i = 0; i < 4; i++) add(scene, new THREE.CylinderGeometry(0.2 - i * 0.03, 0.2 - i * 0.03, 0.05, 20), metal, [-3.6, 0.025 + i * 0.05, 3.2]);
  const bar = add(scene, new THREE.CylinderGeometry(0.015, 0.015, 1.8, 8), std({ color: '#999', metalness: 1, roughness: 0.3, envMap }), [-3.0, 0.2, 2.2]); bar.rotation.z = Math.PI / 2;
  for (const x of [-3.7, -2.3]) { const pl = add(scene, new THREE.CylinderGeometry(0.2, 0.2, 0.05, 20), metal, [x, 0.2, 2.2]); pl.rotation.z = Math.PI / 2; }
  add(scene, new THREE.PlaneGeometry(2.2, 1.6), std({ color: '#777', metalness: 1, roughness: 0.08, envMap, envMapIntensity: 0.6 }), [-W / 2 + 0.03, 1.5, -0.5], { rot: [0, Math.PI / 2, 0], cast: false });
  posterOn(scene, [2.4, 1.7, -D / 2 + 0.01], 0, [{ t: 'NO PAIN', size: 80 }, { t: 'NO', size: 80, y: 260 }, { t: 'PINTS', size: 80, y: 360 }, { t: '— TEL', size: 40, y: 470, font: '"Barlow Condensed"' }], ['#e8dcc0', '#111', '#8b1212'], 41, 0.6);
  posterOn(scene, [-2.4, 1.7, -D / 2 + 0.01], 0, [{ t: 'KIDD', size: 90 }, { t: 'v DOYLE', size: 70, y: 240 }, { t: 'SOLD OUT', size: 50, y: 340 }, { t: '1994', size: 50, y: 420 }], ['#d8cdb0', '#1b1b1b', '#1d3e8a'], 42, 0.6);

  ctrl.grade = { uWarm: 0.7, uVignette: 1.0, uGrain: 0.07, uContrast: 1.08, uDesat: 0.05 };
  ctrl.bloom = [0.4, 0.55, 0.97]; ctrl.exposure = 1.0;
  ctrl.update = (dt, raw, t) => {
    const b = ctrl.bagState;
    b.vx += (-b.ax * 14 - b.vx * 1.6) * dt; b.ax += b.vx * dt;
    b.vz += (-b.az * 14 - b.vz * 1.6) * dt; b.az += b.vz * dt;
    bag.rotation.x = -b.ax * 0.35; bag.rotation.z = b.az * 0.35;
    for (const m of coneMats) m.uniforms.uTime.value = t;
    ctrl.updaters.forEach(u => u(dt, raw, t));
  };
  return ctrl;
}

// Simple pub-scene "ring" for the tutorial scrap (fight in the bar)
export function pubArena(pub) {
  return { scene: pub.scene, floorY: 0, bounds: 2.2, center: V(0, 0, 0.8), crowd: null };
}
