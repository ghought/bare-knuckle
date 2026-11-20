// Procedurally generated human bodies.
// Each body is a signed-distance field built from ~80 anatomical shapes (muscles, skull, jaw, nose...),
// meshed with marching cubes into one smooth surface, then skinned to a Mixamo-style skeleton
// so ModelRig (models.js) can animate it exactly like a downloaded character.
import * as THREE from 'three';
import { edgeTable, triTable } from 'three/addons/objects/MarchingCubes.js';
import { noiseTex, fabric } from './textures.js';
import { registerAsset } from './models.js';

// ---------- tags (surface regions -> materials) ----------
const TAGS = ['skin', 'cloth', 'shirt', 'boot', 'wrap', 'hair', 'eye', 'cap', 'belt', 'lip', 'sclera'];
const T = Object.fromEntries(TAGS.map((t, i) => [t, i]));

// ---------- SDF primitives ----------
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
function smin(a, b, k) { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
function smax(a, b, k) { return -smin(-a, -b, k); }

function rotMat(q) { // inverse rotation (world -> local) as 9 numbers
  const m = new THREE.Matrix4().makeRotationFromQuaternion(q).invert().elements;
  return [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]];
}
function qFromDir(dir, roll = 0) { // local +Y along dir
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...dir).normalize());
  if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), roll));
  return q;
}

class Prim {
  constructor(o) { Object.assign(this, { k: 0.02, tag: T.skin, op: 'add', cuts: null }, o); }
  eval(x, y, z) {
    let d;
    if (this.type === 'ell') {
      let px = x - this.c[0], py = y - this.c[1], pz = z - this.c[2];
      if (this.m) { const m = this.m; const lx = m[0] * px + m[1] * py + m[2] * pz, ly = m[3] * px + m[4] * py + m[5] * pz, lz = m[6] * px + m[7] * py + m[8] * pz; px = lx; py = ly; pz = lz; }
      const r = this.r;
      const k0 = Math.hypot(px / r[0], py / r[1], pz / r[2]);
      const k1 = Math.hypot(px / (r[0] * r[0]), py / (r[1] * r[1]), pz / (r[2] * r[2]));
      d = k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(r[0], r[1], r[2]);
    } else if (this.type === 'cone') {
      const a = this.a, bax = this.ba[0], bay = this.ba[1], baz = this.ba[2];
      const pax = x - a[0], pay = y - a[1], paz = z - a[2];
      const t = clamp((pax * bax + pay * bay + paz * baz) / this.bb, 0, 1);
      d = Math.hypot(pax - bax * t, pay - bay * t, paz - baz * t) - (this.r1 + (this.r2 - this.r1) * t);
    } else if (this.type === 'box') {
      let px = x - this.c[0], py = y - this.c[1], pz = z - this.c[2];
      if (this.m) { const m = this.m; const lx = m[0] * px + m[1] * py + m[2] * pz, ly = m[3] * px + m[4] * py + m[5] * pz, lz = m[6] * px + m[7] * py + m[8] * pz; px = lx; py = ly; pz = lz; }
      const qx = Math.abs(px) - this.h[0] + this.rr, qy = Math.abs(py) - this.h[1] + this.rr, qz = Math.abs(pz) - this.h[2] + this.rr;
      d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - this.rr;
    }
    if (this.cuts) for (const c of this.cuts) d = Math.max(d, (x - c.o[0]) * c.n[0] + (y - c.o[1]) * c.n[1] + (z - c.o[2]) * c.n[2]);
    return d;
  }
  bounds() {
    const m = this.k + 0.02;
    if (this.type === 'cone') {
      const b = [this.a[0] + this.ba[0], this.a[1] + this.ba[1], this.a[2] + this.ba[2]], r = Math.max(this.r1, this.r2) + m;
      return [Math.min(this.a[0], b[0]) - r, Math.min(this.a[1], b[1]) - r, Math.min(this.a[2], b[2]) - r, Math.max(this.a[0], b[0]) + r, Math.max(this.a[1], b[1]) + r, Math.max(this.a[2], b[2]) + r];
    }
    const e = this.type === 'ell' ? Math.max(...this.r) + m : Math.hypot(...this.h) + m;
    return [this.c[0] - e, this.c[1] - e, this.c[2] - e, this.c[0] + e, this.c[1] + e, this.c[2] + e];
  }
}
const ell = (c, r, o = {}) => new Prim({ type: 'ell', c, r, m: o.q ? rotMat(o.q) : null, ...o });
const cone = (a, b, r1, r2, o = {}) => { const ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; return new Prim({ type: 'cone', a, ba, bb: ba[0] ** 2 + ba[1] ** 2 + ba[2] ** 2 || 1e-6, r1, r2, ...o }); };
const box = (c, h, rr, o = {}) => new Prim({ type: 'box', c, h, rr, m: o.q ? rotMat(o.q) : null, ...o });
const add3 = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const mirror = p => [-p[0], p[1], p[2]];

// ---------- Skeleton (bind pose: A-pose, arms 50° down, facing +Z, metres) ----------
function skeleton(L) {
  const sw = L.sw, sx = 0.19 * sw;
  const armDir = [Math.cos(50 * Math.PI / 180), -Math.sin(50 * Math.PI / 180), 0];
  const J = {
    Hips: [0, 0.98, 0], Spine: [0, 1.08, 0], Spine1: [0, 1.2, 0], Spine2: [0, 1.32, 0], Neck: [0, 1.49, -0.01], Head: [0, 1.6, 0], HeadTop_End: [0, 1.81, 0],
    LeftShoulder: [0.04, 1.44, -0.01], LeftArm: [sx, 1.425, -0.01],
    LeftUpLeg: [0.093 * L.hw, 0.935, 0], LeftLeg: [0.1 * L.hw, 0.5, 0.008], LeftFoot: [0.105 * L.hw, 0.085, -0.015], LeftToeBase: [0.108 * L.hw, 0.02, 0.11],
  };
  J.LeftForeArm = add3(J.LeftArm, armDir, 0.29);
  J.LeftHand = add3(J.LeftForeArm, armDir, 0.265);
  J.LeftFist = add3(J.LeftHand, armDir, 0.06);
  for (const k of Object.keys(J)) if (k.startsWith('Left')) J['Right' + k.slice(4)] = mirror(J[k]);
  J.armDir = armDir; J.armDirR = [-armDir[0], armDir[1], 0];
  return J;
}
const PARENT = {
  Spine: 'Hips', Spine1: 'Spine', Spine2: 'Spine1', Neck: 'Spine2', Head: 'Neck', HeadTop_End: 'Head',
  LeftShoulder: 'Spine2', LeftArm: 'LeftShoulder', LeftForeArm: 'LeftArm', LeftHand: 'LeftForeArm',
  RightShoulder: 'Spine2', RightArm: 'RightShoulder', RightForeArm: 'RightArm', RightHand: 'RightForeArm',
  LeftUpLeg: 'Hips', LeftLeg: 'LeftUpLeg', LeftFoot: 'LeftLeg', LeftToeBase: 'LeftFoot',
  RightUpLeg: 'Hips', RightLeg: 'RightUpLeg', RightFoot: 'RightLeg', RightToeBase: 'RightFoot',
};
// skin-weight segments: [bone, from, to, radius, side]
function weightSegments(J, L) {
  const S = [
    ['Hips', J.Hips, [0, 0.9, 0], 0.15 * L.hw, 0], ['Spine', J.Spine, J.Spine1, 0.13 * L.sw, 0], ['Spine1', J.Spine1, J.Spine2, 0.145 * L.sw, 0],
    ['Spine2', J.Spine2, [0, 1.43, 0], 0.16 * L.sw, 0], ['Neck', J.Neck, J.Head, 0.055, 0], ['Head', J.Head, J.HeadTop_End, 0.085, 0],
  ];
  for (const [s, sg] of [['Left', 1], ['Right', -1]]) {
    S.push([s + 'Shoulder', J[s + 'Shoulder'], J[s + 'Arm'], 0.05, sg]);
    S.push([s + 'Arm', J[s + 'Arm'], J[s + 'ForeArm'], 0.05 * L.mus, sg]);
    S.push([s + 'ForeArm', J[s + 'ForeArm'], J[s + 'Hand'], 0.038 * L.mus, sg]);
    S.push([s + 'Hand', J[s + 'Hand'], J[s + 'Fist'], 0.045, sg]);
    S.push([s + 'UpLeg', J[s + 'UpLeg'], J[s + 'Leg'], 0.085, sg]);
    S.push([s + 'Leg', J[s + 'Leg'], J[s + 'Foot'], 0.06, sg]);
    S.push([s + 'Foot', J[s + 'Foot'], J[s + 'ToeBase'], 0.05, sg]);
  }
  return S;
}

// ---------- Anatomy ----------
function anatomy(look, opt) {
  const f = look.sex === 'f';
  const b = look.build || 1;                       // 0.9 lean .. 1.18 heavy
  const mus = f ? 0.8 : 0.98 + (b - 0.9) * 1.0;     // muscle mass
  const L = { sw: f ? 0.88 : 1.03 + (b - 1) * 0.6, hw: f ? 1.12 : 1.0 + (b - 1) * 0.3, mus, fat: Math.max(0, b - 1.05) * 4 };
  const J = skeleton(L);
  const P = [];
  const shirt = !!opt.shirt;
  const torsoTag = shirt ? T.shirt : T.skin, sh = shirt ? 0.008 : 0; // shirts sit a little proud of the skin
  const sw = L.sw, m = mus;

  // --- torso ---
  P.push(ell([0, 0.955, -0.005], [0.155 * L.hw, 0.12, 0.105], { tag: T.cloth, k: 0.05 }));                 // pelvis (in trousers)
  P.push(ell([0, 1.1, 0.0], [0.14 * sw + L.fat * 0.03 + sh, 0.13, 0.095 + L.fat * 0.04 + sh], { tag: torsoTag, k: 0.06 })); // abdomen
  P.push(ell([0, 1.26, -0.005], [0.168 * sw + sh, 0.155, 0.116 + sh], { tag: torsoTag, k: 0.06 }));        // ribcage
  P.push(ell([0, 1.405, -0.025], [0.135 * sw + sh, 0.065, 0.085 + sh], { tag: torsoTag, k: 0.05 }));      // upper back / traps
  for (const s of [1, -1]) {
    if (f) P.push(ell([s * 0.06, 1.29, 0.075], [0.06, 0.06, 0.055], { tag: torsoTag, k: 0.035 }));
    else P.push(ell([s * 0.07 * sw, 1.335, 0.074 + sh], [0.09 * sw * m, 0.066 * m, 0.045 * m + sh], { tag: torsoTag, k: 0.03, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, s * 0.25)) })); // pecs
    P.push(ell([s * 0.122 * sw, 1.28, -0.03], [0.074 * sw * m, 0.14, 0.07 + sh], { tag: torsoTag, k: 0.05 })); // lats
    P.push(ell([s * 0.065 * sw, 1.465, -0.025], [0.062 * m + sh, 0.05 * m + sh, 0.052 + sh], { tag: torsoTag, k: 0.045 }));  // traps
    P.push(ell([s * 0.197 * sw, 1.405, -0.008], [0.068 * m + sh, 0.062 * m + sh, 0.066 * m + sh], { tag: torsoTag, k: 0.035 })); // deltoids
    P.push(ell([s * 0.065 * L.hw, 0.92, -0.06], [0.078 * L.hw, 0.09, 0.07], { tag: T.cloth, k: 0.04 }));       // glutes
    P.push(ell([s * 0.11 * sw, 1.13, 0.02], [0.04, 0.08, 0.06], { tag: torsoTag, k: 0.05 }));                   // obliques
  }
  if (!shirt && !f && m > 0.85) for (let r = 0; r < 3; r++) for (const s of [1, -1]) P.push(ell([s * 0.032, 1.17 - r * 0.058, 0.086 + L.fat * 0.03], [0.028, 0.024, 0.013], { k: 0.025 })); // abs
  P.push(ell([0, 1.0, 0.0], [0.148 * L.hw, 0.03, 0.103], { tag: T.belt, k: 0.01 }));                        // belt / waistband

  // --- neck & head ---
  P.push(cone([0, 1.42, -0.015], [0, 1.6, -0.01], 0.068 * (f ? 0.82 : 0.95 + (b - 1) * 0.7), 0.056 * (f ? 0.85 : 1), { k: 0.045 }));
  const hy = 1.6;
  P.push(ell([0, hy + 0.1, -0.008], [0.081, 0.098, 0.1], { k: 0.03 }));                              // cranium
  P.push(ell([0, hy + 0.036, 0.022], [f ? 0.064 : 0.07, 0.072, 0.078], { k: 0.035 }));               // face / jaw mass
  P.push(ell([0, hy - 0.018, 0.068], [f ? 0.022 : 0.028, 0.02, 0.022], { k: 0.02 }));               // chin
  for (const s of [1, -1]) {
    P.push(ell([s * 0.054, hy + 0.012, 0.0], [0.024, 0.032, 0.042], { k: 0.025 }));                  // jaw angle
    P.push(ell([s * 0.046, hy + 0.067, 0.066], [0.024, 0.014, 0.018], { k: 0.02 }));                  // cheekbones
    P.push(ell([s * 0.082, hy + 0.07, -0.004], [0.011, 0.028, 0.02], { k: 0.008 }));                  // ears
    P.push(ell([s * 0.012, hy + 0.051, 0.103], [0.009, 0.007, 0.008], { k: 0.008 }));                 // nostril wings
  }
  if (!f) P.push(cone([-0.044, hy + 0.106, 0.083], [0.044, hy + 0.106, 0.083], 0.0125, 0.0125, { k: 0.02 })); // brow ridge
  P.push(cone([0, hy + 0.1, 0.094], [0, hy + 0.055, 0.115], 0.008, f ? 0.011 : 0.013, { k: 0.012 })); // nose
  P.push(ell([0, hy + 0.022, 0.088], [0.024, 0.008, 0.01], { tag: T.lip, k: 0.008 }));              // lips
  // eyes
  for (const s of [1, -1]) {
    P.push(ell([s * 0.032, hy + 0.083, 0.095], [0.016, 0.0105, 0.01], { op: 'sub', k: 0.01 }));      // sockets
    P.push(ell([s * 0.032, hy + 0.083, 0.082], [0.0125, 0.0125, 0.0125], { tag: T.sclera, k: 0.0 }));  // eyeballs
    P.push(ell([s * 0.032, hy + 0.083, 0.094], [0.0072, 0.0072, 0.004], { tag: T.eye, op: 'paint' }));   // iris
    P.push(ell([s * 0.032, hy + 0.0905, 0.089], [0.0165, 0.0062, 0.012], { k: 0.004 }));                   // upper lid
    P.push(ell([s * 0.032, hy + 0.0745, 0.088], [0.015, 0.0038, 0.011], { k: 0.004 }));                    // lower lid
    P.push(ell([s * 0.035, hy + 0.107, 0.092], [0.022, 0.0055, 0.03], { tag: T.hair, op: 'paint', q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -s * 0.12)) })); // eyebrows
  }
  hair(P, look, hy);

  // --- arms ---
  for (const [s, sg] of [['Left', 1], ['Right', -1]]) {
    const A = J[s + 'Arm'], E = J[s + 'ForeArm'], W = J[s + 'Hand'], dir = sg > 0 ? J.armDir : J.armDirR;
    const qa = qFromDir(dir);
    const sleeve = shirt ? T.shirt : T.skin;
    P.push(cone(A, E, 0.056 * m + sh, 0.04 * m + sh, { tag: sleeve, k: 0.03 }));
    P.push(ell(add3(add3(A, dir, 0.14), [0, 0, 0.024]), [0.043 * m + sh, 0.09, 0.042 * m + sh], { tag: sleeve, q: qa, k: 0.03 }));   // biceps
    P.push(ell(add3(add3(A, dir, 0.12), [0, 0, -0.022]), [0.038 * m + sh, 0.09, 0.034 * m + sh], { tag: sleeve, q: qa, k: 0.03 }));  // triceps
    P.push(cone(E, W, 0.046 * m, 0.03, { k: 0.025 }));
    P.push(ell(add3(add3(E, dir, 0.07), [0, 0.005, 0.012]), [0.04 * m, 0.08, 0.036 * m], { q: qa, k: 0.03 }));                     // forearm muscle
    const fistC = add3(W, dir, 0.058);
    P.push(box(fistC, [0.042, 0.048, 0.04], 0.022, { tag: opt.wraps ? T.wrap : T.skin, q: qa, k: 0.012 }));                         // fist
    if (opt.wraps) P.push(cone(add3(W, dir, -0.035), add3(W, dir, 0.01), 0.032, 0.036, { tag: T.wrap, k: 0.008 }));
  }
  // --- legs (trousers) & boots ---
  for (const s of ['Left', 'Right']) {
    const H = J[s + 'UpLeg'], K = J[s + 'Leg'], F = J[s + 'Foot'];
    const sg = s === 'Left' ? 1 : -1;
    P.push(cone(add3(H, [0, 0.03, 0]), K, 0.098 * L.hw * (0.9 + m * 0.12), 0.068, { tag: T.cloth, k: 0.05 }));
    P.push(ell(add3(H, [sg * 0.012, -0.17, 0.035]), [0.07, 0.14, 0.065], { tag: T.cloth, k: 0.04 }));                                // quads
    P.push(cone(K, add3(F, [0, 0.03, 0]), 0.066, 0.058, { tag: T.cloth, k: 0.04 }));
    P.push(ell(add3(K, [0, -0.13, -0.035]), [0.055, 0.1, 0.05], { tag: T.cloth, k: 0.04 }));                                          // calves
    P.push(box([F[0], 0.05, F[2] + 0.055], [0.052, 0.05, 0.125], 0.035, { tag: T.boot, k: 0.02 }));
    P.push(cone([F[0], 0.04, F[2]], [F[0], 0.17, F[2]], 0.058, 0.06, { tag: T.boot, k: 0.02 }));
  }
  return { P, J, L };
}

function hair(P, look, hy) {
  const st = look.hairStyle || 'short';
  // hairline: plane sloping from forehead down to nape; points above it get hair
  const hl = (front, back) => { const n = new THREE.Vector3(0, -1, (front - back) / 0.2).normalize(); return { n: [0, n.y, n.z], o: [0, hy + front, 0.1] }; };
  if (st === 'short' || st === 'slick') P.push(ell([0, hy + 0.105, -0.014], [0.0865, 0.103, 0.106], { tag: T.hair, k: 0.01, cuts: [hl(0.15, 0.02), { n: [0, -0.6, 0.8], o: [0, hy + 0.14, 0.05] }] }));
  else if (st === 'buzz') P.push(ell([0, hy + 0.1, -0.009], [0.0835, 0.1005, 0.1025], { tag: T.hair, k: 0.004, cuts: [hl(0.14, 0.03)] }));
  else if (st === 'mohawk') P.push(ell([0, hy + 0.2, -0.015], [0.013, 0.03, 0.095], { tag: T.hair, k: 0.02 }));
  else if (st === 'bob') P.push(ell([0, hy + 0.09, -0.02], [0.1, 0.12, 0.115], { tag: T.hair, k: 0.012, cuts: [{ n: [0, -1, 0], o: [0, hy + 0.005, 0] }, { n: [0, 0.35, 1], o: [0, hy + 0.125, 0.06] }] }));
  else if (st === 'cap') {
    P.push(ell([0, hy + 0.165, 0.0], [0.096, 0.05, 0.11], { tag: T.cap, k: 0.01 }));
    P.push(ell([0, hy + 0.15, 0.1], [0.075, 0.009, 0.045], { tag: T.cap, k: 0.006 }));
  }
  if (look.beard) {
    P.push(ell([0, hy + 0.025, 0.03], [0.077, 0.068, 0.078], { tag: T.hair, k: 0.008, cuts: [{ n: [0, 1, 0], o: [0, hy + 0.058, 0] }, { n: [0, 0, -1], o: [0, 0, -0.005] }] }));
  }
}

// ---------- Field + marching cubes ----------
function buildMesh(P, res, [x0, y0, z0, x1, y1, z1]) {
  const h = res;
  const nx = Math.ceil((x1 - x0) / h) + 1, ny = Math.ceil((y1 - y0) / h) + 1, nz = Math.ceil((z1 - z0) / h) + 1;
  const N = nx * ny * nz;
  const F = new Float32Array(N).fill(1);
  const R = new Float32Array(N).fill(1);      // raw closest distance, for region tags
  const G = new Uint8Array(N);                // tag
  const idx = (i, j, k) => i + nx * (j + ny * k);
  const range = (b) => [Math.max(0, Math.floor((b[0] - x0) / h)), Math.max(0, Math.floor((b[1] - y0) / h)), Math.max(0, Math.floor((b[2] - z0) / h)),
    Math.min(nx - 1, Math.ceil((b[3] - x0) / h)), Math.min(ny - 1, Math.ceil((b[4] - y0) / h)), Math.min(nz - 1, Math.ceil((b[5] - z0) / h))];
  const order = [...P.filter(p => p.op === 'add' && p.tag !== T.sclera), ...P.filter(p => p.op === 'sub'), ...P.filter(p => p.op === 'add' && p.tag === T.sclera), ...P.filter(p => p.op === 'paint')];
  for (const p of order) {
    const [i0, j0, k0, i1, j1, k1] = range(p.bounds());
    for (let k = k0; k <= k1; k++) {
      const z = z0 + k * h;
      for (let j = j0; j <= j1; j++) {
        const y = y0 + j * h;
        let id = idx(i0, j, k);
        for (let i = i0; i <= i1; i++, id++) {
          const d = p.eval(x0 + i * h, y, z);
          if (p.op === 'sub') { F[id] = smax(F[id], -d, p.k); continue; }
          if (p.op === 'paint') { if (d < 0) G[id] = p.tag; continue; }
          F[id] = smin(F[id], d, p.k);
          if (d < R[id]) { R[id] = d; G[id] = p.tag; }
        }
      }
    }
  }
  // marching cubes with shared edge vertices
  const edgeVert = new Int32Array(N * 3).fill(-1);
  const pos = [], nrm = [], tag = [], index = [];
  const grad = (i, j, k, out) => {
    const c = (a, b, cc) => F[idx(clamp(a, 0, nx - 1), clamp(b, 0, ny - 1), clamp(cc, 0, nz - 1))];
    out[0] = c(i + 1, j, k) - c(i - 1, j, k); out[1] = c(i, j + 1, k) - c(i, j - 1, k); out[2] = c(i, j, k + 1) - c(i, j, k - 1);
  };
  const ga = [0, 0, 0], gb = [0, 0, 0];
  const vertexOn = (i, j, k, axis) => {
    const key = idx(i, j, k) * 3 + axis;
    if (edgeVert[key] >= 0) return edgeVert[key];
    const i2 = i + (axis === 0), j2 = j + (axis === 1), k2 = k + (axis === 2);
    const a = F[idx(i, j, k)], b = F[idx(i2, j2, k2)];
    const t = clamp(a / (a - b), 0, 1);
    pos.push(x0 + (i + (i2 - i) * t) * h, y0 + (j + (j2 - j) * t) * h, z0 + (k + (k2 - k) * t) * h);
    grad(i, j, k, ga); grad(i2, j2, k2, gb);
    const nX = ga[0] + (gb[0] - ga[0]) * t, nY = ga[1] + (gb[1] - ga[1]) * t, nZ = ga[2] + (gb[2] - ga[2]) * t;
    const l = Math.hypot(nX, nY, nZ) || 1;
    nrm.push(nX / l, nY / l, nZ / l);
    const ia = idx(i, j, k), ib = idx(i2, j2, k2);
    tag.push(a < 0 ? G[ia] : G[ib]);
    edgeVert[key] = pos.length / 3 - 1;
    return edgeVert[key];
  };
  const EDGES = [[0, 0, 0, 0], [1, 0, 0, 1], [0, 1, 0, 0], [0, 0, 0, 1], [0, 0, 1, 0], [1, 0, 1, 1], [0, 1, 1, 0], [0, 0, 1, 1], [0, 0, 0, 2], [1, 0, 0, 2], [1, 1, 0, 2], [0, 1, 0, 2]];
  const CORN = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  const ev = new Int32Array(12);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let ci = 0;
    for (let c = 0; c < 8; c++) if (F[idx(i + CORN[c][0], j + CORN[c][1], k + CORN[c][2])] < 0) ci |= 1 << c;
    if (ci === 0 || ci === 255) continue;
    const em = edgeTable[ci];
    for (let e = 0; e < 12; e++) if (em & (1 << e)) { const E = EDGES[e]; ev[e] = vertexOn(i + E[0], j + E[1], k + E[2], E[3]); }
    for (let t = ci * 16; triTable[t] !== -1; t += 3) index.push(ev[triTable[t]], ev[triTable[t + 1]], ev[triTable[t + 2]]);
  }
  // baked ambient occlusion: how far the field opens up along the normal (creases come out darker)
  const sampleF = (x, y, z) => {
    const fx = clamp((x - x0) / h, 0, nx - 1.001), fy = clamp((y - y0) / h, 0, ny - 1.001), fz = clamp((z - z0) / h, 0, nz - 1.001);
    const i = fx | 0, j = fy | 0, k = fz | 0, u = fx - i, v = fy - j, w = fz - k;
    const c = (a, b, cc) => F[idx(a, b, cc)];
    const l = (a, b, t) => a + (b - a) * t;
    return l(l(l(c(i, j, k), c(i + 1, j, k), u), l(c(i, j + 1, k), c(i + 1, j + 1, k), u), v), l(l(c(i, j, k + 1), c(i + 1, j, k + 1), u), l(c(i, j + 1, k + 1), c(i + 1, j + 1, k + 1), u), v), w);
  };
  const nv = pos.length / 3, ao = new Float32Array(nv);
  for (let q = 0; q < nv; q++) {
    let acc = 0;
    for (const dd of [0.012, 0.03]) acc += clamp(sampleF(pos[q * 3] + nrm[q * 3] * dd, pos[q * 3 + 1] + nrm[q * 3 + 1] * dd, pos[q * 3 + 2] + nrm[q * 3 + 2] * dd) / dd, 0, 1);
    ao[q] = 0.45 + 0.55 * (acc / 2);
  }
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), tag: new Uint8Array(tag), index, ao };
}

function stitch(A, B, aMaxY, bMinY) {
  const keep = (M, test) => { const out = []; for (let t = 0; t < M.index.length; t += 3) { const a = M.index[t], b = M.index[t + 1], c = M.index[t + 2]; const cy = (M.pos[a * 3 + 1] + M.pos[b * 3 + 1] + M.pos[c * 3 + 1]) / 3; if (test(cy)) out.push(a, b, c); } return out; };
  const ia = keep(A, y => y < aMaxY), ib = keep(B, y => y > bMinY);
  const na = A.pos.length / 3;
  const pos = new Float32Array(A.pos.length + B.pos.length); pos.set(A.pos); pos.set(B.pos, A.pos.length);
  const nrm = new Float32Array(A.nrm.length + B.nrm.length); nrm.set(A.nrm); nrm.set(B.nrm, A.nrm.length);
  const tag = new Uint8Array(A.tag.length + B.tag.length); tag.set(A.tag); tag.set(B.tag, A.tag.length);
  const ao = new Float32Array(A.ao.length + B.ao.length); ao.set(A.ao); ao.set(B.ao, A.ao.length);
  const index = ia; for (let q = 0; q < ib.length; q++) index.push(ib[q] + na);
  return { pos, nrm, tag, index, ao };
}

// Straight clothing seams (waistband, shirt collar & sleeves) decided per triangle from its centroid
function seamTag(tg, p, a, b, c, J, opt) {
  const x = (p[a * 3] + p[b * 3] + p[c * 3]) / 3, y = (p[a * 3 + 1] + p[b * 3 + 1] + p[c * 3 + 1]) / 3, z = (p[a * 3 + 2] + p[b * 3 + 2] + p[c * 3 + 2]) / 3;
  if (Math.abs(x) > 0.26 && y > 0.6) { // arms
    if (!opt.shirt) return tg === T.cloth || tg === T.belt ? T.skin : tg;
    const S = x > 0 ? J.LeftArm : J.RightArm, d = x > 0 ? J.armDir : J.armDirR;
    const t = (x - S[0]) * d[0] + (y - S[1]) * d[1] + (z - S[2]) * d[2];
    return t < 0.17 ? T.shirt : T.skin;
  }
  const waist = 1.0 + z * 0.08;
  if (y < waist - 0.016) return T.cloth;
  if (y < waist + 0.014) return T.belt;
  if (opt.shirt) {
    const neck = Math.abs(x) < 0.085 && y > 1.43 - Math.max(0, z) * 0.5; // collar line, a little lower at the front
    if (!neck && y < 1.56) return T.shirt;
  }
  return T.skin;
}

// ---------- Skinning ----------
function skinWeights(pos, segs, boneIndex) {
  const n = pos.length / 3;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const tmp = segs.map(() => 0);
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    for (let s = 0; s < segs.length; s++) {
      const [, a, b, r, side] = segs[s];
      if (side && side * x < -0.02) { tmp[s] = 0; continue; }
      const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
      const t = clamp(((x - a[0]) * bx + (y - a[1]) * by + (z - a[2]) * bz) / (bx * bx + by * by + bz * bz || 1), 0, 1);
      const d = Math.max(0.004, Math.hypot(x - a[0] - bx * t, y - a[1] - by * t, z - a[2] - bz * t) - r);
      tmp[s] = 1 / Math.pow(d, 5);
    }
    // top 4
    const top = tmp.map((w, s) => [w, s]).sort((p, q) => q[0] - p[0]).slice(0, 4);
    const sum = top.reduce((a, p) => a + p[0], 0) || 1;
    top.forEach(([w, s], c) => { si[v * 4 + c] = boneIndex[segs[s][0]]; sw[v * 4 + c] = w / sum; });
  }
  return { si, sw };
}

// ---------- Materials ----------
function materials(look, opt) {
  const env = opt.envMap, n = noiseTex(4);
  const skin = new THREE.MeshPhysicalMaterial({ name: 'Skin', color: '#ffffff', vertexColors: true, roughness: 0.5, roughnessMap: n, clearcoat: 0.08, clearcoatRoughness: 0.4, sheen: 0.25, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ff6a4a').multiplyScalar(0.3), envMap: env, envMapIntensity: 0.5 });
  const cloth = new THREE.MeshStandardMaterial({ name: 'Cloth', color: look.trousers || '#1a1a1e', roughness: 0.9, map: fabric('#ffffff', 6), envMap: env, envMapIntensity: 0.2 });
  const shirt = new THREE.MeshStandardMaterial({ name: 'Shirt', color: opt.shirt || '#333', roughness: 0.88, map: fabric('#ffffff', 8), envMap: env, envMapIntensity: 0.2 });
  const boot = new THREE.MeshStandardMaterial({ name: 'Boot', color: look.boots || '#151210', roughness: 0.4, envMap: env, envMapIntensity: 0.6 });
  const wrap = new THREE.MeshStandardMaterial({ name: 'Wrap', color: '#c9bfac', roughness: 1.0, map: fabric('#ffffff', 2), envMap: env, envMapIntensity: 0.2 });
  const hairM = new THREE.MeshStandardMaterial({ name: 'Hair', color: '#ffffff', vertexColors: true, roughness: look.hairStyle === 'slick' ? 0.35 : 0.85, envMap: env, envMapIntensity: 0.3 });
  const eye = new THREE.MeshStandardMaterial({ name: 'Eye', color: '#140e0b', roughness: 0.06, envMap: env, envMapIntensity: 1.2 });
  const cap = new THREE.MeshStandardMaterial({ name: 'Cap', color: '#4a4136', roughness: 0.95, map: fabric('#ffffff', 5), envMap: env, envMapIntensity: 0.2 });
  const belt = new THREE.MeshStandardMaterial({ name: 'Belt', color: '#2b1c12', roughness: 0.5, envMap: env, envMapIntensity: 0.5 });
  const lip = skin.clone(); lip.name = 'SkinLip'; lip.color = new THREE.Color(look.skin || '#d9a07c').multiply(new THREE.Color('#d08070'));
  const sclera = new THREE.MeshStandardMaterial({ name: 'Sclera', color: '#d8d0c4', roughness: 0.1, envMap: env, envMapIntensity: 1.0 });
  return [skin, cloth, shirt, boot, wrap, hairM, eye, cap, belt, lip, sclera];
}

// ---------- Public ----------
const built = new Map();
export function generatedBodyKey(look, opt = {}) {
  const L = { skin: look.skin, hair: look.hair, hairStyle: look.hairStyle, beard: !!look.beard, trousers: look.trousers, build: look.build, sex: look.sex || 'm', boots: look.boots };
  return 'gen:' + JSON.stringify([L, opt.shirt || null, !!opt.wraps, opt.res || 0.0095]);
}

export function generateBody(look, opt = {}) {
  const key = generatedBodyKey(look, opt);
  if (built.has(key)) return key;
  const t0 = performance.now();
  const { P, J, L } = anatomy(look, opt);
  // body at normal resolution, head at ~2x, stitched at the neck with a small overlap
  const body = buildMesh(P, opt.res || 0.0095, [-0.66, -0.02, -0.2, 0.66, 1.87, 0.24]);
  const head = buildMesh(P, opt.headRes || 0.0045, [-0.14, 1.5, -0.15, 0.14, 1.87, 0.18]);
  const mesh = stitch(body, head, 1.575, 1.556);
  // bones
  const bones = {}, list = [];
  for (const n of ['Hips', ...Object.keys(PARENT)]) { const b = new THREE.Bone(); b.name = n; bones[n] = b; list.push(b); }
  for (const n of list.map(b => b.name)) {
    const b = bones[n], p = J[n], par = PARENT[n];
    if (par) { bones[par].add(b); const pp = J[par]; b.position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]); }
    else b.position.set(...p);
  }
  const boneIndex = Object.fromEntries(list.map((b, i) => [b.name, i]));
  const { si, sw } = skinWeights(mesh.pos, weightSegments(J, L), boneIndex);
  // uvs: face damage canvas wraps around the head (front at u=0.25), everything else samples a blank corner
  const n = mesh.pos.length / 3, uv = new Float32Array(n * 2);
  for (let v = 0; v < n; v++) {
    const x = mesh.pos[v * 3], y = mesh.pos[v * 3 + 1], z = mesh.pos[v * 3 + 2];
    if (y > 1.54 && Math.abs(x) < 0.12) { uv[v * 2] = Math.atan2(x, z) / (Math.PI * 2) + 0.25; uv[v * 2 + 1] = clamp(0.61 + (y - 1.683) / 0.35, 0.02, 0.98); }
    else { uv[v * 2] = 0.98; uv[v * 2 + 1] = 0.02; }
  }
  // Skin-group regions (hair, brows, eyes, lips) are coloured per vertex, evaluated analytically against the
  // shapes that define them, so their edges are smooth instead of following the triangles.
  const SKIN_GROUP = new Set([T.skin, T.hair, T.eye, T.lip, T.sclera]);
  const C = c => new THREE.Color(c);
  const skinC = C(look.skin || '#d9a07c'), hairC = C(look.hair || '#2a1a10');
  const tagC = { [T.skin]: skinC, [T.hair]: hairC, [T.eye]: C('#120c0a'), [T.sclera]: C('#ddd4c6'), [T.lip]: skinC.clone().multiply(C('#c87a6c')) };
  const layers = P.filter(p => (p.op === 'paint') || (p.op === 'add' && p.tag === T.hair));
  const col = new Float32Array(n * 3);
  const tmpC = new THREE.Color();
  for (let v = 0; v < n; v++) {
    let tg = mesh.tag[v];
    const x = mesh.pos[v * 3], y = mesh.pos[v * 3 + 1], z = mesh.pos[v * 3 + 2];
    { // every vertex gets a skin-group colour (cloth materials ignore it), so seam triangles never go white
      const keep = tg;
      if (tg === T.hair || !SKIN_GROUP.has(tg)) tg = T.skin; // hair decided analytically below
      tmpC.copy(tagC[tg]);
      if (y > 1.5 && SKIN_GROUP.has(keep)) for (const p of layers) {
        const d = p.eval(x, y, z);
        const w = p.op === 'paint' ? clamp((0.0015 - d) / 0.003, 0, 1) : clamp((p.k * 0.5 + 0.002 - d) / 0.003, 0, 1);
        if (w > 0) tmpC.lerp(tagC[p.tag] || hairC, w);
      }
      mesh.tag[v] = keep === T.hair ? T.hair : SKIN_GROUP.has(keep) ? T.skin : keep;
    }
    tmpC.multiplyScalar(mesh.ao[v]);
    col[v * 3] = tmpC.r; col[v * 3 + 1] = tmpC.g; col[v * 3 + 2] = tmpC.b;
  }
  // group triangles by majority tag -> material
  const tris = mesh.index.length / 3, byTag = TAGS.map(() => []);
  for (let t = 0; t < tris; t++) {
    const a = mesh.index[t * 3], b = mesh.index[t * 3 + 1], c = mesh.index[t * 3 + 2];
    const ta = mesh.tag[a], tb = mesh.tag[b], tc = mesh.tag[c];
    let tg = tb === tc ? tb : ta;
    if (tg === T.skin || tg === T.cloth || tg === T.shirt || tg === T.belt) tg = seamTag(tg, mesh.pos, a, b, c, J, opt);
    byTag[tg].push(a, b, c);
  }
  // winding check: flip if triangles face inward
  const idxArr = [];
  const geo = new THREE.BufferGeometry();
  let start = 0;
  byTag.forEach((arr, ti) => { if (!arr.length) return; for (let q = 0; q < arr.length; q++) idxArr.push(arr[q]); geo.addGroup(start, arr.length, ti); start += arr.length; });
  {
    const [a, b, c] = idxArr, p = mesh.pos, nr = mesh.nrm;
    const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
    const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    if (fx * nr[a * 3] + fy * nr[a * 3 + 1] + fz * nr[a * 3 + 2] < 0) for (let t = 0; t < idxArr.length; t += 3) { const s = idxArr[t + 1]; idxArr[t + 1] = idxArr[t + 2]; idxArr[t + 2] = s; }
  }
  geo.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(idxArr, 1) : new THREE.Uint16BufferAttribute(idxArr, 1));
  geo.setAttribute('position', new THREE.BufferAttribute(mesh.pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(mesh.nrm, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  geo.computeBoundingSphere();
  const skinned = new THREE.SkinnedMesh(geo, materials(look, opt));
  skinned.name = 'GeneratedBody';
  const root = new THREE.Group();
  root.add(bones.Hips, skinned);
  root.updateMatrixWorld(true);
  skinned.bind(new THREE.Skeleton(list), skinned.matrixWorld);
  registerAsset(key, root);
  built.set(key, true);
  console.info(`generated body ${tris} tris in ${(performance.now() - t0).toFixed(0)} ms`);
  return key;
}
