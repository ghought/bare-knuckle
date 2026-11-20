// Real rigged character models (glTF / FBX, Mixamo / Ready Player Me / MakeHuman-style skeletons),
// driven by the game's procedural animation through per-frame IK retargeting.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const CDN = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/models/gltf/';

// Built-in characters that can be loaded without an account (they ship with the three.js examples).
export const CATALOG = {
  rpm: { url: CDN + 'readyplayer.me.glb', hide: ['Wolf3D_Headwear'] }, // bearded man in a suit (Ready Player Me avatar), cowboy hat hidden
};

const cache = new Map();
const gltf = new GLTFLoader();
const fbx = new FBXLoader();

export function loadAsset(key, url) {
  if (cache.has(key)) return cache.get(key);
  const p = new Promise((resolve, reject) => {
    const onLoad = res => resolve({ key, scene: res.scene || res });
    if (/\.fbx$/i.test(url)) fbx.load(url, onLoad, undefined, reject);
    else gltf.load(url, onLoad, undefined, reject);
  });
  cache.set(key, p);
  return p;
}

export function loaded(key) { return assets[key] || null; }
const assets = {};
export function registerAsset(key, scene, def = {}) { assets[key] = { key, scene, def }; }

// Preload built-ins plus any user models listed in assets/fighters/fighters.json
export async function preloadModels(timeoutMs = 15000) {
  const jobs = Object.entries(CATALOG).map(([k, d]) => loadAsset(k, d.url).then(a => { assets[k] = { ...a, def: d }; }).catch(e => console.warn('model failed', k, e)));
  let user = [];
  try {
    const r = await fetch('assets/fighters/fighters.json', { cache: 'no-store' });
    if (r.ok) user = await r.json();
  } catch { }
  user.forEach((u, i) => {
    const k = 'user' + i;
    const def = { url: 'assets/fighters/' + u.file, hide: u.hide || [], name: u.name || u.file, rotateY: u.rotateY || 0, user: true };
    jobs.push(loadAsset(k, def.url).then(a => { assets[k] = { ...a, def }; }).catch(e => console.warn('user model failed', u.file, e)));
  });
  await Promise.race([Promise.all(jobs), new Promise(r => setTimeout(r, timeoutMs))]);
  return assets;
}
export function userModelKeys() { return Object.keys(assets).filter(k => assets[k].def.user); }

// ---------------------------------------------------------------------
// Bone name aliases (Mixamo, Ready Player Me, Unreal/MakeHuman "game engine")
const ALIASES = {
  hips: ['hips', 'pelvis'], spine: ['spine', 'spine_01', 'spine01'], spine1: ['spine1', 'spine_02', 'spine02'], spine2: ['spine2', 'spine_03', 'spine03', 'chest'],
  neck: ['neck', 'neck_01', 'neck01'], head: ['head'],
  lClav: ['leftshoulder', 'clavicle_l'], lArm: ['leftarm', 'upperarm_l'], lFore: ['leftforearm', 'lowerarm_l'], lHand: ['lefthand', 'hand_l'],
  rClav: ['rightshoulder', 'clavicle_r'], rArm: ['rightarm', 'upperarm_r'], rFore: ['rightforearm', 'lowerarm_r'], rHand: ['righthand', 'hand_r'],
  lUp: ['leftupleg', 'thigh_l'], lLeg: ['leftleg', 'calf_l'], lFoot: ['leftfoot', 'foot_l'],
  rUp: ['rightupleg', 'thigh_r'], rLeg: ['rightleg', 'calf_r'], rFoot: ['rightfoot', 'foot_r'],
};
const norm = n => n.replace(/^mixamorig\d*[:_]?/i, '').replace(/^.*:/, '').toLowerCase();

const V = () => new THREE.Vector3();
const Q = () => new THREE.Quaternion();
const _a = V(), _b = V(), _c = V(), _d = V(), _e = V(), _q = Q(), _q2 = Q(), _pq = Q();

export class ModelRig {
  constructor(assetKey, body, { height = 1.0, skin = null, tint = {}, hide = [] } = {}) {
    const a = assets[assetKey];
    this.ok = !!a;
    if (!a) return;
    this.body = body;
    const root = this.root = cloneSkinned(a.scene);
    const def = a.def;
    const hidden = new Set([...(def.hide || []), ...hide]);
    this.materials = [];
    this.skinMats = [];
    root.traverse(o => {
      if (!o.isMesh) return;
      if (hidden.has(o.name) || (o.material && hidden.has(o.material.name))) { o.visible = false; return; }
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const cl = mats.map(m => {
        let c = m.clone();
        if (c.isMeshPhongMaterial || c.isMeshLambertMaterial) {
          c = new THREE.MeshStandardMaterial({ map: c.map, color: c.color, normalMap: c.normalMap, roughness: 0.7, transparent: c.transparent, alphaTest: c.alphaTest });
        }
        c.envMapIntensity = 0.45;
        const nm = (c.name || '') + ' ' + o.name;
        if (tint[o.name]) c.color.multiply(new THREE.Color(tint[o.name]));
        else if (c.name && tint[c.name]) c.color.multiply(new THREE.Color(tint[c.name]));
        if (/skin|body|head/i.test(nm) && !/outfit|headwear/i.test(nm)) {
          this.skinMats.push(c);
          if (skin) { const t = new THREE.Color(skin), ref = new THREE.Color('#d9a07c'); c.color.setRGB(Math.min(1.15, t.r / ref.r), Math.min(1.15, t.g / ref.g), Math.min(1.15, t.b / ref.b)); }
        }
        this.materials.push(c);
        return c;
      });
      o.material = Array.isArray(o.material) ? cl : cl[0];
    });
    root.updateMatrixWorld(true);
    // map bones
    const byName = {};
    root.traverse(o => { if (o.isBone || o.type === 'Bone') byName[norm(o.name)] = o; });
    this.b = {};
    for (const [k, list] of Object.entries(ALIASES)) for (const n of list) if (byName[n]) { this.b[k] = byName[n]; break; }
    const need = ['hips', 'spine2', 'head', 'lArm', 'lFore', 'lHand', 'rArm', 'rFore', 'rHand', 'lUp', 'lLeg', 'lFoot', 'rUp', 'rLeg', 'rFoot'];
    const missing = need.filter(k => !this.b[k]);
    if (missing.length) { console.warn('ModelRig: missing bones', missing, Object.keys(byName)); this.ok = false; return; }
    if (def.rotateY) root.rotation.y = def.rotateY;

    // fit height (in body space, body scale already applies the look height)
    body.add(root);
    body.updateMatrixWorld(true);
    // scale from the skeleton (more reliable than mesh bounds for skinned exports)
    const bodyInv0 = body.matrixWorld.clone().invert();
    const bp = k => this.b[k].getWorldPosition(new THREE.Vector3()).applyMatrix4(bodyInv0);
    const footY = Math.min(bp('lFoot').y, bp('rFoot').y);
    const span = bp('head').y - footY;
    const s = 1.78 / Math.max(0.01, span * 1.16);
    root.scale.multiplyScalar(s);
    root.position.y -= footY * s - 0.085;

    // curl fingers into fists (rest override)
    const fwd = new THREE.Vector3(0, 0, 1);
    root.updateMatrixWorld(true);
    root.traverse(o => {
      if (!(o.isBone || o.type === 'Bone')) return;
      const n = norm(o.name);
      const m = n.match(/^(left|right)hand(index|middle|ring|pinky|thumb)\d/) || n.match(/^(index|middle|ring|pinky|thumb)_\d+_(l|r)$/);
      if (!m) return;
      const left = m[1] === 'left' || m[2] === 'l';
      const thumb = /thumb/.test(n);
      const wq = o.getWorldQuaternion(Q());
      const axisW = thumb ? new THREE.Vector3(0, left ? 1 : -1, 0) : fwd.clone().multiplyScalar(left ? -1 : 1);
      // rotate in world about axisW, then convert to local
      const parentQ = o.parent.getWorldQuaternion(Q());
      const newW = Q().setFromAxisAngle(axisW, thumb ? 0.5 : 1.35).multiply(wq);
      o.quaternion.copy(parentQ.invert().multiply(newW));
      o.updateMatrixWorld(true);
    });

    // rest data (body space)
    root.updateMatrixWorld(true);
    const bodyQinv = body.getWorldQuaternion(Q()).invert();
    const bodyInv = body.matrixWorld.clone().invert();
    this.rest = {};
    this.restLocal = new Map();
    root.traverse(o => { if (o.isBone || o.type === 'Bone') this.restLocal.set(o, o.quaternion.clone()); });
    for (const [k, bone] of Object.entries(this.b)) {
      this.rest[k] = { q: bodyQinv.clone().multiply(bone.getWorldQuaternion(Q())), p: bone.getWorldPosition(V()).applyMatrix4(bodyInv) };
    }
    const len = (a, b) => this.rest[a].p.distanceTo(this.rest[b].p);
    this.L = { ua: len('lArm', 'lFore'), fa: len('lFore', 'lHand'), th: len('lUp', 'lLeg'), sh: len('lLeg', 'lFoot') };
    this.hipRestY = this.rest.hips.p.y;
    // bend references (bone-local), from T/A pose: forearm bends toward +Z, shin toward -Z
    this.ref = {};
    for (const [k, dir] of [['lArm', [0, 0, 1]], ['rArm', [0, 0, 1]], ['lUp', [0, 0, -1]], ['rUp', [0, 0, -1]]]) {
      this.ref[k] = new THREE.Vector3(...dir).applyQuaternion(this.rest[k].q.clone().invert());
    }
    this.restHeadOffset = this.rest.head.p.clone();
  }

  setSweat(s) { for (const m of this.skinMats) { m.roughness = 0.55 - s * 0.25; if (m.clearcoat !== undefined) { m.clearcoat = 0.06 + s * 0.22; m.clearcoatRoughness = 0.5 - s * 0.1; } } }

  _setWorldQ(bone, wq) {
    bone.parent.getWorldQuaternion(_pq);
    bone.quaternion.copy(_pq.invert().multiply(wq));
    bone.updateWorldMatrix(false, false);
  }

  // delta (body space) applied to the bone's rest orientation
  _orient(k, deltaBody, bodyQ) {
    const wq = _q.copy(bodyQ).multiply(deltaBody).multiply(this.rest[k].q);
    this._setWorldQ(this.b[k], wq);
  }

  _ik(a, target, l1, l2, pole, outMid, outEnd) {
    const d = _d.subVectors(target, a);
    let dist = THREE.MathUtils.clamp(d.length(), Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.002);
    const dir = d.normalize();
    outEnd.copy(a).addScaledVector(dir, dist);
    const cosA = THREE.MathUtils.clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1);
    const sinA = Math.sqrt(1 - cosA * cosA);
    const bend = _e.copy(pole).addScaledVector(dir, -pole.dot(dir));
    if (bend.lengthSq() < 1e-6) bend.set(0, -1, 0);
    bend.normalize();
    outMid.copy(a).addScaledVector(dir, cosA * l1).addScaledVector(bend, sinA * l1);
  }

  // Aim bone so that its child sits at targetW; optional twist so its bend reference matches bendW
  _aim(k, childK, targetW, bendW) {
    const bone = this.b[k], child = this.b[childK];
    bone.updateWorldMatrix(false, false); child.updateWorldMatrix(false, false);
    const bp = bone.getWorldPosition(_a), cp = child.getWorldPosition(_b);
    const d0 = cp.sub(bp).normalize();
    const d1 = _c.subVectors(targetW, bp).normalize();
    const wq = bone.getWorldQuaternion(_q2);
    const nw = Q().setFromUnitVectors(d0, d1).multiply(wq);
    if (bendW && this.ref[k]) {
      const r = this.ref[k].clone().applyQuaternion(nw);
      r.addScaledVector(d1, -r.dot(d1));
      const want = bendW.clone().addScaledVector(d1, -bendW.dot(d1));
      if (r.lengthSq() > 1e-6 && want.lengthSq() > 1e-6) {
        r.normalize(); want.normalize();
        const ang = Math.atan2(_e.crossVectors(r, want).dot(d1), r.dot(want));
        nw.premultiply(Q().setFromAxisAngle(d1, ang));
      }
    }
    this._setWorldQ(bone, nw);
  }

  // f: the Fighter whose procedural pose we copy
  apply(f) {
    const p = f.p, body = this.body;
    body.updateWorldMatrix(true, false);
    for (const [bone, q] of this.restLocal) bone.quaternion.copy(q);
    this.root.updateMatrixWorld(true);
    const bodyQ = body.getWorldQuaternion(Q());
    const M = body.matrixWorld;
    const W = v => v.clone().applyMatrix4(M);
    const chestQ = f._chestQ, pelvQ = f._pelvQ, headQ = f.head.quaternion;
    const b = this.b;
    // hips
    const k = this.hipRestY / 1.02;
    const hw = W(_a.set(p.hips.x, p.hips.y * k, p.hips.z));
    b.hips.parent.updateWorldMatrix(true, false);
    b.hips.position.copy(b.hips.parent.worldToLocal(hw));
    b.hips.updateWorldMatrix(false, false);
    this._orient('hips', pelvQ, bodyQ);
    // spine
    if (b.spine) this._orient('spine', Q().slerpQuaternions(pelvQ, chestQ, 0.4), bodyQ);
    if (b.spine1) this._orient('spine1', Q().slerpQuaternions(pelvQ, chestQ, 0.75), bodyQ);
    this._orient('spine2', chestQ, bodyQ);
    if (b.neck) this._orient('neck', Q().slerpQuaternions(chestQ, headQ, 0.5), bodyQ);
    this._orient('head', headQ, bodyQ);
    if (b.lClav) this._orient('lClav', chestQ, bodyQ);
    if (b.rClav) this._orient('rClav', chestQ, bodyQ);
    // arms
    const sc = body.getWorldScale(_e).x;
    const L = { ua: this.L.ua * sc, fa: this.L.fa * sc, th: this.L.th * sc, sh: this.L.sh * sc };
    for (const [s, hand, pole] of [['l', p.handL, p.poleL], ['r', p.handR, p.poleR]]) {
      const arm = s + 'Arm', fore = s + 'Fore', hk = s + 'Hand';
      b[arm].updateWorldMatrix(false, false);
      const sh = b[arm].getWorldPosition(V());
      const target = W(hand);
      const poleW = pole.clone().applyQuaternion(chestQ).applyQuaternion(bodyQ);
      const mid = V(), end = V();
      this._ik(sh, target, L.ua, L.fa + 0.06, poleW, mid, end);
      const wrist = mid.clone().add(end.sub(mid).normalize().multiplyScalar(L.fa));
      this._aim(arm, fore, mid, poleW.clone().negate());
      this._aim(fore, hk, wrist);
    }
    // legs
    for (const [s, foot, pole] of [['l', p.footL, f._kneePoleL], ['r', p.footR, f._kneePoleR]]) {
      const up = s + 'Up', leg = s + 'Leg', fk = s + 'Foot';
      b[up].updateWorldMatrix(false, false);
      const hip = b[up].getWorldPosition(V());
      const ankle = W(_b.set(foot.x, foot.y + 0.085, foot.z));
      let poleB = pole.clone();
      if (f.downT > 0.2) poleB.lerp(_c.set(pole.x * 0.5, 1, 0.3), Math.min(1, f.downT));
      const poleW = poleB.applyQuaternion(bodyQ);
      const mid = V(), end = V();
      this._ik(hip, ankle, L.th, L.sh, poleW, mid, end);
      this._aim(up, leg, mid, poleW.clone().negate());
      this._aim(leg, fk, end);
      const tilt = f.downT > 0.3 ? -Math.min(1, (f.downT - 0.3) / 0.7) * 0.9 : 0;
      const fy = Q().setFromEuler(new THREE.Euler(tilt, p.yaw * 0.4 + (s === 'l' ? 0.15 : -0.25), 0, 'YXZ'));
      this._orient(fk, fy, bodyQ);
    }
  }

  headWorld(out) { return this.b.head.getWorldPosition(out).add(_a.set(0, 0.08, 0)); }

  dispose() {
    this.materials.forEach(m => m.dispose());
    if (this.root && this.root.parent) this.root.parent.remove(this.root);
  }
}
