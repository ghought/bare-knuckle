import * as THREE from 'three';
import { Fighter, PUNCHES } from './fighter.js';
import { audio } from './audio.js';
import { input } from './input.js';
import { ui } from './ui.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const $ = id => document.getElementById(id);

export const STYLES = {
  brawler: { label: 'Brawler', range: 0.8, aggr: 0.85, block: 0.35, slip: 0.08, counter: 0.3, body: 0.3, combos: [['hook'], ['cross', 'hook'], ['hook', 'hook'], ['jab', 'cross', 'hook'], ['upper', 'hook']] },
  boxer: { label: 'Boxer', range: 0.94, aggr: 0.6, block: 0.5, slip: 0.35, counter: 0.45, body: 0.15, combos: [['jab'], ['jab', 'jab'], ['jab', 'cross'], ['jab', 'jab', 'cross'], ['jab', 'cross', 'hook']] },
  counter: { label: 'Counter-puncher', range: 0.9, aggr: 0.4, block: 0.55, slip: 0.45, counter: 0.85, body: 0.2, combos: [['cross'], ['jab', 'cross'], ['hook', 'cross']] },
  swarmer: { label: 'Swarmer', range: 0.76, aggr: 0.95, block: 0.28, slip: 0.22, counter: 0.3, body: 0.45, combos: [['jab', 'cross', 'hook', 'cross'], ['hook', 'upper'], ['jab', 'hook'], ['cross', 'hook', 'upper']] },
  slugger: { label: 'Slugger', range: 0.84, aggr: 0.55, block: 0.4, slip: 0.05, counter: 0.35, body: 0.25, combos: [['cross'], ['hook'], ['upper'], ['cross', 'hook']] },
};

// ---------- Particles (blood / sweat) ----------
class Spray {
  constructor(scene, color, size, max = 160, opacity = 1) {
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(size, 6, 4), new THREE.MeshStandardMaterial({ color, roughness: 0.2, transparent: opacity < 1, opacity, emissive: color, emissiveIntensity: 0.15 }), max);
    this.mesh.frustumCulled = false;
    this.p = []; this.max = max; this.dummy = new THREE.Object3D();
    for (let i = 0; i < max; i++) this.p.push({ life: 0, pos: V(), vel: V(), s: 1 });
    scene.add(this.mesh);
    this.floor = 0;
  }
  emit(at, dir, n, speed = 2.5) {
    let k = 0;
    for (const q of this.p) {
      if (q.life > 0) continue;
      q.life = 0.6 + Math.random() * 0.8;
      q.pos.copy(at);
      q.vel.copy(dir).multiplyScalar(speed * (0.4 + Math.random())).add(V((Math.random() - 0.5) * 1.6, Math.random() * 1.8, (Math.random() - 0.5) * 1.6));
      q.s = 0.5 + Math.random();
      if (++k >= n) break;
    }
  }
  update(dt) {
    const d = this.dummy;
    this.p.forEach((q, i) => {
      if (q.life > 0) {
        q.life -= dt;
        if (q.pos.y > this.floor + 0.005) {
          q.vel.y -= 9.8 * dt; q.pos.addScaledVector(q.vel, dt);
          if (q.pos.y < this.floor + 0.005) { q.pos.y = this.floor + 0.004; q.vel.set(0, 0, 0); q.life += 1.5; }
        }
        d.position.copy(q.pos);
        const st = q.pos.y <= this.floor + 0.006;
        d.scale.set(q.s * (st ? 2.2 : 1), q.s * (st ? 0.15 : 1.4), q.s * (st ? 2.2 : 1));
      } else d.scale.setScalar(0);
      d.updateMatrix(); this.mesh.setMatrixAt(i, d.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose() { this.mesh.parent && this.mesh.parent.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

// ---------- One side of the fight ----------
class Side {
  constructor(fighter, data, isPlayer) {
    this.f = fighter; this.d = data; this.isPlayer = isPlayer;
    const s = data.stats;
    this.stats = s;
    this.powerMul = 0.65 + s.power / 100 * 0.85;
    this.chinMul = 1.35 - s.chin / 100 * 0.7;
    this.speedMul = 1.25 - s.speed / 100 * 0.45;
    this.regen = 7 + s.stamina / 7;
    this.stamCost = 1.15 - s.stamina / 200;
    this.defence = s.defence / 100;
    this.maxHp = 100; this.hp = 100;
    this.baseMaxStam = 100 - (data.fatigue || 0) * 0.3 + (data.stamBuff || 0);
    this.stam = this.baseMaxStam; this.bodyDmg = 0;
    this.kd = 0; this.kdRound = 0; this.dmgBuff = 1;
    this.pos = new THREE.Vector2(); this.yaw = 0;
    this.counterWin = 0;
    this.st = { thrown: 0, landed: 0, dmg: 0, blocked: 0, slips: 0, counters: 0, bodyLanded: 0 };
    this.round = { dmg: 0, kdFor: 0 };
    this.ghost = 100;
  }
  get maxStam() { return Math.max(30, this.baseMaxStam - this.bodyDmg * 0.45); }
}

// ---------- AI ----------
class AI {
  constructor(me, opp, style, level, passive = false) {
    this.me = me; this.opp = opp; this.s = STYLES[style] || STYLES.boxer; this.level = level; this.passive = passive;
    this.queue = []; this.cool = 1.2; this.strafe = 1; this.strafeT = 0; this.blockT = 0; this.seen = null; this.reactT = -1; this.reaction = null;
    this.rangeJitter = 0;
  }
  update(dt, fight) {
    const me = this.me, opp = this.opp, f = me.f, s = this.s;
    if (f.state === 'down' || f.state === 'ko') return { mx: 0, mz: 0 };
    const dist = fight.dist;
    const lowHp = me.hp / me.maxHp < 0.3, tired = me.stam < 22;
    const L = this.level;
    // --- defence: read opponent punches ---
    const oa = opp.f.action;
    if (oa && oa !== this.seen && oa.t < oa.wind + 0.02) {
      this.seen = oa;
      const readChance = (0.25 + L * 0.5) * (this.passive ? 0.3 : 1);
      if (dist < 1.2 && Math.random() < readChance) {
        const slip = !oa.body && Math.random() < s.slip * (0.6 + L * 0.6);
        const block = !slip && Math.random() < (s.block + (lowHp ? 0.25 : 0)) * (0.7 + L * 0.5);
        if (slip || block) { this.reaction = slip ? 'slip' : 'block'; this.reactT = Math.max(0.0, (0.12 - L * 0.1) * Math.random()); this.reactLen = oa.wind + oa.strike + 0.12; }
      }
    }
    if (this.reaction) {
      this.reactT -= dt;
      if (this.reactT <= 0) {
        if (this.reaction === 'slip') { if (f.slip(Math.random() < 0.5 ? 1 : -1)) { this.counterReady = Math.random() < s.counter ? 0.42 : 0; } }
        else { this.blockT = this.reactLen; this.counterReady = Math.random() < s.counter * 0.7 ? 0.5 : 0; }
        this.reaction = null;
      }
    }
    if (this.blockT > 0) this.blockT -= dt;
    // shell up when hurt and the player is close
    const shell = !this.passive && lowHp && dist < 1.0 && Math.random() < 0.02;
    if (shell) this.blockT = 0.6 + Math.random() * 0.6;
    f.setBlock(this.blockT > 0 && !f.action);

    // --- movement ---
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafe = Math.random() < 0.5 ? -1 : 1; if (Math.random() < 0.3) this.strafe = 0; this.strafeT = 0.8 + Math.random() * 1.6; this.rangeJitter = (Math.random() - 0.5) * 0.15; }
    let want = s.range + this.rangeJitter;
    if (tired || (lowHp && s.aggr < 0.7)) want += 0.35;
    if (this.passive) want = 1.15;
    if (this.queue.length || (f.action && f.phase() !== 'rec')) want = Math.min(want, 0.8);
    const mz = clamp((dist - want) * 4, -1, 1);
    const mx = this.strafe * (0.45 + (1 - s.aggr) * 0.4);

    // --- offence ---
    this.cool -= dt;
    if (this.counterReady > 0) {
      this.counterReady -= dt;
      if (f.canAct() && dist < 1.0 && this.blockT <= 0.05) { this.queue = [s.counter > 0.6 ? 'cross' : (Math.random() < .5 ? 'hook' : 'cross')]; this.counterReady = 0; this.blockT = 0; }
    }
    if (!this.queue.length && this.cool <= 0 && me.stam > 14 && !this.passive) {
      const inRange = dist < s.range + 0.15;
      const rate = (s.aggr * (0.6 + L * 0.8)) * (tired ? 0.4 : 1) * (lowHp ? 0.7 : 1);
      if (inRange && Math.random() < rate * dt * 3.2) {
        const c = s.combos[(Math.random() * s.combos.length) | 0];
        this.queue = c.slice(0, Math.max(1, Math.round(c.length * (0.6 + L * 0.5))));
        this.bodyChance = s.body;
        this.cool = 0.35 + Math.random() * 0.9 * (1.2 - L);
      }
    }
    if (this.passive && this.cool <= 0 && dist < 1.0) { this.queue = ['jab']; this.cool = 2.4 + Math.random() * 1.5; }
    if (this.queue.length && f.canAct() && this.blockT <= 0) {
      const name = this.queue[0];
      const def = PUNCHES[name];
      if (dist < def.reach + 0.12) {
        const body = Math.random() < (this.bodyChance || 0.2) * (name === 'upper' ? 0.3 : 1);
        if (fight.punch(me, name, body)) this.queue.shift();
      } else if (dist > 1.3) this.queue = [];
    }
    return { mx, mz };
  }
}

// =====================================================================
export class Fight {
  constructor(game, cfg) {
    this.game = game; this.engine = game.engine; this.cfg = cfg;
    this.venue = cfg.venue;
    this.scene = this.venue.scene;
    this.center = cfg.center || V(0, 0, 0);
    this.floorY = this.venue.floorY || 0;
    this.bounds = this.venue.bounds || 2.4;
    this.mode = cfg.mode || 'career';
    this.rounds = cfg.rounds || 3;
    this.roundTime = cfg.roundTime || 60;

    const env = this.engine.envMap;
    this.pf = new Fighter(cfg.player.look, { envMap: env, model: cfg.player.model });
    this.of = new Fighter(cfg.opp.look, { envMap: env, model: cfg.opp.model });
    this.scene.add(this.pf.root, this.of.root);
    this.P = new Side(this.pf, cfg.player, true);
    this.O = new Side(this.of, cfg.opp, false);
    if (this.mode === 'spar') { this.O.powerMul *= 0.45; }
    const lvl = clamp((avg(cfg.opp.stats) - 25) / 65, 0, 1);
    this.ai = new AI(this.O, this.P, cfg.opp.style || 'boxer', lvl, this.mode === 'tutorial');
    this.blood = new Spray(this.scene, '#5a0006', 0.011, 220);
    this.sweat = new Spray(this.scene, '#dfe8f0', 0.0045, 160, 0.45);
    this.blood.floor = this.sweat.floor = this.floorY;

    this.round = 1; this.clock = this.roundTime;
    this.state = 'intro'; this.stateT = 0;
    this.camMode = 'fight'; this.camPos = V(); this.camLook = V();
    this.scores = [];
    this.result = null;
    this.paused = false;
    this.tipIdx = 0;
    this._resetPositions();
    this._initHud();
    this._snapCamera();
    this.dist = 1.4;
    this.keyHandler = e => this._onKey(e);
    window.addEventListener('keydown', this.keyHandler);
    audio.setAmbience(this.venue.crowd ? (this.venue.theme === 'cellar' ? 'fightSmall' : 'fight') : 'pub');
    this.update = this.update.bind(this);
    this.engine.updaters.add(this.update);
  }

  // ---------- setup ----------
  _resetPositions(gap = 1.5) {
    this.P.pos.set(0, -gap / 2); this.O.pos.set(0, gap / 2);
    if (this.mode !== 'tutorial') { this.P.pos.set(-gap / 2 * 0.7, -gap / 2 * 0.7); this.O.pos.set(gap / 2 * 0.7, gap / 2 * 0.7); }
    this._place(0);
  }

  _initHud() {
    $('hud').classList.remove('hidden');
    $('hud-pname').textContent = this.cfg.player.name;
    $('hud-oname').textContent = this.cfg.opp.name;
    $('hud-keys').style.display = '';
    $('hud-count').textContent = '';
    $('hud-getup').classList.add('hidden');
    this._hud();
  }

  _onKey(e) {
    if (e.code === 'Escape' && this.state !== 'over') this.togglePause();
    if (e.code === 'KeyC') { const m = ['fight', 'side', 'shoulder']; this.camMode = m[(m.indexOf(this.camMode) + 1) % m.length]; }
    if (this.state === 'down' && this.downSide === this.P && (e.code === 'Space' || e.code === 'KeyJ' || e.code === 'KeyK')) {
      this.getUpMeter += 5.5 + this.P.stats.chin / 14 - this.P.kd * 1.2;
    }
  }

  togglePause() {
    if (this.paused) { this.paused = false; ui.closeModal(); return; }
    this.paused = true;
    ui.modal(`<h2>Paused</h2>
      <div class="controls-list" style="margin:10px 0 18px">${controlsHtml()}</div>
      <div class="actions"><button class="pill primary" data-a="resume">Resume</button>
      ${this.mode !== 'tutorial' ? '<button class="pill" data-a="quit">Throw in the towel</button>' : ''}</div>`, {
      resume: () => { this.paused = false; ui.closeModal(); },
      quit: () => { this.paused = false; ui.closeModal(); this._finish(this.O, 'RTD'); },
    });
  }

  // ---------- core ----------
  punch(side, name, body) {
    const f = side.f;
    const tired = side.stam < 15;
    const spd = side.speedMul * (tired ? 1.3 : 1);
    if (!f.throwPunch(name, body, spd)) return false;
    side.stam -= PUNCHES[name].stam * side.stamCost;
    side.st.thrown++;
    audio.whoosh(1 / spd);
    return true;
  }

  _place(dt) {
    for (const [S, T] of [[this.P, this.O], [this.O, this.P]]) {
      const dx = T.pos.x - S.pos.x, dz = T.pos.y - S.pos.y;
      const yaw = Math.atan2(dx, dz);
      if (S.f.state !== 'down') S.yaw = dt ? dampAngle(S.yaw, yaw, 12, dt) : yaw;
      S.f.root.position.set(this.center.x + S.pos.x, this.floorY, this.center.z + S.pos.y);
      S.f.root.rotation.y = S.yaw;
    }
  }

  _move(S, mx, mz, dt) {
    const f = S.f;
    let sp = 1.35 * (0.8 + S.stats.speed / 100 * 0.45);
    if (f.action) sp *= 0.35;
    if (f.blocking) sp *= 0.5;
    if (S.stam < 15) sp *= 0.75;
    if (f.state === 'down' || f.stun > 0.15) sp = 0;
    const fwd = new THREE.Vector2(Math.sin(S.yaw), Math.cos(S.yaw));
    const left = new THREE.Vector2(Math.cos(S.yaw), -Math.sin(S.yaw));
    const len = Math.hypot(mx, mz); if (len > 1) { mx /= len; mz /= len; }
    S.pos.addScaledVector(fwd, mz * sp * dt).addScaledVector(left, mx * sp * dt);
    f.move.set(damp(f.move.x, mx * (sp > 0 ? 1 : 0), 10, dt), damp(f.move.y, mz * (sp > 0 ? 1 : 0), 10, dt));
  }

  _constrain() {
    const b = this.bounds;
    const d = new THREE.Vector2().subVectors(this.O.pos, this.P.pos);
    const dist = d.length();
    const minD = 0.6;
    if (dist < minD) {
      const push = (minD - dist) / 2; d.normalize();
      this.P.pos.addScaledVector(d, -push); this.O.pos.addScaledVector(d, push);
    }
    for (const S of [this.P, this.O]) { S.pos.x = clamp(S.pos.x, -b, b); S.pos.y = clamp(S.pos.y, -b, b); }
    this.dist = this.P.pos.distanceTo(this.O.pos);
  }

  _resolve(A, D, act) {
    const def = act.def;
    const name = act.name;
    if (this.dist > def.reach + 0.03 || D.f.state === 'down') { return; }
    if (!act.body && D.f.isSlipping()) {
      D.st.slips++; D.counterWin = 0.55;
      if (D.isPlayer) this._pop(D.f, 'SLIPPED', 'gold');
      return;
    }
    let dmg = def.dmg * A.powerMul * A.dmgBuff * (0.88 + Math.random() * 0.24);
    dmg *= 0.55 + 0.45 * clamp(A.stam / 40, 0, 1);
    const dPh = D.f.phase();
    const counter = (dPh === 'wind' || dPh === 'strike') || A.counterWin > 0;
    if (counter) dmg *= 1.45;
    const blocking = D.f.blockW > 0.55;
    const headPos = D.f.headWorld(V());
    const dirToD = V(D.f.root.position.x - A.f.root.position.x, 0, D.f.root.position.z - A.f.root.position.z).normalize();
    if (blocking) {
      const pierce = name === 'upper' ? 0.32 : name === 'hook' ? 0.16 : 0.08;
      D.hp -= dmg * pierce * D.chinMul * (1 - D.defence * 0.4);
      D.stam -= dmg * (0.65 - D.defence * 0.3);
      D.f.hitReact('block', 0.6);
      D.st.blocked++;
      audio.punch(0.45, true);
      if (A.isPlayer) this._pop(D.f, 'BLOCKED', '');
      if (D.isPlayer && this.mode === 'spar') this.sparBlocks = (this.sparBlocks || 0) + 1;
      A.counterWin = 0;
      D.counterWin = 0.35;
      this.engine.addShake(0.06);
    } else {
      const big = dmg > 13;
      A.st.landed++; A.st.dmg += dmg; A.round.dmg += dmg;
      if (counter) A.st.counters++;
      A.counterWin = 0;
      if (act.body) {
        D.hp -= dmg * 0.38 * D.chinMul;
        D.bodyDmg += dmg * 0.9;
        D.stam -= dmg * 1.2;
        D.f.hitReact('body', clamp(dmg / 12, 0.4, 1.6));
        A.st.bodyLanded++;
        audio.punch(clamp(dmg / 14, 0.3, 1.2), false, true);
        this.sweat.emit(D.f.chestWorld(V()), dirToD, 8, 1.6);
      } else {
        D.hp -= dmg * D.chinMul;
        const side = def.hand === 'L' ? (name === 'hook' ? 1 : 0.3) : (name === 'hook' ? -1 : -0.3);
        D.f.hitReact(name === 'upper' ? 'uppercut' : 'head', clamp(dmg / 11, 0.4, 1.8), side);
        D.f.face.hit(dmg, -side);
        audio.punch(clamp(dmg / 14, 0.3, 1.3));
        this.sweat.emit(headPos, dirToD, 6 + (dmg / 2 | 0), 2.2);
        if (D.f.face.level > 25) this.blood.emit(headPos, dirToD, 3 + (dmg / 3 | 0), 1.8);
      }
      D.sweatLvl = Math.min(1, (D.sweatLvl || 0.2) + 0.01);
      this.engine.addShake(big ? 0.35 : 0.12);
      if (big) this.engine.hitFlash(counter ? 0.35 : 0.18, counter ? '#ffe7c0' : '#ffffff');
      if (this.venue.crowd) this.venue.crowd.roar(big ? 0.8 : 0.25);
      if (A.isPlayer) this._pop(D.f, counter ? 'COUNTER!' : (act.body ? 'BODY' : def.label), counter ? 'gold' : (big ? 'red' : ''));
      else if (counter) this._pop(D.f, 'COUNTERED', 'red');
      if (D.isPlayer) this.engine.hitFlash(big ? 0.14 : 0.05, '#ff3030');
      // knockdown checks
      if (this.mode === 'spar') { if (D.hp < 8) D.hp = 8; return; }
      if (this.mode === 'tutorial' && D.isPlayer && D.hp < 10) { D.hp = 10; return; }
      const flash = !act.body && counter && dmg > 14 && D.hp < 35 && Math.random() < 0.35;
      const bodyKd = act.body && D.stam < 0 && Math.random() < 0.4;
      if (D.hp <= 0 || flash || bodyKd) this._knockdown(D, A, dmg);
    }
    D.hp = Math.max(0, D.hp); D.stam = Math.max(-10, D.stam);
  }

  _knockdown(D, A, dmg) {
    D.hp = 0; D.kd++; D.kdRound++; A.round.kdFor++;
    D.f.knockDown();
    A.f.setBlock(false);
    audio.thud(); audio.cheer(1.6);
    if (this.venue.crowd) this.venue.crowd.roar(1.6);
    this.engine.timeScale = 0.22; this.slowT = 0.9;
    this.engine.hitFlash(0.5, '#ffffff');
    this.state = 'down'; this.stateT = 0; this.downSide = D; this.count = 0; this.getUpMeter = 0;
    const tko = D.kd >= 3 || D.kdRound >= 2 && this.mode !== 'tutorial' && D.kd >= 3;
    this.willTko = D.kd >= 3;
    if (!D.isPlayer) {
      const chance = clamp(0.9 + D.stats.chin / 250 - D.kd * 0.28 - Math.max(0, dmg - 14) * 0.02, 0.05, 0.96);
      this.aiGetsUpAt = Math.random() < chance ? 3 + ((Math.random() * 5) | 0) : 99;
      if (this.mode === 'tutorial') this.aiGetsUpAt = 99;
    }
    this._callout(D.isPlayer ? 'DOWN!' : 'KNOCKDOWN!', D.isPlayer ? 'get up, get up' : this.cfg.opp.name + ' is down');
  }

  _getUp(D) {
    D.f.getUp();
    D.maxHp = Math.max(25, D.maxHp - 13);
    D.hp = D.maxHp * 0.6;
    D.stam = Math.max(D.stam, D.maxStam * 0.6);
    D.kdRound = D.kdRound;
    $('hud-count').textContent = '';
    $('hud-getup').classList.add('hidden');
    this._callout('BOX ON', '');
    this.state = 'fight'; this.stateT = 0;
    this._resetPositions(1.3);
  }

  _finish(winner, method) {
    if (this.state === 'over') return;
    const draw = winner === null;
    this.state = 'over'; this.stateT = 0;
    this.result = {
      winner: draw ? 'draw' : (winner === this.P ? 'player' : 'opp'),
      method, round: this.round, time: this.roundTime - this.clock,
      p: this.P.st, o: this.O.st, scores: this.scores, pKd: this.P.kd, oKd: this.O.kd,
      sparBlocks: this.sparBlocks || 0,
    };
    const W = draw ? null : winner, L = draw ? null : (winner === this.P ? this.O : this.P);
    if (W) { W.f.setBlock(false); W.f.setCelebrate(true); }
    if (L && method !== 'KO' && method !== 'TKO') { L.f.setBlock(false); }
    audio.bell(method === 'PTS' || method === 'DRAW' ? 3 : 5);
    if (this.venue.crowd) this.venue.crowd.roar(2);
    audio.cheer(2);
    let label = draw ? 'DRAW' : (winner === this.P ? 'YOU WIN' : 'YOU LOSE');
    if (this.mode === 'spar') { label = 'TIME'; }
    const sub = { KO: 'by knockout', TKO: 'by technical knockout', PTS: 'on points', DRAW: 'the judges can\'t split them', RTD: 'retired in the corner' }[method] || '';
    this._callout(label, this.mode === 'spar' ? 'session over' : sub, 3.5);
    setTimeout(() => this.cfg.onEnd && this.cfg.onEnd(this.result), 4200);
  }

  _scoreRound() {
    const pd = this.P.round.dmg + this.P.round.kdFor * 25, od = this.O.round.dmg + this.O.round.kdFor * 25;
    let ps = 10, os = 10;
    if (pd > od + 4) os = 9; else if (od > pd + 4) ps = 9;
    ps -= this.P.kdRound; os -= this.O.kdRound;
    this.scores.push([Math.max(6, ps), Math.max(6, os)]);
    this.P.round = { dmg: 0, kdFor: 0 }; this.O.round = { dmg: 0, kdFor: 0 };
    this.P.kdRound = 0; this.O.kdRound = 0;
  }

  _endRound() {
    audio.bell(1);
    this._scoreRound();
    if (this.round >= this.rounds) {
      const p = this.scores.reduce((a, s) => a + s[0], 0), o = this.scores.reduce((a, s) => a + s[1], 0);
      if (this.mode === 'tutorial' || this.mode === 'spar') { this._finish(p >= o ? this.P : this.O, 'PTS'); return; }
      this._finish(p === o ? null : (p > o ? this.P : this.O), p === o ? 'DRAW' : 'PTS');
      return;
    }
    this.state = 'between'; this.stateT = 0;
    this.pf.setBlock(false); this.of.setBlock(false);
    this._callout('END OF ROUND ' + this.round, '');
    setTimeout(() => this._corner(), 1400);
  }

  _corner() {
    const P = this.P, O = this.O;
    const tips = [];
    if (P.stam < 30) tips.push('You\'re gassing, son. Pick your shots.');
    if (O.bodyDmg > 25) tips.push('He doesn\'t like it downstairs. Keep going to the body.');
    if (O.st.blocked > O.st.thrown * 0.3 || P.st.landed < P.st.thrown * 0.3) tips.push('He\'s reading you. Mix it up — jab, then go low.');
    if (P.hp < 40) tips.push('Keep your hands up. You\'re eating too many.');
    if (this.ai.s === STYLES.counter) tips.push('He\'s waiting on you. Feint, slip, then make him pay.');
    if (!tips.length) tips.push('Good round. Same again. Jab, move, don\'t get greedy.');
    const sc = this.scores.reduce((a, s) => [a[0] + s[0], a[1] + s[1]], [0, 0]);
    ui.modal(`<div class="kicker">Your corner · after round ${this.round}</div>
      <h2>Terry: “${tips[0]}”</h2>
      <div class="cards">Unofficial cards: <b>${sc[0]} – ${sc[1]}</b> · Landed ${P.st.landed}/${P.st.thrown} · Body shots ${P.st.bodyLanded}</div>
      <div class="choice-grid">
        <div class="choice" data-a="ice"><div class="t">Ice & Vaseline</div><div class="d">Work on the swelling and close the cut.</div><div class="g">+ Health</div></div>
        <div class="choice" data-a="breathe"><div class="t">Deep Breaths</div><div class="d">Settle the ribs, get the air back in.</div><div class="g">+ Stamina cap</div></div>
        <div class="choice" data-a="fire"><div class="t">Fire Up</div><div class="d">Terry slaps you round the face. “Go and take his head off.”</div><div class="g">+15% power next round</div></div>
      </div>`, {
      ice: () => this._nextRound('ice'), breathe: () => this._nextRound('breathe'), fire: () => this._nextRound('fire'),
    }, { noClose: true });
  }

  _nextRound(choice) {
    ui.closeModal();
    const P = this.P, O = this.O;
    for (const S of [P, O]) { S.hp = Math.min(S.maxHp, S.hp + 10); S.bodyDmg *= 0.85; S.stam = S.maxStam; S.dmgBuff = 1; }
    if (choice === 'ice') P.hp = Math.min(P.maxHp, P.hp + 18);
    if (choice === 'breathe') { P.bodyDmg = Math.max(0, P.bodyDmg - 20); P.stam = P.maxStam; }
    if (choice === 'fire') P.dmgBuff = 1.15;
    O.hp = Math.min(O.maxHp, O.hp + 6);
    this.round++; this.clock = this.roundTime;
    this._resetPositions(1.5);
    this.state = 'ready'; this.stateT = 0;
    this._callout('ROUND ' + this.round, '');
  }

  // ---------- per-frame ----------
  update(dt, raw, t) {
    if (this.paused) return;
    const P = this.P, O = this.O;
    this.stateT += raw;
    if (this.slowT > 0) { this.slowT -= raw; if (this.slowT <= 0) this.engine.timeScale = 1; }

    let pm = { mx: 0, mz: 0 }, om = { mx: 0, mz: 0 };
    const live = this.state === 'fight';
    if (this.state === 'intro') {
      if (this.stateT > 0.1 && !this._introShown) { this._introShown = true; this._callout(this.cfg.opp.name, this.cfg.opp.nick ? '“' + this.cfg.opp.nick + '”' : '', 2.2); }
      if (this.stateT > 3.2) { this.state = 'ready'; this.stateT = 0; this._callout('ROUND ' + this.round, ''); }
    } else if (this.state === 'ready') {
      if (this.stateT > 1.3) { this.state = 'fight'; this.stateT = 0; audio.bell(1); this._callout('FIGHT', '', 0.8); if (this.mode === 'tutorial') this._tip(0); }
    } else if (live) {
      pm = this._playerInput(dt);
      om = this.ai.update(dt, this);
      this.clock -= dt;
      if (this.clock <= 0) { this.clock = 0; this._endRound(); }
      if (this.mode === 'tutorial') this._tutorialTick();
    } else if (this.state === 'down') {
      this._countTick(raw);
    }

    if (live) { this._move(P, pm.mx, pm.mz, dt); this._move(O, om.mx, om.mz, dt); }
    else {
      P.f.move.set(damp(P.f.move.x, 0, 8, dt), damp(P.f.move.y, 0, 8, dt));
      O.f.move.set(damp(O.f.move.x, 0, 8, dt), damp(O.f.move.y, 0, 8, dt));
      if (this.state === 'down') { // standing fighter backs off
        const up = this.downSide === P ? O : P;
        if (this.dist < 1.8) this._move(up, 0, -0.6, dt);
      }
    }
    this._constrain();
    this._place(dt);
    P.f.setTargetDistance(this.dist); O.f.setTargetDistance(this.dist);
    // fatigue posture
    for (const S of [P, O]) {
      S.f.fatigueSlump = damp(S.f.fatigueSlump, clamp(1 - S.stam / 30, 0, 1) * 0.8 + (S.hp < 25 ? 0.3 : 0), 3, dt);
      S.f.setSweat(clamp(0.15 + (this.round - 1) * 0.25 + (1 - S.stam / 100) * 0.3, 0, 1));
      S.f.update(dt);
      if (S.counterWin > 0) S.counterWin -= dt;
    }
    // impacts
    if (live) {
      let a;
      if ((a = P.f.consumeImpact())) this._resolve(P, O, a);
      if ((a = O.f.consumeImpact())) this._resolve(O, P, a);
      for (const S of [P, O]) {
        if (!S.f.action) {
          const rate = S.regen * (S.f.blocking ? 0.5 : 1) * (S.stam < 0 ? 0.6 : 1);
          S.stam = Math.min(S.maxStam, S.stam + rate * dt);
        }
        if (S.hp < S.maxHp * 0.5 && !S.f.action) S.hp = Math.min(S.maxHp * 0.5, S.hp + dt * 0.6); // tiny recovery
      }
    }
    this.blood.update(dt); this.sweat.update(dt);
    this._camera(dt, raw, t);
    this._hud();
  }

  _playerInput(dt) {
    const P = this.P, f = P.f;
    let mx = 0, mz = 0;
    if (input.down('KeyW') || input.down('ArrowUp')) mz += 1;
    if (input.down('KeyS') || input.down('ArrowDown')) mz -= 1;
    if (input.down('KeyA') || input.down('ArrowLeft')) mx += 1;
    if (input.down('KeyD') || input.down('ArrowRight')) mx -= 1;
    const body = input.down('ShiftLeft') || input.down('ShiftRight');
    f.setBlock(input.down('Space') && !f.action);
    const tryP = (code, name) => { if (input.pressed(code, 0.18)) { if (this.punch(P, name, body)) input.consume(code); } };
    tryP('KeyJ', 'jab'); tryP('KeyK', 'cross'); tryP('KeyL', 'hook'); tryP('KeyI', 'upper');
    // mouse: left = jab, right = cross
    if (input.pressed('Mouse0', 0.18) && this.punch(P, 'jab', body)) input.consume('Mouse0');
    if (input.pressed('Mouse2', 0.18) && this.punch(P, 'cross', body)) input.consume('Mouse2');
    if (input.pressed('KeyQ', 0.12)) { if (f.slip(1)) { input.consume('KeyQ'); P.stam -= 3; } }
    if (input.pressed('KeyE', 0.12)) { if (f.slip(-1)) { input.consume('KeyE'); P.stam -= 3; } }
    return { mx, mz };
  }

  _countTick(raw) {
    const D = this.downSide;
    const prev = Math.floor(this.count);
    this.count += raw / 0.85;
    const c = Math.floor(this.count);
    if (this.count > 1.2 && c !== prev && c >= 1 && c <= 10) { $('hud-count').textContent = c; audio.tick(c >= 8); }
    if (this.willTko && this.count > 2.5) { this._finish(D === this.P ? this.O : this.P, 'TKO'); $('hud-count').textContent = ''; return; }
    if (D.isPlayer) {
      $('hud-getup').classList.toggle('hidden', this.count < 1.2);
      this.getUpMeter = Math.max(0, this.getUpMeter - raw * (9 + this.P.kd * 3));
      $('hud-getupfill').style.width = clamp(this.getUpMeter, 0, 100) + '%';
      if (this.getUpMeter >= 100 && this.count > 3) { this._getUp(D); return; }
    } else if (this.count >= this.aiGetsUpAt) { this._getUp(D); return; }
    if (this.count >= 11) {
      $('hud-count').textContent = ''; $('hud-getup').classList.add('hidden');
      this._finish(D === this.P ? this.O : this.P, 'KO');
    }
  }

  // ---------- camera ----------
  _snapCamera() { this._camera(0, 1, 0, true); }
  _camera(dt, raw, t, snap = false) {
    const cam = this.engine.camera;
    const P = this.P.f.root.position, O = this.O.f.root.position;
    const mid = V().addVectors(P, O).multiplyScalar(0.5);
    const fwd = V(O.x - P.x, 0, O.z - P.z).normalize();
    const right = V(-fwd.z, 0, fwd.x); // camera-right
    let pos, look;
    const y0 = this.floorY;
    if (this.state === 'intro') {
      const a = this.stateT * 0.35 + 0.4;
      pos = V(mid.x + Math.cos(a) * 3.6, y0 + 1.4 + this.stateT * 0.1, mid.z + Math.sin(a) * 3.6);
      look = V(mid.x, y0 + 1.25, mid.z);
      // focus opponent
      look.lerp(V(O.x, y0 + 1.45, O.z), 0.6);
    } else if (this.state === 'down' || (this.state === 'over' && this.result && this.result.method !== 'PTS' && this.result.method !== 'DRAW')) {
      const D = (this.downSide || this.O).f.root.position;
      const a = t * 0.15 + 1.1;
      const rad = this.venue.crowd ? 2.6 : 1.7;
      pos = V(D.x + Math.cos(a) * rad, y0 + (this.venue.crowd ? 0.9 : 1.3), D.z + Math.sin(a) * rad);
      look = V(D.x, y0 + 0.4, D.z).lerp(mid.clone().setY(y0 + 1), 0.35);
    } else if (this.state === 'over') {
      const W = (this.result.winner === 'opp' ? O : P);
      pos = V(W.x + right.x * 2.2 - fwd.x * 0.5, y0 + 1.5, W.z + right.z * 2.2 - fwd.z * 0.5);
      look = V(W.x, y0 + 1.5, W.z);
    } else if (this.camMode === 'fight') {
      const k = 1.75 + Math.min(0.8, Math.max(0, this.dist - 1));
      pos = V(mid.x - fwd.x * k * 0.95 + right.x * k * 1.05, y0 + 1.8, mid.z - fwd.z * k * 0.95 + right.z * k * 1.05);
      look = V(mid.x + fwd.x * 0.1, y0 + 1.25, mid.z + fwd.z * 0.1);
    } else if (this.camMode === 'side') {
      pos = V(mid.x + right.x * 4.0, y0 + 1.9, mid.z + right.z * 4.0);
      look = V(mid.x, y0 + 1.2, mid.z);
    } else {
      const back = 2.15 + Math.min(0.6, Math.max(0, this.dist - 1) * 0.6);
      pos = V(P.x - fwd.x * back + right.x * 0.75, y0 + 1.85, P.z - fwd.z * back + right.z * 0.75);
      look = V(mid.x * 0.5 + O.x * 0.5, y0 + 1.3, mid.z * 0.5 + O.z * 0.5);
    }
    if (snap) { this.camPos.copy(pos); this.camLook.copy(look); }
    else {
      const k = this.state === 'fight' ? 7 : 3.5;
      this.camPos.lerp(pos, 1 - Math.exp(-k * raw));
      this.camLook.lerp(look, 1 - Math.exp(-k * 1.4 * raw));
    }
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
    const baseFov = 42 * Math.max(1, Math.sqrt(1.3 / cam.aspect));
    cam.fov = damp(cam.fov, this.state === 'down' ? baseFov * 0.85 : baseFov, 3, raw || 1); cam.updateProjectionMatrix();
  }

  // ---------- HUD ----------
  _hud() {
    const P = this.P, O = this.O;
    const w = (S, el, gh, st, cap) => {
      $(el).style.width = clamp(S.hp, 0, 100) + '%';
      $(gh).style.width = clamp(S.hp, 0, 100) + '%';
      $(st).style.width = clamp(S.stam, 0, 100) + '%';
      $(cap).style.width = clamp(100 - S.maxStam, 0, 100) + '%';
    };
    w(P, 'hud-php', 'hud-phpg', 'hud-pst', 'hud-pstcap');
    w(O, 'hud-ohp', 'hud-ohpg', 'hud-ost', 'hud-ostcap');
    const c = Math.ceil(this.clock);
    $('hud-time').textContent = Math.floor(c / 60) + ':' + String(c % 60).padStart(2, '0');
    $('hud-round').textContent = (this.mode === 'spar' ? 'SPARRING' : 'ROUND ' + this.round + ' / ' + this.rounds);
  }

  _callout(text, sub = '', dur = 1.4) {
    const el = $('hud-callout');
    el.innerHTML = text + (sub ? `<span class="s">${sub}</span>` : '');
    el.classList.add('on');
    clearTimeout(this._coT);
    this._coT = setTimeout(() => el.classList.remove('on'), dur * 1000);
  }

  _pop(fighter, text, cls) {
    const p = fighter.headWorld(V()); p.y += 0.25;
    p.project(this.engine.camera);
    if (p.z > 1) return;
    const el = document.createElement('div');
    el.className = 'hitpop ' + cls;
    el.textContent = text;
    el.style.left = ((p.x * 0.5 + 0.5) * window.innerWidth - 40 + (Math.random() - 0.5) * 40) + 'px';
    el.style.top = ((-p.y * 0.5 + 0.5) * window.innerHeight) + 'px';
    $('hud').appendChild(el);
    setTimeout(() => el.remove(), 800);
  }

  _tip(i) {
    const tips = [
      'Move with <b>W A S D</b>. Close the distance on him.',
      'Press <b>J</b> to jab. Fast, cheap, keeps him honest.',
      'Press <b>K</b> for the right cross. Twist into it.',
      '<b>L</b> is a left hook, <b>I</b> an uppercut. Big damage, short range.',
      'Hold <b>SPACE</b> to block. Blocking drains stamina, not health.',
      'Tap <b>Q</b> or <b>E</b> to slip a head shot — then counter for bonus damage.',
      'Hold <b>SHIFT</b> while punching to go to the body. Drains his stamina.',
      'Watch your blue stamina bar. Gassed fighters hit like wet lettuce.',
      'Now put him on the floor.',
    ];
    this.tipIdx = i;
    const el = $('hud-tip');
    if (i >= tips.length) { el.classList.remove('on'); return; }
    el.innerHTML = tips[i]; el.classList.add('on');
    this.tipT = 0;
  }
  _tutorialTick() {
    this.tipT = (this.tipT || 0) + 1 / 60;
    const i = this.tipIdx, st = this.P.st;
    const done = [
      () => this.dist < 1.1,
      () => st.thrown >= 2,
      () => this.P.f.action && this.P.f.action.name === 'cross',
      () => this.P.f.action && (this.P.f.action.name === 'hook' || this.P.f.action.name === 'upper'),
      () => this.P.f.blocking && this.tipT > 1,
      () => this.P.f.slipT > 0,
      () => this.P.f.action && this.P.f.action.body,
      () => this.tipT > 4,
      () => false,
    ][i];
    if (done && done() && this.tipT > 0.8) this._tip(i + 1);
  }

  dispose() {
    this.engine.updaters.delete(this.update);
    window.removeEventListener('keydown', this.keyHandler);
    this.engine.timeScale = 1;
    this.pf.dispose(); this.of.dispose();
    this.blood.dispose(); this.sweat.dispose();
    $('hud').classList.add('hidden');
    $('hud-tip').classList.remove('on');
    $('hud-callout').classList.remove('on');
    document.querySelectorAll('.hitpop').forEach(e => e.remove());
  }
}

function avg(s) { return (s.power + s.speed + s.stamina + s.defence + s.chin) / 5; }
function dampAngle(a, b, k, dt) {
  let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-k * dt));
}

export function controlsHtml() {
  return `<b>W A S D</b><span>Move / circle</span><b>J</b><span>Jab (lead hand)</span><b>K</b><span>Cross (rear hand)</span><b>L</b><span>Left hook</span><b>I</b><span>Uppercut</span>
  <b>SHIFT</b><span>Hold with a punch to go to the body</span><b>SPACE</b><span>Block (hold) · mash when down to get up</span><b>Q / E</b><span>Slip left / right — then counter</span><b>C</b><span>Switch camera</span><b>M</b><span>Mute / unmute sound</span><b>ESC</b><span>Pause</span>`;
}
