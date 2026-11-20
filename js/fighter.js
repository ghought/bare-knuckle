import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { FaceDamage, torsoBump, noiseTex, fabric } from './textures.js';
import { ModelRig } from './models.js';
import { generateBody } from './bodygen.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const tmpA = V(), tmpB = V(), tmpC = V(), tmpD = V();
const qTmp = new THREE.Quaternion();
const eTmp = new THREE.Euler();

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
function dampV(v, target, k, dt) { v.lerp(target, 1 - Math.exp(-k * dt)); }

function lathe(profile, seg = 20) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg, -Math.PI, Math.PI * 2);
  g.computeVertexNormals();
  return g;
}

// ---------- Punch catalogue (fighter-local coords: +x = fighter's left, +z = forward) ----------
export const PUNCHES = {
  jab:   { hand: 'L', wind: 0.05, strike: 0.09, rec: 0.15, dmg: 5,  stam: 4,  reach: 0.98, windPos: [0.16, 1.52, 0.24], hitPos: [0.03, 1.60, 0.80], yaw: -0.7, lean: 0.2, pole: [1, -1, -0.2], label: 'JAB' },
  cross: { hand: 'R', wind: 0.08, strike: 0.10, rec: 0.22, dmg: 10, stam: 8,  reach: 0.98, windPos: [-0.14, 1.50, 0.10], hitPos: [0.01, 1.60, 0.80], yaw: 0.55, lean: 0.22, pole: [-1, -1, -0.2], label: 'CROSS' },
  hook:  { hand: 'L', wind: 0.12, strike: 0.11, rec: 0.26, dmg: 13, stam: 11, reach: 0.86, windPos: [0.40, 1.52, 0.28], ctrl: [0.36, 1.60, 0.72], hitPos: [-0.04, 1.59, 0.64], yaw: 0.6, windYaw: -0.75, lean: 0.12, pole: [1, 0.35, -0.2], label: 'HOOK' },
  upper: { hand: 'R', wind: 0.14, strike: 0.11, rec: 0.28, dmg: 15, stam: 13, reach: 0.80, windPos: [-0.12, 1.15, 0.30], hitPos: [0.0, 1.65, 0.58], yaw: 0.35, windYaw: -0.2, lean: 0.05, dip: 0.09, pole: [-0.6, -1, 0.1], label: 'UPPERCUT' },
};

export class Fighter {
  static generatedBodies = true; // sculpted, skinned bodies (bodygen.js) instead of the primitive mannequin
  static bodyRes = 0.0095;
  constructor(look = {}, { shirt = null, envMap = null, model = null } = {}) {
    this.look = Object.assign({ skin: '#c48a68', hair: '#2a1a10', hairStyle: 'short', beard: false, trousers: '#1a1a1e', build: 1, height: 1, boots: '#151210' }, look);
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.body.scale.setScalar(this.look.height);
    this.face = new FaceDamage();
    this.sweat = 0;
    this.time = Math.random() * 10;
    this.mode = 'fight';
    this.state = 'idle';
    this.action = null;
    this.blocking = false;
    this.blockW = 0;
    this.slipT = 0; this.slipDir = 0; this.slipW = 0;
    this.stun = 0;
    this.downT = 0; this.downTarget = 0;
    this.move = new THREE.Vector2();
    this.stepPhase = 0;
    this.celebrate = 0;
    this.lookYaw = 0;
    this.fatigueSlump = 0;
    this._initPose();
    this._buildMaterials(shirt, envMap);
    this._buildMeshes();
    if (!model && Fighter.generatedBodies && !this.look.classic) {
      try { model = { key: generateBody(this.look, { shirt, wraps: !shirt, envMap, res: Fighter.bodyRes }), skin: false, generated: true }; }
      catch (e) { console.warn('body generation failed', e); }
    }
    if (model && model.key) {
      const rig = new ModelRig(model.key, this.body, { skin: model.skin === false ? null : this.look.skin, tint: model.tint || {}, hide: model.hide || [] });
      if (rig.ok) {
        this.rig = rig;
        if (model.generated) for (const m of rig.materials) if (m.name === 'Skin') { m.map = this.face.tex; m.needsUpdate = true; }
        for (const c of this.body.children) if (c !== rig.root) c.visible = false;
      } else rig.dispose && rig.root && rig.dispose();
    }
    this.update(0);
  }

  _initPose() {
    this.p = {
      hips: V(0, 0.97, 0), pitch: 0, yaw: 0, roll: 0,
      hPitch: 0, hYaw: 0, hRoll: 0,
      handL: V(0.15, 1.47, 0.3), handR: V(-0.08, 1.45, 0.2),
      footL: V(0.14, 0, 0.2), footR: V(-0.17, 0, -0.2),
      poleL: V(1, -1, -0.3), poleR: V(-1, -1, -0.3),
    };
    // second-order springs for hit reactions
    this.spr = {};
    ['pitch', 'roll', 'yaw', 'hPitch', 'hRoll', 'hYaw', 'hipZ'].forEach(k => this.spr[k] = { x: 0, v: 0 });
  }

  _buildMaterials(shirt, envMap) {
    const L = this.look;
    const n = noiseTex(4);
    const skinBase = {
      color: new THREE.Color(L.skin), roughness: 0.5, roughnessMap: n,
      clearcoat: 0.1, clearcoatRoughness: 0.35,
      sheen: 0.18, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ff6a4a').multiplyScalar(0.3),
      envMap, envMapIntensity: 0.5,
    };
    this.skinMat = new THREE.MeshPhysicalMaterial(skinBase);
    this.headMat = new THREE.MeshPhysicalMaterial({ ...skinBase, map: this.face.tex });
    this.torsoMat = new THREE.MeshPhysicalMaterial({ ...skinBase, bumpMap: torsoBump(), bumpScale: 3.0 });
    this.skinMats = [this.skinMat, this.headMat, this.torsoMat];
    this.clothMat = new THREE.MeshStandardMaterial({ color: L.trousers, roughness: 0.92, map: fabric('#ffffff', 6), envMap, envMapIntensity: 0.2 });
    this.shirtMat = shirt ? new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.88, map: fabric('#ffffff', 8), envMap, envMapIntensity: 0.2 }) : null;
    this.bootMat = new THREE.MeshStandardMaterial({ color: L.boots, roughness: 0.42, metalness: 0.0, envMap, envMapIntensity: 0.6 });
    this.wrapMat = new THREE.MeshStandardMaterial({ color: '#e7dfcf', roughness: 0.95, map: fabric('#ffffff', 2) });
    this.hairMat = new THREE.MeshStandardMaterial({ color: L.hair, roughness: 0.8, envMap, envMapIntensity: 0.25 });
    this.eyeMat = new THREE.MeshStandardMaterial({ color: '#120d0b', roughness: 0.08, envMap, envMapIntensity: 1.2 });
    this.beltMat = new THREE.MeshStandardMaterial({ color: '#2b1c12', roughness: 0.5, envMap, envMapIntensity: 0.5 });
    if (shirt) this.wrapMat = this.skinMat; // civilians: bare hands, no wraps
  }

  _mesh(geo, mat, parent = this.body) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  _buildMeshes() {
    const bw = this.look.build;
    const arm = bw;
    const torsoMat = this.shirtMat || this.torsoMat;
    const upperArmMat = this.shirtMat || this.skinMat;
    this.m = {};
    // Torso: waist -> shoulders. Scaled for chest depth.
    const tg = lathe([[0, -0.05], [0.125, -0.04], [0.13, 0.04], [0.128, 0.12], [0.138, 0.2], [0.158, 0.28], [0.18, 0.35], [0.19, 0.41], [0.175, 0.46], [0.12, 0.5], [0.06, 0.52], [0, 0.525]], 28);
    tg.scale(bw, 1, 0.66 * (0.9 + bw * 0.1));
    this.m.torso = this._mesh(tg, torsoMat);
    if (!this.shirtMat) {
      const pecG = new THREE.SphereGeometry(1, 20, 14);
      for (const s of [-1, 1]) {
        const pec = this._mesh(pecG, this.torsoMat, this.m.torso);
        pec.position.set(s * 0.072 * bw, 0.355, 0.075 * (0.9 + bw * 0.1));
        pec.scale.set(0.08 * bw, 0.06, 0.04);
        pec.rotation.z = s * 0.25;
      }
    }
    const trap = this._mesh(new THREE.SphereGeometry(1, 20, 12), torsoMat, this.m.torso);
    trap.position.set(0, 0.47, -0.015); trap.scale.set(0.14 * bw, 0.06, 0.085);
    // Pelvis / trousers top + belt
    this.m.pelvis = this._mesh(lathe([[0, -0.14], [0.13, -0.13], [0.155, -0.06], [0.148, 0.03], [0.135, 0.09], [0, 0.1]], 24).scale(bw * 0.98, 1, 0.72), this.clothMat);
    const belt = this._mesh(new THREE.CylinderGeometry(0.137, 0.14, 0.035, 24, 1, true).scale(bw * 0.98, 1, 0.72), this.beltMat, this.m.pelvis);
    belt.position.y = 0.075;
    // Neck
    this.m.neck = this._mesh(lathe([[0.062, 0], [0.058, 0.06], [0.054, 0.12], [0, 0.13]], 16).scale(bw * 0.95 + 0.05, 1, 1), this.skinMat);
    // Deltoids
    const deltG = new THREE.SphereGeometry(1, 18, 14);
    this.m.deltL = this._mesh(deltG, upperArmMat);
    this.m.deltR = this._mesh(deltG, upperArmMat);
    // Arms
    const uaG = lathe([[0, -0.03], [0.05, -0.015], [0.056, 0.04], [0.06, 0.11], [0.055, 0.19], [0.045, 0.26], [0.04, 0.3], [0, 0.315]].map(([r, y]) => [r * arm, y]));
    const faG = lathe([[0, -0.02], [0.042, 0], [0.047, 0.06], [0.043, 0.14], [0.034, 0.24], [0.03, 0.27], [0, 0.28]].map(([r, y]) => [r * arm, y]));
    this.m.uaL = this._mesh(uaG, upperArmMat); this.m.uaR = this._mesh(uaG, upperArmMat);
    this.m.faL = this._mesh(faG, this.skinMat); this.m.faR = this._mesh(faG, this.skinMat);
    const elbowG = new THREE.SphereGeometry(0.043 * arm, 12, 10);
    this.m.elL = this._mesh(elbowG, upperArmMat); this.m.elR = this._mesh(elbowG, upperArmMat);
    // wraps
    const wrapG = new THREE.CylinderGeometry(0.036 * arm, 0.042 * arm, 0.08, 14);
    for (const s of ['L', 'R']) { const w = this._mesh(wrapG, this.wrapMat, this.m['fa' + s]); w.position.y = 0.245; }
    // fists
    const fistG = new RoundedBoxGeometry(0.082 * arm, 0.1, 0.075 * arm, 3, 0.03);
    this.m.fistL = this._mesh(fistG, this.wrapMat); this.m.fistR = this._mesh(fistG, this.wrapMat);
    const knuckG = new RoundedBoxGeometry(0.084 * arm, 0.03, 0.06 * arm, 2, 0.012);
    for (const s of ['L', 'R']) { const k = this._mesh(knuckG, this.skinMat, this.m['fist' + s]); k.position.y = 0.04; }
    // Legs (trousers)
    const thG = lathe([[0, -0.03], [0.088, -0.01], [0.092, 0.08], [0.083, 0.22], [0.068, 0.38], [0.062, 0.45], [0, 0.47]].map(([r, y]) => [r * (0.9 + bw * 0.1), y]));
    const shG = lathe([[0, -0.02], [0.064, 0], [0.066, 0.1], [0.058, 0.26], [0.056, 0.38], [0.06, 0.43], [0, 0.45]]);
    this.m.thL = this._mesh(thG, this.clothMat); this.m.thR = this._mesh(thG, this.clothMat);
    this.m.shL = this._mesh(shG, this.clothMat); this.m.shR = this._mesh(shG, this.clothMat);
    const kneeG = new THREE.SphereGeometry(0.066, 12, 10);
    this.m.knL = this._mesh(kneeG, this.clothMat); this.m.knR = this._mesh(kneeG, this.clothMat);
    const bootG = new RoundedBoxGeometry(0.105, 0.09, 0.27, 3, 0.035);
    bootG.translate(0, 0.045, 0.06);
    this.m.btL = this._mesh(bootG, this.bootMat); this.m.btR = this._mesh(bootG, this.bootMat);
    // Head
    this.head = new THREE.Group(); this.body.add(this.head);
    const skull = this._mesh(new THREE.SphereGeometry(0.1, 32, 24), this.headMat, this.head);
    skull.scale.set(0.9, 1.08, 1.0); skull.position.set(0, 0.02, 0);
    const jaw = this._mesh(new THREE.SphereGeometry(0.08, 28, 18), this.headMat, this.head);
    jaw.scale.set(0.95, 0.78, 1.0); jaw.position.set(0, -0.045, 0.022);
    const chin = this._mesh(new THREE.SphereGeometry(0.03, 14, 10), this.headMat, this.head);
    chin.position.set(0, -0.085, 0.07); chin.scale.set(1.2, 0.9, 0.8);
    const nose = this._mesh(new RoundedBoxGeometry(0.026, 0.05, 0.035, 2, 0.011), this.headMat, this.head);
    nose.position.set(0, 0.0, 0.098); nose.rotation.x = -0.25;
    const brow = this._mesh(new THREE.CapsuleGeometry(0.014, 0.085, 4, 10), this.headMat, this.head);
    brow.rotation.z = Math.PI / 2; brow.position.set(0, 0.036, 0.083);
    const earG = new THREE.SphereGeometry(0.028, 12, 10);
    for (const s of [-1, 1]) {
      const ear = this._mesh(earG, this.headMat, this.head); ear.position.set(s * 0.088, 0.005, -0.005); ear.scale.set(0.4, 1, 0.7);
      const eye = this._mesh(new THREE.SphereGeometry(0.011, 12, 8), this.eyeMat, this.head); eye.position.set(s * 0.033, 0.018, 0.084);
      const eb = this._mesh(new RoundedBoxGeometry(0.04, 0.009, 0.012, 1, 0.004), this.hairMat, this.head); eb.position.set(s * 0.034, 0.042, 0.094); eb.rotation.z = -s * 0.12;
    }
    const st = this.look.hairStyle;
    if (st === 'short' || st === 'buzz') {
      const r = st === 'short' ? 0.104 : 0.1015;
      const hair = this._mesh(new THREE.SphereGeometry(r, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), this.hairMat, this.head);
      hair.scale.set(0.92, 1.1, 1.03); hair.position.set(0, 0.028, -0.006); hair.rotation.x = -0.32;
    } else if (st === 'mohawk') {
      const mh = this._mesh(new RoundedBoxGeometry(0.03, 0.05, 0.2, 2, 0.012), this.hairMat, this.head);
      mh.position.set(0, 0.125, -0.01);
    } else if (st === 'slick') {
      const hair = this._mesh(new THREE.SphereGeometry(0.106, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), this.hairMat, this.head);
      hair.scale.set(0.93, 1.1, 1.06); hair.position.set(0, 0.03, -0.012); hair.rotation.x = -0.45;
      this.hairMat.roughness = 0.35;
    }
    else if (st === 'bob') {
      const hair = this._mesh(new THREE.SphereGeometry(0.113, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.64), this.hairMat, this.head);
      hair.scale.set(0.95, 1.08, 1.05); hair.position.set(0, 0.03, -0.018); hair.rotation.x = -0.5;
    } else if (st === 'cap') {
      const capMat = new THREE.MeshStandardMaterial({ color: '#4a4136', roughness: 0.95, map: fabric('#ffffff', 5) });
      const cap = this._mesh(new THREE.SphereGeometry(0.108, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), capMat, this.head);
      cap.scale.set(0.98, 0.75, 1.12); cap.position.set(0, 0.05, 0.005); cap.rotation.x = 0.12;
      const brim = this._mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.012, 20, 1, false, -Math.PI / 2, Math.PI), capMat, this.head);
      brim.position.set(0, 0.058, 0.065); brim.rotation.x = 0.18; brim.scale.set(1.1, 1, 0.8);
    }
    if (this.look.beard) {
      const bd = this._mesh(new THREE.SphereGeometry(0.084, 24, 16, Math.PI / 2 - 1.35, 2.7, Math.PI * 0.42, Math.PI * 0.5), this.hairMat, this.head);
      bd.scale.set(0.98, 0.85, 1.04); bd.position.set(0, -0.04, 0.022);
    }
    this.root.traverse(o => { o.frustumCulled = false; });
  }

  // ---------- Public API ----------
  setMode(m) { this.mode = m; }
  resetDamage() { this.face.reset(); this.sweat = 0; this.setSweat(0); }
  setSweat(s) { this.sweat = s; if (this.rig) this.rig.setSweat(s); for (const m of this.skinMats) { m.clearcoat = 0.08 + s * 0.4; m.clearcoatRoughness = 0.4 - s * 0.15; m.roughness = 0.55 - s * 0.15; } }

  canAct() {
    if (this.state === 'down' || this.state === 'ko' || this.stun > 0) return false;
    if (this.slipT > 0) return false;
    if (!this.action) return true;
    const a = this.action;
    return a.t > a.wind + a.strike + a.rec * 0.55; // allow buffering late in recovery
  }

  throwPunch(name, body = false, speedMul = 1) {
    if (!this.canAct()) return false;
    const d = PUNCHES[name];
    this.action = { name, def: d, body, t: 0, wind: d.wind * speedMul, strike: d.strike * speedMul, rec: d.rec * speedMul, impacted: false, startHand: (d.hand === 'L' ? this.p.handL : this.p.handR).clone(), reachZ: d.hitPos[2] };
    this.state = 'punch';
    return true;
  }

  phase() {
    const a = this.action; if (!a) return null;
    if (a.t < a.wind) return 'wind';
    if (a.t < a.wind + a.strike) return 'strike';
    return 'rec';
  }

  // Returns the punch action exactly once at the impact frame
  consumeImpact() {
    const a = this.action;
    if (!a || a.impacted) return null;
    if (a.t >= a.wind + a.strike * 0.8) { a.impacted = true; return a; }
    return null;
  }

  // Clamp punch extension so fists stop at the target instead of passing through
  setTargetDistance(d) { this.targetDist = d; }

  setBlock(on) { this.blocking = on && this.state !== 'down' && this.state !== 'ko'; }

  slip(dir) {
    if (!this.canAct()) return false;
    this.action = null; this.state = 'idle';
    this.slipT = 0.38; this.slipDir = dir;
    return true;
  }
  isSlipping() { return this.slipT > 0.06 && this.slipT < 0.34; }

  hitReact(kind, strength, side = 0) {
    const s = this.spr, k = strength;
    if (kind === 'head') {
      s.hPitch.v -= 9 * k; s.pitch.v -= 4 * k; s.hipZ.v -= 0.6 * k;
      s.hYaw.v += side * 10 * k; s.hRoll.v += side * 6 * k; s.roll.v += side * 2.5 * k;
    } else if (kind === 'uppercut') {
      s.hPitch.v -= 16 * k; s.pitch.v -= 5 * k; s.hipZ.v -= 0.4 * k;
    } else if (kind === 'body') {
      s.pitch.v += 7 * k; s.hPitch.v += 4 * k; s.hipZ.v -= 0.4 * k;
    } else if (kind === 'block') {
      s.pitch.v -= 1.5 * k; s.hipZ.v -= 0.35 * k;
    }
    if (kind !== 'block') {
      this.stun = Math.max(this.stun, 0.12 + k * 0.28);
      if (this.action && this.phase() !== 'rec') { this.action = null; this.state = 'idle'; } // interrupted
    }
  }

  knockDown() { this.state = 'down'; this.action = null; this.downTarget = 1; this.blocking = false; this.slipT = 0; }
  getUp() { this.state = 'idle'; this.downTarget = 0; this.stun = 0.6; }
  setCelebrate(on) { this.celebrate = on ? 1 : 0; }

  headWorld(out = V()) { return this.rig ? this.rig.headWorld(out) : this.head.getWorldPosition(out); }
  chestWorld(out = V()) { return out.copy(this._chestLocal || V(0, 1.2, 0)).applyMatrix4(this.body.matrixWorld); }
  fistWorld(hand, out = V()) { return this.m['fist' + hand].getWorldPosition(out); }

  // ---------- Animation ----------
  update(dt) {
    this.time += dt;
    const t = this.time;
    const p = this.p;
    // timers
    if (this.action) {
      this.action.t += dt;
      const a = this.action;
      if (a.t > a.wind + a.strike + a.rec) { this.action = null; if (this.state === 'punch') this.state = 'idle'; }
    }
    if (this.slipT > 0) this.slipT = Math.max(0, this.slipT - dt);
    if (this.stun > 0) this.stun = Math.max(0, this.stun - dt);
    this.blockW = damp(this.blockW, this.blocking ? 1 : 0, 22, dt);
    const slipTarget = this.slipT > 0 ? Math.sin((1 - this.slipT / 0.38) * Math.PI) : 0;
    this.slipW = slipTarget;
    this.downT = damp(this.downT, this.downTarget, this.downTarget ? 3.2 : 2.4, dt);

    // springs
    for (const k in this.spr) {
      const s = this.spr[k];
      const K = 140, C = 15;
      s.v += (-K * s.x - C * s.v) * dt;
      s.x += s.v * dt;
    }

    // ----- Base pose by mode -----
    const target = this._basePose(t, dt);

    // ----- Punch overlay -----
    const a = this.action;
    let punchHand = null, punchPos = null;
    if (a && this.mode !== 'stand') {
      const d = a.def;
      const isL = d.hand === 'L';
      const guard = isL ? target.handL : target.handR;
      const wp = tmpA.set(...d.windPos), hp = tmpB.set(...d.hitPos);
      let reachZ = hp.z;
      if (this.targetDist !== undefined) reachZ = Math.min(hp.z, Math.max(0.45, this.targetDist - 0.13));
      hp.z = reachZ;
      if (a.body) { hp.y -= 0.36; hp.z -= 0.04; wp.y -= 0.12; }
      let pos = V();
      let w = 0, yawT = d.windYaw ?? (d.hand === 'L' ? -0.45 : -0.55), leanT = 0;
      if (a.t < a.wind) {
        const k = easeInOut(a.t / a.wind);
        pos.lerpVectors(guard, wp, k);
        w = k * 0.5; target.yaw = lerp(target.yaw, yawT, k * 0.6);
      } else if (a.t < a.wind + a.strike) {
        const k = easeOut((a.t - a.wind) / a.strike);
        if (d.ctrl) {
          const c = tmpC.set(...d.ctrl); if (a.body) c.y -= 0.3;
          const u = 1 - k;
          pos.set(0, 0, 0).addScaledVector(wp, u * u).addScaledVector(c, 2 * u * k).addScaledVector(hp, k * k);
        } else pos.lerpVectors(wp, hp, k);
        w = 0.5 + k * 0.5;
        target.yaw = lerp(lerp(target.yaw, yawT, 0.6), d.yaw, k);
        leanT = d.lean * k;
      } else {
        const k = easeInOut((a.t - a.wind - a.strike) / a.rec);
        pos.lerpVectors(hp, guard, k);
        w = 1 - k;
        target.yaw = lerp(d.yaw, target.yaw, k);
        leanT = d.lean * (1 - k);
      }
      target.pitch += leanT + (a.body ? 0.22 * w : 0);
      if (a.body) target.hips.y -= 0.12 * w;
      if (d.dip && a.t < a.wind + a.strike) target.hips.y -= d.dip * Math.sin(Math.min(1, a.t / (a.wind + a.strike)) * Math.PI);
      target.hips.z += 0.05 * w;
      if (isL) { target.poleL.set(...d.pole); } else { target.poleR.set(...d.pole); }
      punchHand = d.hand; punchPos = pos;
    }

    // ----- Down / KO blend -----
    if (this.downT > 0.001) {
      const k = easeInOut(clamp(this.downT, 0, 1));
      const ly = this._lyingPose(t);
      ['pitch', 'yaw', 'roll', 'hPitch', 'hYaw', 'hRoll'].forEach(n => target[n] = lerp(target[n], ly[n], k));
      // hips fall faster than they slide
      target.hips.x = lerp(target.hips.x, ly.hips.x, k);
      target.hips.z = lerp(target.hips.z, ly.hips.z, k);
      target.hips.y = lerp(target.hips.y, ly.hips.y, Math.min(1, k * 1.3));
      ['handL', 'handR', 'footL', 'footR', 'poleL', 'poleR'].forEach(n => target[n].lerp(ly[n], k));
      if (punchPos) { punchPos.lerp(punchHand === 'L' ? ly.handL : ly.handR, k); }
    }

    // ----- Apply with smoothing -----
    const kk = dt === 0 ? 1 : null;
    const sm = (cur, tgt, rate) => kk ? tgt : damp(cur, tgt, rate, dt);
    p.pitch = sm(p.pitch, target.pitch, 14); p.yaw = sm(p.yaw, target.yaw, a ? 30 : 12); p.roll = sm(p.roll, target.roll, 14);
    p.hPitch = sm(p.hPitch, target.hPitch, 12); p.hYaw = sm(p.hYaw, target.hYaw, 12); p.hRoll = sm(p.hRoll, target.hRoll, 12);
    if (kk) { p.hips.copy(target.hips); } else dampV(p.hips, target.hips, 16, dt);
    for (const n of ['footL', 'footR', 'poleL', 'poleR']) { if (kk) p[n].copy(target[n]); else dampV(p[n], target[n], 18, dt); }
    for (const n of ['L', 'R']) {
      const key = 'hand' + n;
      if (punchHand === n) p[key].copy(punchPos);
      else if (kk) p[key].copy(target[key]);
      else dampV(p[key], target[key], 20, dt);
    }

    this._solve();
    if (this.rig) this.rig.apply(this);
  }

  _basePose(t, dt) {
    const T = this._tgt || (this._tgt = {
      hips: V(), handL: V(), handR: V(), footL: V(), footR: V(), poleL: V(), poleR: V(),
    });
    const s = this.spr;
    const mode = this.mode;
    T.roll = 0; T.hYaw = this.lookYaw; T.hRoll = 0;
    T.poleL.set(0.9, -1, -0.4); T.poleR.set(-0.9, -1, -0.4);

    if (mode === 'fight' || mode === 'bag') {
      const slump = this.fatigueSlump;
      const mv = this.move.length();
      const bob = Math.sin(t * 6.5) * 0.012 * (1 - Math.min(1, mv));
      T.hips.set(Math.sin(t * 1.7) * 0.015, 0.965 + bob - slump * 0.04, -0.02);
      T.pitch = 0.1 + slump * 0.1; T.yaw = -0.38; T.hPitch = 0.08 + slump * 0.08;
      const gl = 1 - slump * 0.6;
      T.handL.set(0.15, 1.53 - (1 - gl) * 0.12, 0.3);
      T.handR.set(-0.07, 1.52 - (1 - gl) * 0.1, 0.2);
      T.handL.y += Math.sin(t * 3.1) * 0.012; T.handR.y += Math.sin(t * 3.1 + 1.3) * 0.01;
      T.footL.set(0.14, 0, 0.19); T.footR.set(-0.16, 0, -0.21);
      // stepping
      if (mv > 0.05) {
        this.stepPhase += dt * (8 + mv * 5);
        const sp = Math.sin(this.stepPhase), cp = Math.cos(this.stepPhase);
        const st = Math.min(0.13, mv * 0.09);
        T.footL.x += this.move.x * st * sp; T.footL.z += this.move.y * st * sp; T.footL.y = Math.max(0, cp) * 0.05;
        T.footR.x -= this.move.x * st * sp; T.footR.z -= this.move.y * st * sp; T.footR.y = Math.max(0, -cp) * 0.05;
        T.hips.y += Math.abs(sp) * 0.012;
      }
      // block
      const b = this.blockW;
      if (b > 0.01) {
        T.handL.lerp(tmpD.set(0.075, 1.66, 0.25), b);
        T.handR.lerp(tmpD.set(-0.075, 1.65, 0.24), b);
        T.poleL.lerp(tmpD.set(0.3, -1, 0.2), b); T.poleR.lerp(tmpD.set(-0.3, -1, 0.2), b);
        T.pitch += 0.12 * b; T.hPitch += 0.2 * b; T.hips.y -= 0.04 * b; T.yaw = lerp(T.yaw, -0.15, b);
      }
      // slip
      const sw = this.slipW;
      if (sw > 0.01) {
        T.hips.x += this.slipDir * 0.07 * sw; T.hips.y -= 0.09 * sw;
        T.roll += -this.slipDir * 0.38 * sw; T.pitch += 0.18 * sw; T.hRoll += -this.slipDir * 0.2 * sw;
        T.handL.x += this.slipDir * 0.12 * sw; T.handR.x += this.slipDir * 0.12 * sw;
        T.handL.y -= 0.06 * sw; T.handR.y -= 0.06 * sw;
      }
      if (this.celebrate) {
        T.handL.set(0.28, 2.08, 0.08); T.handR.set(-0.28, 2.08, 0.08); T.yaw = 0; T.pitch = -0.12; T.hPitch = -0.3;
        T.hips.y = 1.0 + Math.abs(Math.sin(t * 5)) * 0.03;
        T.poleL.set(1, 0, 0); T.poleR.set(-1, 0, 0);
        T.footL.set(0.16, 0, 0.05); T.footR.set(-0.16, 0, -0.05);
      }
    } else if (mode === 'stand' || mode === 'arms') {
      T.hips.set(0, 1.02 + Math.sin(t * 1.4) * 0.004, 0);
      T.pitch = 0.02 + Math.sin(t * 1.4) * 0.01; T.yaw = 0; T.hPitch = 0.02;
      T.footL.set(0.13, 0, 0.02); T.footR.set(-0.13, 0, -0.02);
      if (mode === 'arms') {
        T.handL.set(-0.11, 1.26, 0.2); T.handR.set(0.11, 1.23, 0.17);
        T.poleL.set(1, -0.6, 0); T.poleR.set(-1, -0.6, 0);
      } else {
        T.handL.set(0.24, 0.9, 0.03); T.handR.set(-0.24, 0.9, 0.03);
        T.poleL.set(0.3, 0, -1); T.poleR.set(-0.3, 0, -1);
      }
    } else if (mode === 'polish') {
      T.hips.set(0, 1.0, 0); T.pitch = 0.18; T.yaw = 0; T.hPitch = 0.25;
      T.footL.set(0.13, 0, 0.02); T.footR.set(-0.13, 0, -0.02);
      const a = t * 4.0;
      T.handL.set(0.06 + Math.cos(a) * 0.04, 1.12 + Math.sin(a) * 0.03, 0.36);
      T.handR.set(-0.06, 1.1, 0.36);
      T.poleL.set(1, -1, -0.5); T.poleR.set(-1, -1, -0.5);
    } else if (mode === 'sit') {
      T.hips.set(0, 0.74, 0); T.pitch = 0.15; T.yaw = 0; T.hPitch = 0.05;
      T.footL.set(0.14, 0.3, 0.32); T.footR.set(-0.14, 0.3, 0.3);
      T.handL.set(0.12, 1.08, 0.38); T.handR.set(-0.12, 1.06, 0.4);
      T.poleL.set(1, -1, 0); T.poleR.set(-1, -1, 0);
    } else if (mode === 'skip') {
      const ph = t * 9;
      const hop = Math.max(0, Math.sin(ph)) * 0.06;
      T.hips.set(0, 1.0 + hop, 0); T.pitch = 0.04; T.yaw = 0; T.hPitch = 0.05;
      T.footL.set(0.1, hop * 0.9, 0.02); T.footR.set(-0.1, hop * 0.9, 0.0);
      const ra = t * 9;
      T.handL.set(0.3 + Math.cos(ra) * 0.03, 1.0 + Math.sin(ra) * 0.03, 0.1);
      T.handR.set(-0.3 - Math.cos(ra) * 0.03, 1.0 + Math.sin(ra) * 0.03, 0.1);
      T.poleL.set(1, -0.5, -1); T.poleR.set(-1, -0.5, -1);
    } else if (mode === 'jog') {
      const ph = t * (this.jogRate || 9);
      const sp = Math.sin(ph), cp = Math.cos(ph);
      T.hips.set(0, 0.98 + Math.abs(sp) * 0.035, 0); T.pitch = 0.12; T.yaw = sp * 0.08; T.hPitch = 0;
      T.footL.set(0.11, Math.max(0, cp) * 0.16, 0.05 + sp * 0.22); T.footR.set(-0.11, Math.max(0, -cp) * 0.16, 0.05 - sp * 0.22);
      T.handL.set(0.2, 1.12, 0.12 - sp * 0.2); T.handR.set(-0.2, 1.12, 0.12 + sp * 0.2);
      T.poleL.set(0.3, -0.4, -1); T.poleR.set(-0.3, -0.4, -1);
    }

    // add spring reactions
    T.pitch += s.pitch.x; T.roll += s.roll.x; T.yaw += s.yaw.x;
    T.hPitch += s.hPitch.x; T.hRoll += s.hRoll.x; T.hYaw += s.hYaw.x;
    T.hips.z += s.hipZ.x;
    // knee poles
    this._kneePoleL = this._kneePoleL || V(); this._kneePoleR = this._kneePoleR || V();
    this._kneePoleL.set(0.35, 0, 1); this._kneePoleR.set(-0.35, 0, 1);
    return T;
  }

  _lyingPose(t) {
    const L = this._ly || (this._ly = { hips: V(), handL: V(), handR: V(), footL: V(), footR: V(), poleL: V(), poleR: V() });
    const breathe = Math.sin(t * 2.2) * 0.01;
    L.hips.set(0.02, 0.13, -0.55); L.pitch = -1.48 + breathe; L.yaw = 0.05; L.roll = 0.12;
    L.hPitch = 0.25; L.hYaw = 0.5; L.hRoll = 0.3;
    L.handL.set(0.5, 0.06, -0.72); L.handR.set(-0.46, 0.06, -0.62);
    L.footL.set(0.2, -0.03, 0.25); L.footR.set(-0.14, -0.03, 0.4);
    L.poleL.set(1, 0.3, 0); L.poleR.set(-1, 0.3, 0);
    return L;
  }

  _solve() {
    const p = this.p, m = this.m, bw = this.look.build;
    const chestQ = this._chestQ || (this._chestQ = new THREE.Quaternion());
    chestQ.setFromEuler(eTmp.set(p.pitch, p.yaw, p.roll, 'YXZ'));
    const pelvQ = this._pelvQ || (this._pelvQ = new THREE.Quaternion());
    pelvQ.setFromEuler(eTmp.set(p.pitch * 0.35, p.yaw * 0.45, p.roll * 0.3, 'YXZ'));
    const hips = p.hips;

    m.torso.position.copy(hips); m.torso.quaternion.copy(chestQ);
    m.pelvis.position.copy(hips); m.pelvis.quaternion.copy(pelvQ);
    this._chestLocal = (this._chestLocal || V()).set(0, 0.28, 0.08).applyQuaternion(chestQ).add(hips);

    const shL = tmpA.set(0.185 * bw, 0.445, 0).applyQuaternion(chestQ).add(hips);
    const shR = tmpB.set(-0.185 * bw, 0.445, 0).applyQuaternion(chestQ).add(hips);
    const neck = tmpC.set(0, 0.46, -0.005).applyQuaternion(chestQ).add(hips);

    // head
    const hq = qTmp.setFromEuler(eTmp.set(p.hPitch, p.hYaw, p.hRoll, 'YXZ'));
    this.head.quaternion.copy(chestQ).multiply(hq);
    this.head.position.copy(neck).add(tmpD.set(0, 0.155, 0.02).applyQuaternion(this.head.quaternion));
    // neck from base to under skull
    const neckTop = V(0, -0.07, -0.01).applyQuaternion(this.head.quaternion).add(this.head.position);
    this._seg(m.neck, neck, neckTop);

    // deltoids
    for (const [sh, d, s] of [[shL, m.deltL, 1], [shR, m.deltR, -1]]) {
      d.position.copy(sh).add(tmpD.set(s * 0.012, 0.01, 0).applyQuaternion(chestQ));
      d.quaternion.copy(chestQ);
      const ds = this.shirtMat ? 0.85 : 1; d.scale.set(0.058 * bw * ds, 0.06 * bw * ds, 0.062 * bw * ds);
    }

    // arms (2-bone IK)
    const UA = 0.30, FA = 0.31;
    this._arm(shL, p.handL, p.poleL, chestQ, m.uaL, m.faL, m.elL, m.fistL, UA, FA);
    this._arm(shR, p.handR, p.poleR, chestQ, m.uaR, m.faR, m.elR, m.fistR, UA, FA);

    // legs
    const hipL = V(0.092 * bw, -0.07, 0).applyQuaternion(pelvQ).add(hips);
    const hipR = V(-0.092 * bw, -0.07, 0).applyQuaternion(pelvQ).add(hips);
    const TH = 0.45, SH = 0.44;
    const ankleL = V(p.footL.x, p.footL.y + 0.085, p.footL.z - 0.0);
    const ankleR = V(p.footR.x, p.footR.y + 0.085, p.footR.z - 0.0);
    this._leg(hipL, ankleL, this._kneePoleL, pelvQ, m.thL, m.shL, m.knL, TH, SH);
    this._leg(hipR, ankleR, this._kneePoleR, pelvQ, m.thR, m.shR, m.knR, TH, SH);
    m.btL.position.set(p.footL.x, p.footL.y, p.footL.z - 0.05); m.btL.rotation.set(0, p.yaw * 0.4 + 0.15, 0);
    m.btR.position.set(p.footR.x, p.footR.y, p.footR.z - 0.05); m.btR.rotation.set(0, p.yaw * 0.4 - 0.25, 0);
    if (this.downT > 0.3) { // feet tip up when lying
      const k = clamp((this.downT - 0.3) / 0.7, 0, 1);
      m.btL.rotation.x = -k * 0.9; m.btR.rotation.x = -k * 0.9;
    }
  }

  _ik(a, target, l1, l2, pole, outMid, outEnd) {
    const d = tmpD.subVectors(target, a);
    let dist = d.length();
    const maxR = l1 + l2 - 0.002, minR = Math.abs(l1 - l2) + 0.02;
    dist = clamp(dist, minR, maxR);
    const dir = d.normalize();
    outEnd.copy(a).addScaledVector(dir, dist);
    const cosA = clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1);
    const sinA = Math.sqrt(1 - cosA * cosA);
    const bend = this._bend || (this._bend = V());
    bend.copy(pole).addScaledVector(dir, -pole.dot(dir));
    if (bend.lengthSq() < 1e-6) bend.set(0, -1, 0);
    bend.normalize();
    outMid.copy(a).addScaledVector(dir, cosA * l1).addScaledVector(bend, sinA * l1);
  }

  _arm(sh, hand, pole, chestQ, ua, fa, el, fist, l1, l2) {
    const mid = this._mid || (this._mid = V()), end = this._end || (this._end = V());
    const wp = this._wp || (this._wp = V());
    wp.copy(pole).applyQuaternion(chestQ);
    this._ik(sh, hand, l1, l2, wp, mid, end);
    this._seg(ua, sh, mid);
    this._seg(fa, mid, end);
    el.position.copy(mid);
    fist.position.copy(end);
    fist.quaternion.copy(fa.quaternion);
  }

  _leg(hip, ankle, pole, pelvQ, th, sh, kn, l1, l2) {
    const mid = this._mid2 || (this._mid2 = V()), end = this._end2 || (this._end2 = V());
    const wp = this._wp2 || (this._wp2 = V());
    wp.copy(pole);
    if (this.downT > 0.2) wp.lerp(tmpC.set(pole.x * 0.5, 1, 0.3), clamp(this.downT, 0, 1));
    this._ik(hip, ankle, l1, l2, wp, mid, end);
    this._seg(th, hip, mid);
    this._seg(sh, mid, end);
    kn.position.copy(mid);
  }

  _seg(mesh, a, b) {
    mesh.position.copy(a);
    const dir = this._dir || (this._dir = V());
    dir.subVectors(b, a).normalize();
    mesh.quaternion.setFromUnitVectors(UP, dir);
  }

  dispose() {
    this.root.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    [this.skinMat, this.headMat, this.torsoMat, this.clothMat, this.shirtMat, this.bootMat, this.wrapMat, this.hairMat, this.eyeMat, this.beltMat].forEach(m => m && m.dispose());
    this.face.tex.dispose();
    if (this.rig) this.rig.dispose();
    if (this.root.parent) this.root.parent.remove(this.root);
  }
}
