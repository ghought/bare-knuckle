import * as THREE from 'three';
import { Fighter } from './fighter.js';
import { audio } from './audio.js';
import { input } from './input.js';
import { ui } from './ui.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const $ = id => document.getElementById(id);

// Mini-games in Terry's back room. Each resolves with a 0..1 performance score.
export class Training {
  constructor(game, gym, kind, player) {
    this.game = game; this.engine = game.engine; this.gym = gym; this.kind = kind;
    this.f = new Fighter(player.look, { envMap: this.engine.envMap, model: player.modelKey ? { key: player.modelKey, skin: false } : null });
    this.gym.scene.add(this.f.root);
    this.t = 0; this.done = false; this.score = 0; this.max = 1;
    this.camPos = V(); this.camLook = V();
    this.update = this.update.bind(this);
  }

  run() {
    return new Promise(resolve => {
      this.resolve = resolve;
      this.hud = document.createElement('div');
      this.hud.className = 'train-hud';
      document.getElementById('ui').appendChild(this.hud);
      this['_init_' + this.kind]();
      this.engine.updaters.add(this.update);
      audio.setAmbience('gym');
    });
  }

  _head(t, s) { return `<div class="head"><div class="t">${t}</div><div class="s">${s}</div></div><div class="train-timer" id="tr-timer"></div>`; }

  _finish() {
    if (this.done) return;
    this.done = true;
    audio.bell(2);
    setTimeout(() => {
      this.engine.updaters.delete(this.update);
      this.hud.remove();
      this.f.dispose();
      if (this.rope) this.gym.scene.remove(this.rope);
      this.resolve(clamp(this.score / this.max, 0, 1));
    }, 900);
  }

  // ---------------- Heavy bag: rhythm combos ----------------
  _init_bag() {
    this.f.setMode('bag');
    this.f.root.position.set(0, 0, -0.05);
    this.f.root.rotation.y = Math.PI; // face the bag (bag at z -0.9)
    this.f.setTargetDistance(0.84);
    this.dur = 24;
    this.hud.innerHTML = this._head('Heavy Bag', 'hit the key as it crosses the line · SHIFT on red notes') +
      `<div class="lane" id="lane"><div class="zone"></div></div><div class="train-score"><span class="j" id="tr-j"></span><span id="tr-s">0</span></div>`;
    this.lane = $('lane');
    this.notes = []; this.spawnT = 1.2; this.speed = 300; this.combo = 0;
    this.keys = [['KeyJ', 'J', 'jab'], ['KeyK', 'K', 'cross'], ['KeyL', 'L', 'hook'], ['KeyI', 'I', 'upper']];
    this.max = 0;
  }
  _tick_bag(dt) {
    const laneW = this.lane.clientWidth;
    const zoneX = 125;
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.t < this.dur - 2) {
      const k = this.keys[(Math.random() * 4) | 0];
      const body = Math.random() < 0.22;
      const el = document.createElement('div');
      el.className = 'note' + (body ? ' body' : '');
      el.textContent = k[1];
      this.lane.appendChild(el);
      this.notes.push({ el, x: laneW + 30, k, body, hit: false });
      this.max += 3;
      this.spawnT = Math.max(0.32, 0.75 - this.t * 0.016) * (0.8 + Math.random() * 0.5);
      if (Math.random() < 0.25) this.spawnT *= 0.5;
    }
    for (const n of this.notes) {
      n.x -= this.speed * dt * (1 + this.t * 0.012);
      n.el.style.left = n.x + 'px';
      if (!n.hit && n.x < zoneX - 60) { n.hit = true; n.el.style.opacity = 0.2; this._judge('MISS'); this.combo = 0; }
    }
    this.notes = this.notes.filter(n => { if (n.x < -60) { n.el.remove(); return false; } return true; });
    const shift = input.down('ShiftLeft') || input.down('ShiftRight');
    for (const k of this.keys) {
      if (input.pressed(k[0], 0.05)) {
        input.consume(k[0]);
        const cand = this.notes.filter(n => !n.hit && Math.abs(n.x - zoneX) < 75).sort((a, b) => Math.abs(a.x - zoneX) - Math.abs(b.x - zoneX))[0];
        this.f.throwPunch(k[2], shift, 0.85);
        if (!cand) { this._judge('EARLY'); continue; }
        const dx = Math.abs(cand.x - zoneX);
        const right = cand.k[0] === k[0] && cand.body === shift;
        cand.hit = true; cand.el.style.opacity = 0;
        if (!right) { this._judge('WRONG'); this.combo = 0; continue; }
        const pts = dx < 22 ? 3 : dx < 48 ? 2 : 1;
        this.score += pts; this.combo++;
        this._judge(pts === 3 ? 'PERFECT' : pts === 2 ? 'GOOD' : 'OK');
        setTimeout(() => { this.gym.hitBag(0.4 + pts * 0.25, (Math.random() - 0.5)); audio.punch(0.5 + pts * 0.2, false, shift); this.engine.addShake(0.05 * pts); }, 90);
      }
    }
    $('tr-s').textContent = this.score + (this.combo > 2 ? `  ×${this.combo}` : '');
    // camera
    this._cam(V(2.0, 1.45, -0.15), V(0, 1.3, -0.5));
  }
  _judge(t) { const j = $('tr-j'); if (j) { j.textContent = t; j.style.color = t === 'PERFECT' ? '#d1a640' : t === 'MISS' || t === 'WRONG' ? '#c8102e' : '#efe6d2'; } }

  // ---------------- Skipping: timing ----------------
  _init_skip() {
    this.f.setMode('skip');
    this.f.root.position.set(0, 0, 0.6);
    this.dur = 22;
    this.hud.innerHTML = this._head('Skipping', 'press SPACE as the rope passes your feet') +
      `<svg class="ringmeter" viewBox="-60 -60 120 120"><circle r="48" fill="rgba(0,0,0,.55)" stroke="rgba(255,255,255,.2)" stroke-width="2"/><path id="tr-zone" d="" fill="none" stroke="#d1a640" stroke-width="10"/><circle id="tr-dot" r="7" fill="#efe6d2"/></svg>
       <div class="train-score"><span class="j" id="tr-j"></span><span id="tr-s">0</span></div>`;
    this.angle = Math.PI; this.rate = 3.2; this.combo = 0; this.trip = 0; this.passed = false;
    this.zone = 0.55;
    const z = this.zone, r = 48;
    const a0 = Math.PI / 2 - z, a1 = Math.PI / 2 + z;
    $('tr-zone').setAttribute('d', `M ${Math.cos(a0) * r} ${Math.sin(a0) * r} A ${r} ${r} 0 0 1 ${Math.cos(a1) * r} ${Math.sin(a1) * r}`);
    // rope
    const pts = [];
    for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI; pts.push(V(Math.cos(a) * 0.33, -Math.sin(a) * 1.0, 0)); }
    this.rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#d8c8a0' }));
    this.rope.position.set(0, 1.0, 0.7);
    this.gym.scene.add(this.rope);
    this.max = 0;
  }
  _tick_skip(dt) {
    if (this.trip > 0) { this.trip -= dt; this.f.setMode('stand'); if (this.trip <= 0) this.f.setMode('skip'); }
    else this.angle += this.rate * dt;
    const a = this.angle % (Math.PI * 2);
    // bottom of circle (feet) at PI/2 in SVG coords (y down)
    $('tr-dot').setAttribute('cx', Math.cos(a) * 48); $('tr-dot').setAttribute('cy', Math.sin(a) * 48);
    const inZone = Math.abs(a - Math.PI / 2) < this.zone;
    if (a > Math.PI / 2 + this.zone && !this.passed && this.trip <= 0) {
      this.passed = true; this.max += 2;
      if (!this.jumped) { this._judge('TRIPPED'); this.combo = 0; this.trip = 0.7; this.rate = Math.max(3.2, this.rate - 0.6); }
    }
    if (a < Math.PI / 2 - this.zone) { this.passed = false; this.jumped = false; }
    if (input.pressed('Space', 0.05)) {
      input.consume('Space');
      if (inZone && !this.jumped && this.trip <= 0) {
        this.jumped = true;
        const perfect = Math.abs(a - Math.PI / 2) < this.zone * 0.4;
        this.score += perfect ? 2 : 1; this.combo++;
        this.rate = Math.min(9, this.rate + 0.12);
        this._judge(perfect ? 'PERFECT' : 'GOOD');
        audio.tick(perfect);
      } else if (!inZone && this.trip <= 0) { this._judge('TOO EARLY'); this.combo = 0; this.trip = 0.5; }
    }
    $('tr-s').textContent = this.score + (this.combo > 2 ? `  ×${this.combo}` : '');
    this.rope.rotation.x = -a + Math.PI / 2;
    this.rope.visible = this.trip <= 0;
    this.f.time = a / 9; // sync hop with the rope
    this._cam(V(0.7, 1.35, 4.1), V(-0.35, 1.05, 0.6));
  }

  // ---------------- Circuits: pace control ----------------
  _init_road() {
    this.f.setMode('jog');
    this.f.root.position.set(0, 0, 0.6);
    this.f.root.rotation.y = Math.PI / 2;
    this.dur = 22;
    this.hud.innerHTML = this._head('Circuits', 'alternate A and D to keep the pace in the green · don\'t blow up') +
      `<div class="breath"><i id="tr-b"></i></div><div class="pace"><div class="z" style="left:58%;width:22%"></div><div class="n" id="tr-n"></div></div>
       <div class="train-score"><span class="j" id="tr-j"></span><span id="tr-s">0</span></div>`;
    this.pace = 0.2; this.breath = 1; this.last = null; this.max = this.dur * 10;
  }
  _tick_road(dt) {
    for (const k of ['KeyA', 'KeyD']) {
      if (input.pressed(k, 0.05)) {
        input.consume(k);
        if (k !== this.last) { this.pace += 0.055; this.last = k; } else { this.pace -= 0.03; this._judge('STUMBLE'); }
      }
    }
    this.pace -= dt * (0.16 + this.pace * 0.1);
    if (this.breath <= 0) this.pace = Math.min(this.pace, 0.35);
    this.pace = clamp(this.pace, 0, 1);
    const zone = this.pace > 0.58 && this.pace < 0.8;
    if (this.pace > 0.8) this.breath -= dt * 0.35; else this.breath = Math.min(1, this.breath + dt * (zone ? 0.05 : 0.12));
    if (this.breath <= 0 && !this.blown) { this.blown = true; this._judge('BLOWN UP'); setTimeout(() => this.blown = false, 2500); this.breath = 0.001; }
    if (zone) { this.score += dt * 10; this._judge('IN THE ZONE'); } else if (this.pace < 0.58) this._judge('FASTER');
    else this._judge('EASE OFF');
    $('tr-n').style.left = (this.pace * 100) + '%';
    $('tr-b').style.width = (this.breath * 100) + '%';
    $('tr-s').textContent = Math.round(this.score);
    this.f.jogRate = 4 + this.pace * 10;
    this._cam(V(2.9, 1.35, 2.2), V(-0.3, 1.0, 0.6));
  }

  _cam(pos, look) {
    const cam = this.engine.camera;
    if (this.t < 0.05) { this.camPos.copy(pos); this.camLook.copy(look); }
    this.camPos.lerp(pos, 0.05); this.camLook.lerp(look, 0.08);
    cam.position.copy(this.camPos); cam.lookAt(this.camLook);
    cam.fov = 42; cam.updateProjectionMatrix();
  }

  update(dt, raw) {
    if (this.done) { this.f.update(dt); return; }
    this.t += raw;
    if (this.t > this.dur) { this._finish(); }
    const left = Math.max(0, Math.ceil(this.dur - this.t));
    const tm = $('tr-timer'); if (tm) tm.textContent = '0:' + String(left).padStart(2, '0');
    this['_tick_' + this.kind](raw);
    this.f.update(dt);
  }
}
