// Career / season data, league tables, fixture generation and AI-vs-AI simulation.

export const DIVISIONS = [
  { id: 0, name: 'The Cellar League', short: 'Cellar League', venue: 'cellar', rounds: 3, roundTime: 60, purse: 250, finalPurse: 1000, base: 32, spread: 16 },
  { id: 1, name: 'The Northern Circuit', short: 'Northern Circuit', venue: 'mill', rounds: 4, roundTime: 60, purse: 700, finalPurse: 3000, base: 50, spread: 16 },
  { id: 2, name: 'National Bare Knuckle Championship', short: 'National', venue: 'hall', rounds: 5, roundTime: 60, purse: 1800, finalPurse: 10000, base: 64, spread: 18 },
];

const SKINS = ['#e3b494', '#d9a07c', '#c48a68', '#a86f4f', '#8a573a', '#6b3f28', '#4e2c1c', '#f0c8a8'];
const HAIRS = ['#1a120c', '#2a1a10', '#4a3020', '#6b4a2a', '#b08850', '#8a2a10', '#777', '#d8d0c0'];
const TROUSERS = ['#1a1a1e', '#2a2018', '#1b2330', '#3a1a1a', '#2c2c2c', '#20301f', '#4a3c28', '#111'];
const STYLES_LIST = ['brawler', 'boxer', 'counter', 'swarmer', 'slugger'];

// [name, nick, hometown, style]
const ROSTER = [
  // Cellar League
  ['Gaz Pickering', 'The Forklift', 'Wigan', 'brawler'],
  ['Shane Moss', 'Mossy', 'Bolton', 'boxer'],
  ['Kev Doherty', 'The Plasterer', 'Leigh', 'slugger'],
  ['Dean Ashworth', 'Two Pints', 'Bury', 'swarmer'],
  ['Lee Brannigan', 'The Bin Lid', 'Rochdale', 'counter'],
  ['Carl Whitlow', 'Cabbage', 'Atherton', 'brawler'],
  ['Tomasz Nowak', 'The Pole', 'Salford', 'boxer'],
  // Northern Circuit
  ['Ryan Halloran', 'Hurricane', 'Liverpool', 'swarmer'],
  ['Marcus Bell', 'The Bailiff', 'Leeds', 'slugger'],
  ['Jonjo Keane', 'Silk', 'Preston', 'counter'],
  ['Wes Tolland', 'The Docker', 'Hull', 'brawler'],
  ['Ade Okafor', 'Ironside', 'Moss Side', 'boxer'],
  ['Craig Fenwick', 'Geordie', 'Gateshead', 'swarmer'],
  ['Billy Rourke', 'Mad Dog', 'Blackburn', 'brawler'],
  // National
  ['Connor Flynn', 'The Traveller', 'Cork', 'boxer'],
  ['Danny Stokes', 'The Brickie', 'Stoke', 'slugger'],
  ['Jamal Reid', 'Lights Out', 'Birmingham', 'counter'],
  ['Scott McRae', 'The Highlander', 'Glasgow', 'brawler'],
  ['Lewis Price', 'The Valleys', 'Merthyr', 'swarmer'],
  ['Terry Gunn', 'Shotgun', 'Bermondsey', 'slugger'],
  ['Vince Doyle', 'The Butcher', 'Ancoats', 'counter'],
];

function seeded(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

export function makeFighter(idx, div, rand = Math.random, boost = 0) {
  const [name, nick, town, style] = ROSTER[idx];
  const d = DIVISIONS[div];
  const r = seeded(idx * 977 + 13);
  const base = d.base + boost;
  const sp = d.spread;
  const tilt = { brawler: { power: 8, chin: 6, speed: -6, defence: -6 }, boxer: { speed: 7, defence: 6, power: -4 }, counter: { defence: 9, speed: 3, stamina: -3, power: -2 }, swarmer: { stamina: 9, speed: 4, defence: -6 }, slugger: { power: 12, chin: 3, speed: -8, stamina: -4 } }[style];
  const stat = k => Math.round(Math.min(97, Math.max(18, base + (r() - 0.35) * sp + (tilt[k] || 0))));
  let stats = { power: stat('power'), speed: stat('speed'), stamina: stat('stamina'), defence: stat('defence'), chin: stat('chin') };
  if (name === 'Vince Doyle') stats = { power: 88, speed: 82, stamina: 84, defence: 88, chin: 90 };
  const look = {
    skin: SKINS[(r() * SKINS.length) | 0], hair: HAIRS[(r() * HAIRS.length) | 0],
    hairStyle: ['short', 'buzz', 'bald', 'mohawk', 'slick'][(r() * 5) | 0],
    beard: r() < 0.4, trousers: TROUSERS[(r() * TROUSERS.length) | 0],
    build: 0.92 + r() * 0.2, height: 0.95 + r() * 0.09,
  };
  if (name === 'Vince Doyle') Object.assign(look, { skin: '#d9a07c', hair: '#111', hairStyle: 'bald', beard: true, trousers: '#5a0a12', build: 1.12, height: 1.04 });
  if (name === 'Gaz Pickering') Object.assign(look, { build: 1.16, hairStyle: 'buzz', beard: true });
  return { id: 'f' + idx, idx, name, nick, town, style, stats, look };
}

export function rosterForDivision(div, season) {
  // 7 opponents for the division. In later seasons we re-roll from all rosters and scale up.
  const ranges = [[0, 7], [7, 14], [14, 21]];
  const [a, b] = ranges[div];
  const list = [];
  for (let i = a; i < b; i++) list.push(makeFighter(i, div, Math.random, Math.max(0, season - 3) * 3));
  return list;
}

export function rating(f) {
  const s = f.stats;
  return s.power * 0.24 + s.speed * 0.18 + s.stamina * 0.18 + s.defence * 0.2 + s.chin * 0.2;
}

// Circle-method round robin: 8 entrants -> 7 weeks x 4 fights
export function roundRobin(ids) {
  const n = ids.length, arr = ids.slice(), weeks = [];
  for (let w = 0; w < n - 1; w++) {
    const fx = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i], b = arr[n - 1 - i];
      fx.push(w % 2 ? [b, a] : [a, b]);
    }
    weeks.push(fx);
    arr.splice(1, 0, arr.pop());
  }
  return weeks;
}

export function simFight(a, b, div) {
  const ra = rating(a) + (Math.random() - 0.5) * 14, rb = rating(b) + (Math.random() - 0.5) * 14;
  const diff = ra - rb;
  const rounds = DIVISIONS[div].rounds;
  if (Math.abs(diff) < 1.2 && Math.random() < 0.5) return { winner: null, method: 'DRAW', round: rounds };
  const w = diff > 0 ? a : b, l = diff > 0 ? b : a;
  const koChance = 0.25 + Math.min(0.5, Math.abs(diff) / 30) + (w.stats.power - l.stats.chin) / 200;
  const ko = Math.random() < koChance;
  return { winner: w.id, loser: l.id, method: ko ? (Math.random() < 0.7 ? 'KO' : 'TKO') : 'PTS', round: ko ? 1 + ((Math.random() * rounds) | 0) : rounds };
}

export function newTable(ids) {
  const t = {};
  ids.forEach(id => t[id] = { p: 0, w: 0, d: 0, l: 0, ko: 0, pts: 0 });
  return t;
}

export function applyResult(table, aId, bId, res) {
  const A = table[aId], B = table[bId];
  A.p++; B.p++;
  if (!res.winner) { A.d++; B.d++; A.pts++; B.pts++; return; }
  const W = table[res.winner], L = res.winner === aId ? B : A;
  W.w++; W.pts += 3; L.l++;
  if (res.method === 'KO' || res.method === 'TKO') { W.ko++; W.pts += 1; }
}

export function sortedTable(table) {
  return Object.entries(table).sort((x, y) => y[1].pts - x[1].pts || y[1].ko - x[1].ko || y[1].w - x[1].w || x[1].l - y[1].l).map(([id, r]) => ({ id, ...r }));
}

// Player stats progression helpers
export const TRAINING = {
  bag: { name: 'Heavy Bag', stat: 'power', desc: 'Rhythm combos on Terry\'s old bag. Builds power.', icon: '🥊', fat: 16 },
  skip: { name: 'Skipping', stat: 'speed', desc: 'Keep the rope turning. Builds hand and foot speed.', icon: '⏱', fat: 12 },
  road: { name: 'Roadwork', stat: 'stamina', desc: 'Five miles round the canal at dawn. Builds stamina.', icon: '🏃', fat: 18 },
  spar: { name: 'Sparring', stat: 'defence', desc: 'Rounds with Terry\'s nephew. Builds defence and chin.', icon: '🛡', fat: 20 },
};

export const SHOP = [
  { id: 'wraps', name: 'Proper Hand Wraps', price: 150, desc: 'Cotton wraps, taped tight. +3 Power permanently.', once: true },
  { id: 'rope', name: 'Leather Skipping Rope', price: 90, desc: 'Skipping gains +30%.', once: true },
  { id: 'trainers', name: 'Decent Running Shoes', price: 120, desc: 'Roadwork gains +30%.', once: true },
  { id: 'weights', name: 'Second-hand Weights', price: 280, desc: 'Heavy bag gains +30%.', once: true },
  { id: 'gumshield', name: 'Neck Harness', price: 200, desc: 'Sparring also builds chin +50%.', once: true },
  { id: 'physio', name: 'Physio (Bev on Dale St)', price: 80, desc: 'Clears 50 fatigue.' },
  { id: 'steak', name: 'Steak & Chips', price: 35, desc: '+12 stamina cap in your next fight.' },
];

export function freshCareer(name, nick, look) {
  return {
    v: 1,
    player: {
      id: 'me', name, nick, look,
      stats: { power: 38, speed: 40, stamina: 40, defence: 34, chin: 42 },
      fatigue: 0, money: 120, rep: 0, record: { w: 0, l: 0, d: 0, ko: 0 },
      items: {}, stamBuff: 0,
    },
    season: 1, div: 0, week: 0, slots: [], phase: 'preseason',
    flags: {}, debt: 6000, paid: 0, titles: [], history: [],
  };
}

export function startSeason(c) {
  const opps = rosterForDivision(c.div, c.season);
  // later seasons in the same division: opponents improve a bit
  const repeat = c.history.filter(h => h.div === c.div).length;
  opps.forEach(o => Object.keys(o.stats).forEach(k => o.stats[k] = Math.min(97, o.stats[k] + repeat * 3)));
  c.opps = opps;
  const ids = ['me', ...opps.map(o => o.id)];
  // shuffle for fixture variety
  for (let i = ids.length - 1; i > 1; i--) { const j = 1 + ((Math.random() * i) | 0); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  c.fixtures = roundRobin(ids);
  c.table = newTable(ids);
  c.results = [];
  c.week = 0; c.slots = []; c.phase = 'week';
  return c;
}

export function getFighter(c, id) { return id === 'me' ? c.player : c.opps.find(o => o.id === id); }

export function playerFixture(c, week = c.week) {
  const fx = c.fixtures[week];
  if (!fx) return null;
  const m = fx.find(([a, b]) => a === 'me' || b === 'me');
  return m[0] === 'me' ? m[1] : m[0];
}

const KEY = 'lastorders.save.v1';
export function save(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); return true; } catch { return false; } }
export function load() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch { return null; } }
export function wipe() { try { localStorage.removeItem(KEY); } catch { } }
