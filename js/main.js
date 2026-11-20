import * as THREE from 'three';
import { Engine } from './engine.js';
import { buildPub, buildVenue, buildGym, VENUES } from './scenes.js';
import { Fighter } from './fighter.js';
import { Fight, STYLES, controlsHtml } from './fight.js';
import { Training } from './training.js';
import { audio } from './audio.js';
import { ui } from './ui.js';
import { STORY, SHIFT_EVENTS } from './story.js';
import * as C from './career.js';
import { preloadModels, userModelKeys, loaded } from './models.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const money = n => '£' + Math.round(n).toLocaleString();

const game = { career: null };
window.__game = game; // handy for debugging in the console

// ---------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------
async function boot() {
  try { await document.fonts.load('80px Anton'); await document.fonts.load('40px "Barlow Condensed"'); } catch { }
  const engine = game.engine = new Engine($('c'));
  game.pub = buildPub(engine.envMap);
  game.gym = buildGym(engine.envMap);
  game.venues = {};
  const sub = document.querySelector('#loading .sub'); if (sub) sub.textContent = 'loading characters…';
  await preloadModels();
  setupPubCast();
  setupPubCamera();
  engine.setScene(game.pub);
  setupMute();
  window.addEventListener('pointerdown', () => audio.init(), { once: false });
  window.addEventListener('keydown', () => audio.init());
  setTimeout(() => { $('loading').style.opacity = 0; setTimeout(() => $('loading').remove(), 900); }, 300);
  titleScreen();
}

// Sound toggle: corner button + M key, remembered between visits
function setupMute() {
  const btn = $('mute');
  const ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  const OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/></svg>';
  const paint = () => { btn.innerHTML = audio.muted ? OFF : ON; btn.classList.toggle('off', audio.muted); btn.setAttribute('aria-label', audio.muted ? 'Unmute sound' : 'Mute sound'); };
  const toggle = () => { audio.init(); const m = audio.toggleMute(); paint(); ui.toast(m ? 'Sound off' : 'Sound on', !m, 1200); };
  btn.addEventListener('click', e => { e.stopPropagation(); toggle(); btn.blur(); });
  window.addEventListener('keydown', e => {
    if (e.code !== 'KeyM' || e.repeat) return;
    const a = document.activeElement; if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
    toggle();
  });
  paint();
}

function venue(theme) {
  if (!game.venues[theme]) game.venues[theme] = buildVenue(theme, game.engine.envMap);
  return game.venues[theme];
}

// ---------------------------------------------------------------------
// Pub cast + camera shots
// ---------------------------------------------------------------------
const CAST_LOOKS = {
  maggie: [{ skin: '#e8bfa0', hair: '#b9b2a8', hairStyle: 'bob', sex: 'f', build: 0.95, height: 0.92, trousers: '#2a2238', boots: '#2a1a14' }, '#6a2a3a'],
  terry: [{ skin: '#d9a07c', hair: '#cfc8bd', hairStyle: 'cap', beard: true, build: 0.95, height: 0.95, trousers: '#3a3026' }, '#3e3f36'],
  gaz: [{ skin: '#e3b494', hair: '#6b4a2a', hairStyle: 'buzz', beard: true, build: 1.16, height: 1.0, trousers: '#2a3550' }, '#8a8a3a'],
  vance: [{ skin: '#e0b090', hair: '#1a1410', hairStyle: 'slick', build: 1.0, height: 1.02, trousers: '#141418', boots: '#0a0a0a' }, '#17171c'],
  doyle: [{ skin: '#d9a07c', hair: '#111', hairStyle: 'bald', beard: true, build: 1.12, height: 1.04, trousers: '#141418' }, '#2a0a10'],
};

function setupPubCast() {
  const pub = game.pub, env = game.engine.envMap;
  game.cast = {};
  const place = (key, f, pos, rotY, mode) => { f.root.position.copy(pos); f.root.rotation.y = rotY; f.setMode(mode); pub.scene.add(f.root); game.cast[key] = f; };
  place('player', new Fighter(defaultLook(), { shirt: '#25303d', envMap: env, model: bodyModel(null) }), pub.spots.bartender, 0, 'polish');
  const [ml, ms] = CAST_LOOKS.maggie; place('maggie', new Fighter(ml, { shirt: ms, envMap: env, model: CAST_MODELS.maggie }), pub.spots.maggie, 0.3, 'arms');
  const [tl, ts] = CAST_LOOKS.terry; place('terry', new Fighter(tl, { shirt: ts, envMap: env, model: CAST_MODELS.terry }), pub.spots.terry, Math.PI + 0.25, 'sit');
  const [gl, gs] = CAST_LOOKS.gaz; place('gaz', new Fighter(gl, { shirt: gs, envMap: env }), V(-0.6, 0, pub.barZ + 1.0), Math.PI - 0.15, 'stand');
  const [vl, vs] = CAST_LOOKS.vance; place('vance', new Fighter(vl, { shirt: vs, envMap: env, model: CAST_MODELS.vance }), V(-0.3, 0, pub.barZ + 1.15), Math.PI, 'arms');
  const [dl, ds] = CAST_LOOKS.doyle; place('doyle', new Fighter(dl, { shirt: ds, envMap: env }), V(-0.3, 0, pub.barZ + 1.15), Math.PI, 'arms');
  game.cast.gaz.root.visible = false; game.cast.vance.root.visible = false; game.cast.doyle.root.visible = false;
  // a couple of regulars at tables
  const regs = [[{ skin: '#c48a68', hair: '#333', hairStyle: 'short', build: 1.0 }, '#5a3a22', V(-3.5 + 0.75 * Math.cos(0.3), 0, 1.6 + 0.75 * Math.sin(0.3))], [{ skin: '#8a573a', hair: '#111', hairStyle: 'buzz', build: 1.05 }, '#2a4a3a', V(2.2 + 0.75 * Math.cos(2.4), 0, 2.2 + 0.75 * Math.sin(2.4))]];
  regs.forEach(([l, s, p], i) => {
    const f = new Fighter(l, { shirt: s, envMap: env });
    f.root.position.copy(p).setY(-0.28);
    const tableC = i ? V(2.2, 0, 2.2) : V(-3.5, 0, 1.6);
    f.root.rotation.y = Math.atan2(tableC.x - p.x, tableC.z - p.z);
    f.setMode('sit'); pub.scene.add(f.root);
    game.cast['reg' + i] = f;
  });
  pub.updaters.push((dt) => { for (const k in game.cast) if (game.cast[k].root.visible) game.cast[k].update(dt); });
}

// Real models for the pub cast (loaded from the three.js example assets); falls back to the procedural rig.
const CAST_MODELS = {
  terry: { key: 'rpm', skin: false, tint: { Wolf3D_Outfit_Top: '#a07a5a', Wolf3D_Outfit_Bottom: '#7a6a58' } },
  vance: { key: 'rpm', skin: false, hide: ['Wolf3D_Beard'], tint: { Wolf3D_Outfit_Top: '#4a4a58', Wolf3D_Outfit_Bottom: '#3a3a44', Wolf3D_Outfit_Footwear: '#333' } },
};
// Fighter bodies: your own models from assets/fighters/ (see README), else the procedural rig.
function bodyModel(key) { return key && loaded(key) ? { key, skin: false } : null; }
function oppModel(opp) {
  const keys = userModelKeys().filter(k => k !== (game.career && game.career.player.modelKey));
  const all = keys.length ? keys : userModelKeys();
  return all.length ? { key: all[(opp.idx ?? 0) % all.length], skin: false } : null;
}

function defaultLook() { return { skin: '#d9a07c', hair: '#2a1a10', hairStyle: 'short', beard: false, trousers: '#1a1a1e', build: 1.0, height: 1.0 }; }

function rebuildBartender(look) {
  const old = game.cast.player;
  const f = new Fighter(look, { shirt: '#25303d', envMap: game.engine.envMap, model: bodyModel(game.career ? game.career.player.modelKey : game._crModel) });
  f.root.position.copy(old.root.position); f.root.rotation.y = old.root.rotation.y; f.setMode(old.mode);
  old.dispose();
  game.pub.scene.add(f.root);
  game.cast.player = f;
}

const SHOTS = {
  title: [V(3.4, 1.55, 1.6), V(0.0, 1.25, -2.6)],
  wide: [V(3.6, 1.75, 2.4), V(0, 1.15, -2.4)],
  hub: [V(0.25, 1.62, 0.9), V(0.25, 1.32, -3.0)],
  player: [V(0.75, 1.58, -1.35), V(0.2, 1.48, -3.15)],
  maggie: [V(-1.05, 1.55, -1.35), V(-1.8, 1.48, -3.15)],
  terry: [V(1.0, 1.45, -3.35), V(1.5, 1.32, -1.65)],
  gaz: [V(-0.15, 1.58, -3.3), V(-0.6, 1.52, -1.4)],
  vance: [V(-0.7, 1.6, -3.3), V(-0.3, 1.58, -1.25)],
  create: [V(1.05, 1.58, -1.25), V(0.62, 1.42, -3.15)],
};

function setupPubCamera() {
  const pc = game.pubCam = { pos: SHOTS.title[0].clone(), look: SHOTS.title[1].clone(), shot: 'title', active: true, t: 0 };
  game.pub.updaters.push((dt, raw, t) => {
    if (!pc.active) return;
    pc.t += raw;
    const [p, l] = SHOTS[pc.shot] || SHOTS.wide;
    const tp = p.clone(), tl = l.clone();
    // subtle handheld drift
    tp.x += Math.sin(t * 0.31) * 0.06; tp.y += Math.sin(t * 0.47) * 0.03;
    if (pc.shot === 'title') { tp.x += Math.sin(t * 0.1) * 0.8; tp.z += Math.cos(t * 0.1) * 0.4; }
    pc.pos.lerp(tp, 1 - Math.exp(-2.2 * raw)); pc.look.lerp(tl, 1 - Math.exp(-2.8 * raw));
    const cam = game.engine.camera;
    cam.position.copy(pc.pos); cam.lookAt(pc.look);
    if (cam.fov !== 40) { cam.fov = 40; cam.updateProjectionMatrix(); }
  });
}
function shot(name, snap = false) {
  const pc = game.pubCam; pc.shot = name;
  if (snap && SHOTS[name]) { pc.pos.copy(SHOTS[name][0]); pc.look.copy(SHOTS[name][1]); }
}

async function toPub(shotName = 'hub') {
  game.engine.setScene(game.pub);
  game.pubCam.active = true;
  shot(shotName, true);
  audio.setAmbience('pub');
}

async function story(key, ...args) {
  const lines = STORY[key](game.career, ...args);
  const showFor = { gaz: 'gaz', vance: 'vance' };
  return ui.dialogue(lines, line => {
    if (line.shot) shot(line.shot);
    const g = game.cast;
    if (line.who === 'Gaz') g.gaz.root.visible = true;
    if (line.who === 'Ronnie Vance') { g.vance.root.visible = true; g.doyle.root.visible = false; }
    if (line.who === 'Vince Doyle') { g.doyle.root.visible = true; g.vance.root.visible = false; }
  });
}
function hideVisitors() { const g = game.cast; g.gaz.root.visible = false; g.vance.root.visible = false; g.doyle.root.visible = false; }

// ---------------------------------------------------------------------
// Title
// ---------------------------------------------------------------------
function titleScreen() {
  toPub('title');
  const saved = C.load();
  ui.screen(`<div class="title-screen">
    <div class="logo"><div class="b">Bare Knuckle</div><div class="a">Last Orders</div></div>
    <div class="tagline">A barman. A cellar. A pub worth fighting for.</div>
    <div class="menu">
      ${saved ? `<button class="btn" data-a="cont">Continue — ${saved.player.name}, Season ${saved.season}</button>` : ''}
      <button class="btn" data-a="new">New Career</button>
      <button class="btn" data-a="quick">Quick Fight</button>
      <button class="btn" data-a="how">How to Play</button>
    </div>
  </div>`, {
    cont: () => { game.career = saved; ui.transition(async () => { rebuildBartender(saved.player.look); await toPub('hub'); hub(); }); },
    new: () => { if (saved && !confirm('Start a new career? Your current save will be overwritten.')) return; createScreen(); },
    quick: () => quickFightScreen(),
    how: () => howTo(),
  });
}

function howTo() {
  ui.modal(`<h2>How to Play</h2>
    <p style="color:var(--paper-dim);line-height:1.5;margin-top:0">You're a barman at the King's Head, Ashcroft. The pub owes the brewery £6,000. Fight your way up three divisions of bare-knuckle boxing to save it.</p>
    <h3>Season</h3>
    <p style="line-height:1.5;margin:0">Eight fighters, seven weeks, everyone fights everyone once. <b>Win = 3 pts, KO/TKO bonus = +1, Draw = 1.</b> Top two meet in the final and are promoted. Each week you get three slots: <b>train</b>, <b>work a bar shift</b> (money + stories) or <b>rest</b> (fatigue). Fatigue lowers your stamina in fights.</p>
    <h3>Fighting</h3>
    <div class="controls-list">${controlsHtml()}</div>
    <h3>Tips</h3>
    <p style="line-height:1.5;margin:0">Punch while he's winding up for a <b>counter</b> (+45% damage). Slip a head shot then fire back. Body shots eat stamina and shrink his stamina cap. If you get dropped, mash SPACE.</p>
    <div class="actions" style="margin-top:16px"><button class="pill primary" data-a="ok">Got it</button></div>`, { ok: () => ui.closeModal() });
}

// ---------------------------------------------------------------------
// Character creation
// ---------------------------------------------------------------------
function createScreen() {
  shot('create');
  const look = defaultLook();
  const SK = ['#f0c8a8', '#e3b494', '#d9a07c', '#c48a68', '#a86f4f', '#8a573a', '#6b3f28', '#4e2c1c'];
  const HC = ['#1a120c', '#2a1a10', '#4a3020', '#6b4a2a', '#b08850', '#8a2a10', '#777', '#d8d0c0'];
  const TR = ['#1a1a1e', '#2a2018', '#1b2330', '#3a1a1a', '#20301f', '#4a3c28'];
  const sw = (key, list) => list.map(c => `<div class="swatch ${look[key] === c ? 'sel' : ''}" style="background:${c}" data-a="${key}" data-v="${c}"></div>`).join('');
  const render = () => {
    ui.screen(`<div class="create panel">
      <div class="kicker">New Career</div><h2>Who's behind the bar?</h2>
      <label>Name</label><input id="cr-name" maxlength="20" value="${game._crName || 'Danny Shaw'}">
      <label>Fight name</label><input id="cr-nick" maxlength="22" value="${game._crNick || 'The Barman'}">
      ${userModelKeys().length ? `<label>Body model</label><div class="actions"><button class="pill ${!game._crModel ? 'sel' : ''}" data-a="model" data-v="">Classic</button>${userModelKeys().map(k => `<button class="pill ${game._crModel === k ? 'sel' : ''}" data-a="model" data-v="${k}">${loaded(k).def.name}</button>`).join('')}</div>` : ''}
      <label>Skin</label><div class="swatches">${sw('skin', SK)}</div>
      <label>Hair</label><div class="actions">${['short', 'buzz', 'bald', 'mohawk', 'slick'].map(s => `<button class="pill ${look.hairStyle === s ? 'sel' : ''}" data-a="hairStyle" data-v="${s}">${s}</button>`).join('')}</div>
      <label>Hair colour</label><div class="swatches">${sw('hair', HC)}</div>
      <label>Beard</label><div class="actions"><button class="pill ${look.beard ? 'sel' : ''}" data-a="beard" data-v="1">Beard</button><button class="pill ${!look.beard ? 'sel' : ''}" data-a="beard" data-v="0">Clean-shaven</button></div>
      <label>Build</label><div class="actions">${[['Lean', 0.92], ['Average', 1.0], ['Heavy', 1.12]].map(([n, v]) => `<button class="pill ${look.build === v ? 'sel' : ''}" data-a="build" data-v="${v}">${n}</button>`).join('')}</div>
      <label>Fight trousers</label><div class="swatches">${sw('trousers', TR)}</div>
      <div class="actions" style="margin-top:20px"><button class="pill primary" data-a="go">Start career</button><button class="pill" data-a="back">Back</button></div>
    </div>`, {
      skin: v => upd('skin', v), hair: v => upd('hair', v), hairStyle: v => upd('hairStyle', v), trousers: v => upd('trousers', v),
      beard: v => upd('beard', v === '1'), build: v => upd('build', +v),
      model: v => { keepNames(); game._crModel = v || null; rebuildBartender(look); game.cast.player.setMode('stand'); render(); },
      go: () => start(), back: () => titleScreen(),
    });
  };
  const keepNames = () => { const n = $('cr-name'), k = $('cr-nick'); if (n) game._crName = n.value; if (k) game._crNick = k.value; };
  const upd = (k, v) => { keepNames(); look[k] = v; rebuildBartender(look); game.cast.player.setMode('stand'); render(); };
  const start = () => {
    keepNames();
    const name = (game._crName || 'Danny Shaw').trim() || 'Danny Shaw';
    const nick = (game._crNick || 'The Barman').trim();
    game.career = C.freshCareer(name, nick, { ...look });
    game.career.player.modelKey = game._crModel || null;
    game.cast.player.setMode('polish');
    ui.clear();
    intro();
  };
  game.cast.player.setMode('stand');
  render();
}

// ---------------------------------------------------------------------
// Intro + tutorial scrap in the pub
// ---------------------------------------------------------------------
async function intro() {
  const c = game.career;
  shot('wide', true);
  game.cast.gaz.root.visible = true;
  await story('intro');
  // tutorial fight in the pub
  const pubArena = { scene: game.pub.scene, floorY: 0, bounds: 1.5, crowd: null, theme: 'pub' };
  const gaz = { name: 'Gaz Pickering', nick: 'The Forklift', stats: { power: 30, speed: 28, stamina: 30, defence: 20, chin: 30 }, look: CAST_LOOKS.gaz[0], style: 'brawler' };
  const res = await runFight({ venue: pubArena, center: V(0, 0, 0.7), opp: gaz, rounds: 1, roundTime: 90, mode: 'tutorial', inPub: true });
  await ui.transition(async () => { await toPub('wide'); hideVisitors(); });
  await story('postTutorial', res.winner === 'player');
  C.startSeason(c);
  c.phase = 'week';
  C.save(c);
  await ui.transition(async () => { shot('hub', true); });
  hub();
}

// Runs a fight and resolves with the result
function runFight({ venue: v, center, opp, rounds, roundTime, mode = 'career', inPub = false, playerOverride }) {
  return new Promise(resolve => {
    const c = game.career;
    const p = playerOverride || c.player;
    ui.transition(async () => {
      ui.clear();
      if (inPub) {
        game.pubCam.active = false;
        game.cast.player.root.visible = false; game.cast.gaz.root.visible = false;
      } else { game.pubCam.active = false; game.engine.setScene(v); }
      game.fight = new Fight(game, {
        venue: v, center, rounds, roundTime, mode,
        player: { name: p.name, stats: p.stats, look: p.look, fatigue: p.fatigue || 0, stamBuff: p.stamBuff || 0, model: bodyModel(p.modelKey) },
        opp: { ...opp, model: opp.model !== undefined ? opp.model : oppModel(opp) },
        onEnd: (r) => {
          ui.transition(async () => {
            game.fight.dispose(); game.fight = null;
            if (inPub) { game.cast.player.root.visible = true; game.pubCam.active = true; }
            resolve(r);
          });
        },
      });
    });
  });
}

// ---------------------------------------------------------------------
// Hub (the pub, week by week)
// ---------------------------------------------------------------------
function statBar(label, v, red = false) {
  return `<div class="statrow"><span>${label}</span><div class="track ${red ? 'red' : ''}"><i style="width:${clamp(v, 0, 100)}%"></i></div><span class="v">${Math.round(v)}</span></div>`;
}

function leagueTableHtml(c, compact = false) {
  const rows = C.sortedTable(c.table);
  return `<table class="league"><tr><th>#</th><th>Fighter</th><th>P</th><th>W</th><th>D</th><th>L</th><th>KO</th><th>Pts</th></tr>
    ${rows.map((r, i) => { const f = C.getFighter(c, r.id); return `<tr class="${r.id === 'me' ? 'me' : ''} ${i < 2 ? 'promo' : ''}"><td>${i + 1}</td><td>${f.name}</td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.ko}</td><td><b>${r.pts}</b></td></tr>`; }).join('')}
  </table>`;
}

function lastResultsHtml(c) {
  const last = c.results.filter(r => r.week === c.week - 1);
  if (!last.length) return '<div class="m" style="color:var(--paper-dim)">No fights yet this season.</div>';
  return last.map(r => {
    const a = C.getFighter(c, r.a), b = C.getFighter(c, r.b);
    const w = r.winner ? C.getFighter(c, r.winner) : null;
    return `<div><span>${w ? `<span class="w">${w.name.split(' ').pop()}</span> bt ${(r.winner === r.a ? b : a).name.split(' ').pop()}` : `${a.name.split(' ').pop()} drew ${b.name.split(' ').pop()}`}</span><span class="m">${r.method}${r.method !== 'PTS' && r.method !== 'DRAW' ? ' R' + r.round : ''}</span></div>`;
  }).join('');
}

function hub() {
  const c = game.career;
  game.cast.player.setMode('polish');
  hideVisitors();
  shot('hub');
  audio.setAmbience('pub');
  if (c.phase === 'final') return finalWeek();
  const div = C.DIVISIONS[c.div];
  const oppId = C.playerFixture(c);
  const opp = C.getFighter(c, oppId);
  const oppRow = c.table[oppId];
  const me = c.player, s = me.stats;
  const slots = [0, 1, 2].map(i => c.slots[i] ? `<div class="slot done">${c.slots[i]}</div>` : `<div class="slot">Free</div>`).join('');
  const full = c.slots.length >= 3;
  const pos = C.sortedTable(c.table).findIndex(r => r.id === 'me') + 1;
  ui.screen(`<div class="hub">
    <div class="topbar">
      <div class="brand">The King's Head</div>
      <div class="stat">Season<b>${c.season}</b></div>
      <div class="stat">${div.short}<b>Week ${c.week + 1}/7</b></div>
      <div class="stat">Position<b>${pos}${['st', 'nd', 'rd'][pos - 1] || 'th'}</b></div>
      <div class="grow"></div>
      <div class="stat">Cash<b>${money(me.money)}</b></div>
      <div class="stat">Pub debt<b style="color:${c.debt > 0 ? 'var(--blood)' : 'var(--green)'}">${c.debt > 0 ? money(c.debt) : 'PAID'}</b></div>
      <button class="pill" data-a="menu">Menu</button>
    </div>
    <div class="left">
      <div class="panel">
        <div class="kicker">${me.nick ? '“' + me.nick + '”' : 'Fighter'}</div>
        <h2>${me.name}</h2>
        <div class="cards">Record ${me.record.w}–${me.record.l}–${me.record.d} · ${me.record.ko} KOs · Rep ${Math.round(me.rep)}</div>
        ${statBar('Power', s.power)}${statBar('Speed', s.speed)}${statBar('Stamina', s.stamina)}${statBar('Defence', s.defence)}${statBar('Chin', s.chin)}
        <h3>Condition</h3>
        ${statBar('Fatigue', me.fatigue, true)}
        ${me.stamBuff ? '<div class="cards" style="color:var(--brass)">Steak & chips: +12 stamina next fight</div>' : ''}
      </div>
      <div class="panel">
        <h3 style="margin-top:0">The Pub</h3>
        <div class="cards">The brewery wants ${money(6000)}. ${c.debt > 0 ? `Still owed: <b style="color:var(--paper)">${money(c.debt)}</b>.` : 'Paid in full. Maggie keeps the lease.'}</div>
        <div class="actions"><button class="pill" data-a="pay" ${c.debt <= 0 || me.money < 1 ? 'disabled' : ''}>Pay toward debt</button><button class="pill" data-a="shop">Terry's Kit Bag</button></div>
      </div>
    </div>
    <div class="right">
      <div class="panel opp-card">
        <div class="kicker">Friday · ${VENUES[div.venue].name}</div>
        <div class="big">${opp.name}</div>
        <div class="nick">“${opp.nick}”</div>
        <div class="meta">${opp.town} · ${STYLES[opp.style].label} · ${oppRow.w}–${oppRow.l}–${oppRow.d} · ${oppRow.pts} pts</div>
        ${statBar('Power', opp.stats.power)}${statBar('Speed', opp.stats.speed)}${statBar('Stamina', opp.stats.stamina)}${statBar('Defence', opp.stats.defence)}${statBar('Chin', opp.stats.chin)}
      </div>
      <div class="panel"><h3 style="margin-top:0">${div.name}</h3>${leagueTableHtml(c)}</div>
      <div class="panel"><h3 style="margin-top:0">Last week's results</h3><div class="results">${lastResultsHtml(c)}</div></div>
    </div>
    <div class="bottom panel">
      <div class="kicker">This week</div>
      <div class="slots">${slots}</div>
      <div class="actions">
        <button class="pill" data-a="train" ${full ? 'disabled' : ''}>Train</button>
        <button class="pill" data-a="shift" ${full ? 'disabled' : ''}>Work a shift</button>
        <button class="pill" data-a="rest" ${full ? 'disabled' : ''}>Rest</button>
        <div style="flex:1"></div>
        <button class="pill primary" data-a="fight">Fight night ▸</button>
      </div>
    </div>
  </div>`, {
    train: () => trainMenu(), shift: () => doShift(), rest: () => doRest(), fight: () => fightNight(),
    pay: () => payMenu(), shop: () => shopMenu(), menu: () => pauseMenu(),
  });
  checkHubStory();
}

let hubStoryBusy = false;
async function checkHubStory() {
  const c = game.career;
  if (hubStoryBusy) return;
  const play = async (flag, key) => {
    if (c.flags[flag]) return false;
    c.flags[flag] = true; hubStoryBusy = true;
    ui.clear(); await story(key); hubStoryBusy = false; C.save(c); hideVisitors(); hub(); return true;
  };
  if (c.div === 1 && c.week === 0 && await play('mill', 'mill')) return;
  if (c.div === 1 && c.week === 3 && await play('bribeOffer', 'bribe')) return;
  if (c.div === 2 && c.week === 0 && await play('doyleVisit', 'doyle')) return;
  if (c.div === 2 && c.week === 4 && await play('heart', 'heart')) return;
}

function pauseMenu() {
  ui.modal(`<h2>Menu</h2><div class="actions">
    <button class="pill" data-a="how">How to play</button>
    <button class="pill" data-a="save">Save</button>
    <button class="pill" data-a="title">Save & quit to title</button>
    <button class="pill" data-a="close">Close</button></div>`, {
    how: () => howTo(), save: () => { C.save(game.career); ui.toast('Saved.', true); ui.closeModal(); },
    title: () => { C.save(game.career); ui.closeModal(); ui.transition(async () => titleScreen()); }, close: () => ui.closeModal(),
  });
}

function payMenu() {
  const c = game.career, m = c.player.money;
  const opts = [100, 500, 1000].filter(v => v <= m && v <= c.debt);
  const all = Math.min(m, c.debt);
  ui.modal(`<h2>Pay the brewery</h2><div class="cards">You have ${money(m)}. The pub owes ${money(c.debt)}. Keep some back for kit and physio.</div>
    <div class="actions">${opts.map(v => `<button class="pill" data-a="p" data-v="${v}">${money(v)}</button>`).join('')}<button class="pill primary" data-a="p" data-v="${all}">Pay ${money(all)}</button><button class="pill" data-a="close">Cancel</button></div>`, {
    p: async v => {
      v = +v; c.player.money -= v; c.debt -= v; c.paid += v; c.player.rep += v / 200;
      ui.closeModal(); ui.toast(`Paid ${money(v)} to the brewery. Maggie hugs you.`, true);
      C.save(c);
      if (c.debt <= 0 && !c.flags.debtPaid) { c.flags.debtPaid = true; ui.clear(); await story('debtPaid'); C.save(c); }
      hub();
    }, close: () => ui.closeModal(),
  });
}

function shopMenu() {
  const c = game.career, me = c.player;
  const items = C.SHOP.map(it => {
    const owned = it.once && me.items[it.id];
    const can = !owned && me.money >= it.price;
    return `<div class="choice ${can ? '' : 'disabled'}" data-a="buy" data-v="${it.id}"><div class="t">${it.name}</div><div class="d">${it.desc}</div><div class="g">${owned ? 'Owned' : money(it.price)}</div></div>`;
  }).join('');
  ui.modal(`<div class="kicker">Cash: ${money(me.money)}</div><h2>Terry's Kit Bag</h2><div class="choice-grid">${items}</div>
    <div class="actions" style="margin-top:14px"><button class="pill" data-a="close">Done</button></div>`, {
    buy: id => {
      const it = C.SHOP.find(x => x.id === id);
      me.money -= it.price;
      if (it.once) me.items[id] = true;
      if (id === 'wraps') me.stats.power = Math.min(99, me.stats.power + 3);
      if (id === 'physio') me.fatigue = Math.max(0, me.fatigue - 50);
      if (id === 'steak') me.stamBuff = 12;
      ui.toast(`Bought: ${it.name}`, true);
      C.save(c); hub(); shopMenu();
    }, close: () => ui.closeModal(),
  });
}

// ---------------------------------------------------------------------
// Weekly actions
// ---------------------------------------------------------------------
function useSlot(label) { const c = game.career; c.slots.push(label); C.save(c); }

function trainMenu() {
  const c = game.career, me = c.player;
  const cards = Object.entries(C.TRAINING).map(([k, t]) => {
    const name = k === 'road' ? 'Circuits' : t.name;
    return `<div class="choice" data-a="t" data-v="${k}"><div class="t">${name}</div><div class="d">${t.desc.replace('Five miles round the canal at dawn.', 'Shuttle runs and high knees till you see stars.')}</div><div class="g">${t.stat.toUpperCase()} · +${t.fat} fatigue</div></div>`;
  }).join('');
  ui.modal(`<div class="kicker">Terry's back room</div><h2>Training</h2>
    <div class="cards">${me.fatigue > 60 ? '<b style="color:var(--blood)">You\'re knackered — gains are reduced. Consider resting.</b>' : 'Play the session for full gains, or let Terry run it (sim) for 70%.'}</div>
    <div class="choice-grid">${cards}</div>
    <div class="actions" style="margin-top:14px"><label style="display:flex;gap:8px;align-items:center;font-family:var(--cond);letter-spacing:1px;text-transform:uppercase"><input type="checkbox" id="tr-sim"> Sim session (70%)</label><div style="flex:1"></div><button class="pill" data-a="close">Cancel</button></div>`, {
    t: k => { const sim = $('tr-sim').checked; ui.closeModal(); doTrain(k, sim); }, close: () => ui.closeModal(),
  });
}

function gainFor(stat, score, kind) {
  const me = game.career.player;
  const itemMul = { power: me.items.weights, speed: me.items.rope, stamina: me.items.trainers }[stat] ? 1.3 : 1;
  const fat = me.fatigue > 60 ? 0.6 : me.fatigue > 35 ? 0.85 : 1;
  const cur = me.stats[stat];
  return Math.max(0.2, (0.6 + score * 2.8) * itemMul * fat * (1 - cur / 130));
}

async function doTrain(kind, sim) {
  const c = game.career, me = c.player, T = C.TRAINING[kind];
  let score = 0.7 * 0.75;
  let extra = '';
  if (!sim) {
    if (kind === 'spar') {
      Object.assign(game.gym, { floorY: 0, bounds: 1.2, crowd: null, theme: 'gym' });
      game.gym.bag.visible = false;
      const avg = (me.stats.power + me.stats.speed + me.stats.defence) / 3;
      const dec = { name: 'Little Dec', nick: 'Terry\'s nephew', stats: { power: avg, speed: avg + 4, stamina: 70, defence: avg, chin: 60 }, look: { skin: '#e3b494', hair: '#b08850', hairStyle: 'short', build: 0.94, trousers: '#2a3550' }, style: 'boxer' };
      const r = await runFight({ venue: game.gym, center: V(0.25, 0, 0.25), opp: dec, rounds: 1, roundTime: 45, mode: 'spar' });
      game.gym.bag.visible = true;
      score = clamp((r.p.blocked * 1.5 + r.p.slips * 3 + r.p.landed + r.p.counters * 2) / 38, 0, 1);
      extra = `Blocked ${r.p.blocked}, slipped ${r.p.slips}, landed ${r.p.landed}.`;
    } else {
      await ui.transition(async () => { ui.clear(); game.pubCam.active = false; game.engine.setScene(game.gym); });
      score = await new Training(game, game.gym, kind, me).run();
    }
  }
  const stat = T.stat;
  const g = gainFor(stat, score, kind);
  me.stats[stat] = Math.min(99, me.stats[stat] + g);
  let chin = 0;
  if (kind === 'spar') { chin = g * (me.items.gumshield ? 0.6 : 0.4); me.stats.chin = Math.min(99, me.stats.chin + chin); }
  me.fatigue = Math.min(100, me.fatigue + T.fat);
  useSlot((kind === 'road' ? 'Circuits' : T.name) + ` +${g.toFixed(1)}`);
  await ui.transition(async () => { await toPub('hub'); hub(); });
  const grade = score > 0.85 ? 'Terry: “Now THAT’S a session.”' : score > 0.6 ? 'Terry: “Not bad. Again tomorrow.”' : score > 0.35 ? 'Terry: “My nan moves quicker.”' : 'Terry: “Were you even awake?”';
  ui.toast(`${T.stat.toUpperCase()} +${g.toFixed(1)}${chin ? ` · CHIN +${chin.toFixed(1)}` : ''} · ${sim ? 'Sim session' : grade} ${extra}`, true, 4200);
}

async function doShift() {
  const c = game.career, me = c.player;
  const base = 40 + Math.round(Math.random() * 30) + Math.round(me.rep / 4);
  me.money += base; me.fatigue = Math.min(100, me.fatigue + 4);
  ui.clear();
  shot('player');
  const ev = SHIFT_EVENTS[(Math.random() * SHIFT_EVENTS.length) | 0](c, Math.random);
  if (ev.fx) ev.fx();
  await ui.dialogue([{ place: 'Bar shift', text: `Six hours behind the bar. Wages and tips: ${money(base)}.`, shot: 'player' }, ...ev.lines], line => line.shot && shot(line.shot));
  useSlot('Bar shift');
  hub();
}

function doRest() {
  const me = game.career.player;
  me.fatigue = Math.max(0, me.fatigue - 35);
  useSlot('Rest');
  ui.toast('Feet up, telly on. Fatigue -35.', true);
  hub();
}

// ---------------------------------------------------------------------
// Fight night
// ---------------------------------------------------------------------
async function fightNight(isFinal = false) {
  const c = game.career, me = c.player;
  const div = C.DIVISIONS[c.div];
  // unused slots -> rest
  const unused = 3 - c.slots.length;
  if (unused > 0 && !isFinal) me.fatigue = Math.max(0, me.fatigue - unused * 20);
  let opp;
  if (isFinal) opp = c.finalOpp;
  else opp = C.getFighter(c, C.playerFixture(c));
  if (isFinal && c.div === 2) { ui.clear(); await story('titlePre'); }
  const rounds = div.rounds + (isFinal ? 1 : 0);
  const res = await runFight({ venue: venue(div.venue), opp: { ...opp, name: opp.name, nick: opp.nick }, rounds, roundTime: div.roundTime });
  me.stamBuff = 0;
  // apply
  const won = res.winner === 'player', drew = res.winner === 'draw';
  const method = res.method === 'RTD' ? 'TKO' : res.method;
  if (won) { me.record.w++; if (method === 'KO' || method === 'TKO') me.record.ko++; } else if (drew) me.record.d++; else me.record.l++;
  const purseBase = isFinal ? div.finalPurse : div.purse;
  const purse = Math.round(purseBase * (won ? 1 : drew ? 0.6 : 0.35) * (1 + Math.max(0, me.rep) / 200));
  me.money += purse;
  me.fatigue = Math.min(100, me.fatigue + 15);
  me.rep += won ? (method === 'PTS' ? 4 : 7) : drew ? 1 : -1;
  if (!isFinal) {
    // league results for the week
    const fx = c.fixtures[c.week];
    for (const [a, b] of fx) {
      let r;
      if (a === 'me' || b === 'me') {
        const oppId = a === 'me' ? b : a;
        r = { winner: won ? 'me' : drew ? null : oppId, method, round: res.round };
      } else r = C.simFight(C.getFighter(c, a), C.getFighter(c, b), c.div);
      C.applyResult(c.table, a, b, r);
      c.results.push({ week: c.week, a, b, ...r });
    }
    c.week++; c.slots = [];
  }
  me.fatigue = Math.max(0, me.fatigue - 10);
  C.save(c);
  await toPub('hub');
  await resultScreen(res, opp, purse, isFinal);
  // story triggers
  if (!isFinal) {
    if (c.div === 0 && c.season === 1 && c.week === 3 && !c.flags.vance) { c.flags.vance = true; await story('vanceVisit'); hideVisitors(); }
    if (c.flags.bribe && !c.flags.bribeDone && c.div === 1 && c.week === 4) { c.flags.bribeDone = true; await story('bribeAftermath', won); }
    if (c.week >= 7) return endOfLeague();
  } else {
    return afterFinal(won);
  }
  C.save(c);
  hub();
}

function resultScreen(res, opp, purse, isFinal) {
  return new Promise(resolve => {
    const won = res.winner === 'player', drew = res.winner === 'draw';
    const how = { KO: 'Knockout', TKO: 'Technical knockout', PTS: 'Points decision', DRAW: 'Draw', RTD: 'Retired' }[res.method];
    const sc = res.scores.reduce((a, s) => [a[0] + s[0], a[1] + s[1]], [0, 0]);
    const p = res.p, o = res.o;
    shot('player');
    game.cast.player.setMode(won ? 'arms' : 'polish');
    ui.screen(`<div class="modal-wrap"><div class="modal panel result">
      <div class="kicker">${isFinal ? 'The Final' : 'Fight night'} · ${game.career.player.name} vs ${opp.name}</div>
      <div class="big ${won ? 'win' : 'loss'}">${won ? 'Victory' : drew ? 'Draw' : 'Defeat'}</div>
      <div class="how">${how}${res.method !== 'PTS' && res.method !== 'DRAW' ? ' · Round ' + res.round : ' · ' + sc[0] + '–' + sc[1]}</div>
      <div class="grid">
        <div class="l">${p.landed}/${p.thrown}</div><div class="c">Landed</div><div class="r">${o.landed}/${o.thrown}</div>
        <div class="l">${p.bodyLanded}</div><div class="c">Body shots</div><div class="r">${o.bodyLanded}</div>
        <div class="l">${p.counters}</div><div class="c">Counters</div><div class="r">${o.counters}</div>
        <div class="l">${p.blocked}</div><div class="c">Blocked</div><div class="r">${o.blocked}</div>
        <div class="l">${res.oKd}</div><div class="c">Knockdowns</div><div class="r">${res.pKd}</div>
      </div>
      <div class="cards">Purse: <b style="color:var(--brass)">${money(purse)}</b></div>
      <div class="actions" style="justify-content:center"><button class="pill primary" data-a="ok">Back to the pub</button></div>
    </div></div>`, { ok: () => { ui.clear(); resolve(); } });
  });
}

// ---------------------------------------------------------------------
// Season end
// ---------------------------------------------------------------------
async function endOfLeague() {
  const c = game.career;
  const rows = C.sortedTable(c.table);
  const pos = rows.findIndex(r => r.id === 'me');
  shot('wide');
  if (pos < 2) {
    const otherId = rows[pos === 0 ? 1 : 0].id;
    c.finalOpp = c.div === 2 ? (c.opps.find(o => o.name === 'Vince Doyle') || C.getFighter(c, otherId)) : C.getFighter(c, otherId);
    c.phase = 'final';
    C.save(c);
    await story('finalMade');
    finalWeek();
  } else {
    await ui.dialogue([{ place: 'Final table', text: `You finished ${pos + 1}${['st', 'nd', 'rd'][pos] || 'th'} in the ${C.DIVISIONS[c.div].name}.`, shot: 'wide' }]);
    await story('finalMissed');
    await newSeason(false, false);
  }
}

function finalWeek() {
  const c = game.career, opp = c.finalOpp, div = C.DIVISIONS[c.div];
  shot('hub');
  ui.screen(`<div class="modal-wrap" style="background:rgba(0,0,0,.35)"><div class="modal panel opp-card" style="width:min(560px,92vw)">
    <div class="kicker">${c.div === 2 ? 'For the National Title' : 'The ' + div.short + ' Final'} · ${div.rounds + 1} rounds · ${money(div.finalPurse)} to the winner</div>
    <div class="big">${opp.name}</div><div class="nick">“${opp.nick}”</div>
    <div class="meta">${opp.town} · ${STYLES[opp.style].label}</div>
    ${statBar('Power', opp.stats.power)}${statBar('Speed', opp.stats.speed)}${statBar('Stamina', opp.stats.stamina)}${statBar('Defence', opp.stats.defence)}${statBar('Chin', opp.stats.chin)}
    <h3>You</h3>
    ${statBar('Fatigue', c.player.fatigue, true)}
    <div class="actions" style="margin-top:14px"><button class="pill" data-a="rest">Rest first (−40 fatigue)</button><button class="pill primary" data-a="go">Walk out ▸</button></div>
  </div></div>`, {
    rest: () => { c.player.fatigue = Math.max(0, c.player.fatigue - 40); ui.toast('Terry makes you sleep in the back room. Fatigue −40.', true); finalWeek(); },
    go: () => { ui.clear(); fightNight(true); },
  });
}

async function afterFinal(won) {
  const c = game.career, div = C.DIVISIONS[c.div];
  if (won) c.titles.push(`${div.short} champion (S${c.season})`);
  if (c.div === 2) {
    if (won) {
      if (c.debt > 0) { c.debt = 0; c.flags.debtPaid = true; }
      await story('endingWin');
    } else await story('endingLose');
    return newSeason(false, won);
  }
  return newSeason(true, won);
}

async function newSeason(promote, wonFinal) {
  const c = game.career;
  c.history.push({ season: c.season, div: c.div, pos: C.sortedTable(c.table).findIndex(r => r.id === 'me') + 1 });
  if (c.season >= 2 && c.debt > 0) {
    c.debt = Math.round(c.debt * 1.1);
    await story('debtWarning');
  }
  c.season++;
  if (promote) c.div = Math.min(2, c.div + 1);
  c.player.fatigue = 0;
  C.startSeason(c);
  C.save(c);
  if (promote) await story('promoted', wonFinal);
  else await ui.dialogue([{ place: 'Season ' + c.season, text: `A new season in the ${C.DIVISIONS[c.div].name}. New faces, same rules: top two go through.`, shot: 'wide' }]);
  hub();
}

// ---------------------------------------------------------------------
// Quick fight
// ---------------------------------------------------------------------
function quickFightScreen() {
  const all = [];
  for (let i = 0; i < 21; i++) all.push(C.makeFighter(i, Math.floor(i / 7)));
  ui.modal(`<div class="kicker">Exhibition</div><h2>Quick Fight</h2><div class="cards">Pick an opponent. You fight as a seasoned barman (all stats 62). 3 rounds.</div>
    <div class="choice-grid">${all.map((f, i) => `<div class="choice" data-a="f" data-v="${i}"><div class="t">${f.name}</div><div class="d">“${f.nick}” · ${STYLES[f.style].label}</div><div class="g">${['Cellar', 'Northern', 'National'][Math.floor(i / 7)]} · OVR ${Math.round(C.rating(f))}</div></div>`).join('')}</div>`, {
    f: async i => {
      ui.closeModal();
      const opp = all[+i];
      const p = { name: (game.career && game.career.player.name) || 'The Barman', stats: { power: 62, speed: 62, stamina: 62, defence: 62, chin: 62 }, look: (game.career && game.career.player.look) || defaultLook() };
      const theme = ['cellar', 'mill', 'hall'][Math.floor(+i / 7)];
      const res = await runFight({ venue: venue(theme), opp, rounds: 3, roundTime: 60, mode: 'quick', playerOverride: p });
      await toPub('title');
      const won = res.winner === 'player';
      ui.toast(won ? `You beat ${opp.name} (${res.method}).` : res.winner === 'draw' ? 'A draw.' : `${opp.name} beat you (${res.method}).`, won, 4000);
      titleScreen();
    },
  });
}

// Debug hooks (console): __dbg.quick(7) starts a quick fight vs roster #7
window.__dbg = {
  C, story, hub, venue, runFight, shot,
  quick: (i = 0) => {
    const opp = C.makeFighter(i, Math.floor(i / 7));
    const p = { name: 'The Barman', stats: { power: 62, speed: 62, stamina: 62, defence: 62, chin: 62 }, look: defaultLook() };
    return runFight({ venue: venue(['cellar', 'mill', 'hall'][Math.floor(i / 7)]), opp, rounds: 3, roundTime: 60, mode: 'quick', playerOverride: p });
  },
};

boot();
