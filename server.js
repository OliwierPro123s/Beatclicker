const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const TICK_RATE = 30;
const BROADCAST_RATE = 18;
const MAP_HALF = 82;
const PLAYER_RADIUS = 0.65;
const HIDE_SAFE_MS = 30_000;
const BLIND_MS = 30_000;
const ABILITY_COOLDOWN_MS = 18_000;

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(__dirname));
app.get('/health', (_req, res) => res.json({ ok: true }));

const SEEKER_ROLES = [
  { name: 'Tracker', ability: 'Sonar Ping', desc: 'Krótki ping pokazuje najbliższych chowających w dużym promieniu.', speed: 5.15, vision: 42, catchBonus: 0.55, abilityType: 'reveal', abilityPower: 14 },
  { name: 'Radar', ability: 'Radar Sweep', desc: 'Silny skan odsłania sylwetki nawet za przeszkodami przez chwilę.', speed: 4.95, vision: 38, catchBonus: 0.35, abilityType: 'reveal', abilityPower: 18 },
  { name: 'Hunter', ability: 'Burst Dash', desc: 'Mocny zryw do przodu, idealny do doganiania celu.', speed: 5.7, vision: 30, catchBonus: 0.25, abilityType: 'dash', abilityPower: 8 },
  { name: 'Sentinel', ability: 'Guard Shield', desc: 'Zwiększa zasięg łapania i daje stabilny pościg.', speed: 5.05, vision: 34, catchBonus: 0.65, abilityType: 'shield', abilityPower: 8 },
  { name: 'Warden', ability: 'Lockdown', desc: 'Na krótko spowalnia wszystkich chowających w pobliżu.', speed: 4.9, vision: 36, catchBonus: 0.45, abilityType: 'slow', abilityPower: 12 },
  { name: 'Echo', ability: 'Echo Trail', desc: 'Pokazuje ślady ruchu i odczyt najbliższego kierunku.', speed: 5.45, vision: 33, catchBonus: 0.3, abilityType: 'trail', abilityPower: 10 },
  { name: 'Analyst', ability: 'Scan Cone', desc: 'Wąski, bardzo mocny skan wskazuje najbliższy cel.', speed: 5.2, vision: 40, catchBonus: 0.4, abilityType: 'reveal', abilityPower: 12 },
  { name: 'Snare Master', ability: 'Snare Net', desc: 'Rozstawia pułapkę, która spowalnia pierwszego chowającego.', speed: 4.8, vision: 31, catchBonus: 0.5, abilityType: 'trap', abilityPower: 9 },
  { name: 'Night Watch', ability: 'Night Sight', desc: 'Przenika noc i daje świetną widoczność na dłuższym dystansie.', speed: 5.1, vision: 46, catchBonus: 0.25, abilityType: 'vision', abilityPower: 14 },
  { name: 'Pursuer', ability: 'Sprint Surge', desc: 'Błyskawiczny sprint po linii prostej.', speed: 5.95, vision: 29, catchBonus: 0.25, abilityType: 'speed', abilityPower: 9 },
  { name: 'Pathfinder', ability: 'Shortcut Mark', desc: 'Płynniejszy ruch i lepsze przeskakiwanie zakrętów.', speed: 5.35, vision: 33, catchBonus: 0.35, abilityType: 'speed', abilityPower: 10 },
  { name: 'Stalker', ability: 'Silent Step', desc: 'Cichy pościg z lepszym wyczuciem dystansu.', speed: 5.55, vision: 35, catchBonus: 0.35, abilityType: 'cloak', abilityPower: 10 },
];

const HIDER_ROLES = [
  { name: 'Ghost', ability: 'Fade', desc: 'Na chwilę stajesz się bardzo trudny do zauważenia.', speed: 5.05, vision: 31, stealth: 24, abilityType: 'cloak', abilityPower: 9 },
  { name: 'Sprinter', ability: 'Sprint Burst', desc: 'Krótki, szybki zryw do ucieczki z opresji.', speed: 6.0, vision: 25, stealth: 18, abilityType: 'speed', abilityPower: 8 },
  { name: 'Blink', ability: 'Blink Step', desc: 'Teleportuje cię trochę do przodu, jeśli droga jest wolna.', speed: 5.55, vision: 24, stealth: 18, abilityType: 'blink', abilityPower: 7 },
  { name: 'Decoy', ability: 'Decoy Clone', desc: 'Tworzy fałszywy trop, który myli szukających.', speed: 5.15, vision: 25, stealth: 19, abilityType: 'decoy', abilityPower: 10 },
  { name: 'Smoke', ability: 'Smoke Bomb', desc: 'Kładzie chmurę dymu i utrudnia obserwację.', speed: 5.0, vision: 26, stealth: 20, abilityType: 'smoke', abilityPower: 10 },
  { name: 'Shade', ability: 'Shadow Drift', desc: 'Lepsze znikanie przy ścianach i budynkach.', speed: 5.2, vision: 28, stealth: 22, abilityType: 'cloak', abilityPower: 10 },
  { name: 'Acrobat', ability: 'Leap', desc: 'Szybki skok do przodu, przydatny przy przeszkodach.', speed: 5.3, vision: 25, stealth: 20, abilityType: 'dash', abilityPower: 7 },
  { name: 'Burrower', ability: 'Burrow', desc: 'Na krótko przechodzisz przez przeszkody.', speed: 5.1, vision: 26, stealth: 21, abilityType: 'phase', abilityPower: 6 },
  { name: 'Mimic', ability: 'Blend In', desc: 'Stajesz się mniej widoczny, gdy stoisz blisko zabudowań.', speed: 5.0, vision: 28, stealth: 24, abilityType: 'blend', abilityPower: 10 },
  { name: 'Runner', ability: 'Marathon', desc: 'Dłuższy i mocny sprint na otwartej przestrzeni.', speed: 5.85, vision: 24, stealth: 18, abilityType: 'speed', abilityPower: 12 },
  { name: 'Quietfoot', ability: 'Silence', desc: 'Prawie znika z pola widzenia przy małym ruchu.', speed: 4.95, vision: 29, stealth: 26, abilityType: 'stealth', abilityPower: 12 },
  { name: 'Vanisher', ability: 'Vanish', desc: 'Na krótko wymazuje cię z dalekiego zasięgu.', speed: 5.25, vision: 25, stealth: 17, abilityType: 'vanish', abilityPower: 8 },
];

const ALL_ROLES = { seekers: SEEKER_ROLES, hiders: HIDER_ROLES };

const obstacleDefs = [
  // 14 zwykłych budynków
  { id: 'h1', kind: 'house', x: -58, z: -50, w: 11, d: 10, h: 5.0 },
  { id: 'h2', kind: 'house', x: -36, z: -54, w: 10, d: 10, h: 5.2 },
  { id: 'h3', kind: 'house', x: -14, z: -55, w: 9, d: 9, h: 4.8 },
  { id: 'h4', kind: 'house', x: 8, z: -53, w: 10, d: 9, h: 5.1 },
  { id: 'h5', kind: 'house', x: 33, z: -52, w: 11, d: 10, h: 5.0 },
  { id: 'h6', kind: 'house', x: 56, z: -49, w: 10, d: 10, h: 4.9 },
  { id: 'h7', kind: 'house', x: -60, z: 0, w: 10, d: 10, h: 5.0 },
  { id: 'h8', kind: 'house', x: -38, z: 0, w: 9, d: 9, h: 4.7 },
  { id: 'h9', kind: 'house', x: -16, z: 2, w: 10, d: 10, h: 5.1 },
  { id: 'h10', kind: 'house', x: 10, z: 1, w: 10, d: 9, h: 5.0 },
  { id: 'h11', kind: 'house', x: 34, z: 0, w: 9, d: 9, h: 4.9 },
  { id: 'h12', kind: 'house', x: 58, z: 1, w: 10, d: 10, h: 5.2 },
  { id: 'h13', kind: 'house', x: -48, z: 53, w: 10, d: 9, h: 5.0 },
  { id: 'h14', kind: 'house', x: -22, z: 54, w: 10, d: 10, h: 4.9 },

  // 5 mega budynków
  { id: 'm1', kind: 'mega', x: 8, z: 55, w: 18, d: 14, h: 10.5 },
  { id: 'm2', kind: 'mega', x: 36, z: 55, w: 18, d: 14, h: 11.0 },
  { id: 'm3', kind: 'mega', x: 62, z: 52, w: 16, d: 16, h: 12.5 },
  { id: 'm4', kind: 'mega', x: 0, z: -30, w: 20, d: 16, h: 11.5 },
  { id: 'm5', kind: 'mega', x: -62, z: 30, w: 18, d: 16, h: 12.2 },

  // jaskinie / schowki
  { id: 'c1', kind: 'cave', x: -72, z: 22, w: 12, d: 10, h: 4.4 },
  { id: 'c2', kind: 'cave', x: -8, z: -74, w: 14, d: 10, h: 4.8 },
  { id: 'c3', kind: 'cave', x: 60, z: -72, w: 12, d: 10, h: 4.7 },

  // dodatkowe przeszkody / schowki
  { id: 'p1', kind: 'crate', x: -74, z: -22, w: 5.5, d: 5.5, h: 3.0 },
  { id: 'p2', kind: 'crate', x: 74, z: -18, w: 5.5, d: 5.5, h: 3.0 },
  { id: 'p3', kind: 'tree', x: -28, z: 24, w: 4, d: 4, h: 4.5 },
  { id: 'p4', kind: 'tree', x: 27, z: 24, w: 4, d: 4, h: 4.5 },
  { id: 'p5', kind: 'wall', x: -2, z: 18, w: 24, d: 3.2, h: 2.0 },
  { id: 'p6', kind: 'wall', x: 2, z: -18, w: 24, d: 3.2, h: 2.0 },
];

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function dist2D(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.hypot(dx, dz);
}

function shuffle(arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function makeDeck(side) {
  const source = side === 'seeker' ? SEEKER_ROLES : HIDER_ROLES;
  return shuffle(source.map((r) => r.name));
}

function getRole(side, name) {
  const list = side === 'seeker' ? SEEKER_ROLES : HIDER_ROLES;
  return list.find((r) => r.name === name) || list[0];
}

function nextRoleName(state, side) {
  if (!state.roleDecks[side].length) {
    state.roleDecks[side] = makeDeck(side);
  }
  return state.roleDecks[side].pop();
}

function chooseSpawn(index) {
  const spots = [
    { x: -68, z: -68 }, { x: 68, z: -68 }, { x: -68, z: 68 }, { x: 68, z: 68 },
    { x: 0, z: 0 }, { x: -10, z: 48 }, { x: 10, z: -48 }, { x: -48, z: 10 },
    { x: 48, z: -10 }, { x: 0, z: 72 }, { x: 72, z: 0 }, { x: -72, z: 0 },
  ];
  const s = spots[index % spots.length];
  return { x: s.x + (Math.random() * 4 - 2), z: s.z + (Math.random() * 4 - 2) };
}

function circleRectCollision(cx, cz, radius, rect) {
  const halfW = rect.w / 2;
  const halfD = rect.d / 2;
  const nearestX = clamp(cx, rect.x - halfW, rect.x + halfW);
  const nearestZ = clamp(cz, rect.z - halfD, rect.z + halfD);
  const dx = cx - nearestX;
  const dz = cz - nearestZ;
  return dx * dx + dz * dz < radius * radius;
}

function collides(x, z, radius = PLAYER_RADIUS) {
  if (x < -MAP_HALF || x > MAP_HALF || z < -MAP_HALF || z > MAP_HALF) return true;
  return obstacleDefs.some((ob) => circleRectCollision(x, z, radius, ob));
}

function activePlayers(state) {
  return [...state.players.values()].filter((p) => p.joined && !p.spectator);
}

function pushAnnouncement(state, text) {
  state.announcements.unshift({ text, at: Date.now() });
  state.announcements = state.announcements.slice(0, 8);
}

function setRole(state, player, side) {
  const roleName = nextRoleName(state, side);
  const role = getRole(side, roleName);
  player.side = side;
  player.roleName = role.name;
  player.roleDesc = role.desc;
  player.abilityName = role.ability;
  player.speed = role.speed;
  player.vision = role.vision;
  player.catchBonus = role.catchBonus || 0;
  player.stealth = role.stealth || 0;
  player.abilityType = role.abilityType;
  player.abilityPower = role.abilityPower;
  player.color = side === 'seeker' ? '#ff7b7b' : '#67b7ff';
  player.abilityReadyAt = 0;
  player.effectUntil = 0;
}

function resetPlayerForLobby(p) {
  p.side = null;
  p.roleName = null;
  p.roleDesc = null;
  p.abilityName = null;
  p.speed = 0;
  p.vision = 0;
  p.catchBonus = 0;
  p.stealth = 0;
  p.abilityType = null;
  p.abilityPower = 0;
  p.abilityReadyAt = 0;
  p.effectUntil = 0;
  p.blindUntil = 0;
  p.safeUntil = 0;
  p.ghostUntil = 0;
  p.speedBoostUntil = 0;
  p.trailUntil = 0;
  p.shieldUntil = 0;
  p.phaseUntil = 0;
  p.vanishUntil = 0;
  p.decoyUntil = 0;
  p.smokeUntil = 0;
  p.lockedUntil = 0;
  p.lastTaggedAt = 0;
  p.vx = 0;
  p.vz = 0;
}

function resetToLobby(state, reason = 'Czekam na 2 graczy...') {
  state.running = false;
  state.startedAt = 0;
  state.round = 0;
  state.message = reason;
  state.traps = [];
  state.decoys = [];
  state.smokes = [];
  for (const p of state.players.values()) {
    resetPlayerForLobby(p);
  }
  pushAnnouncement(state, 'Gra wróciła do lobby.');
}

function startGame(state) {
  const players = activePlayers(state);
  if (players.length < 2) return;

  state.running = true;
  state.startedAt = Date.now();
  state.round += 1;
  state.traps = [];
  state.decoys = [];
  state.smokes = [];
  state.message = `Runda ${state.round} rozpoczęta!`;

  const shuffled = shuffle(players);
  const firstSeeker = shuffled[0];

  shuffled.forEach((p, index) => {
    const spawn = chooseSpawn(index);
    p.x = spawn.x;
    p.z = spawn.z;
    p.vx = 0;
    p.vz = 0;
    p.safeUntil = 0;
    p.blindUntil = 0;
    p.joinedAt = Date.now();
    resetPlayerForLobby(p);
    p.x = spawn.x;
    p.z = spawn.z;
    if (p === firstSeeker) {
      setRole(state, p, 'seeker');
    } else {
      setRole(state, p, 'hider');
    }
  });

  pushAnnouncement(state, `${firstSeeker.name} zaczyna jako szukający.`);
}

function tryStartGame(state) {
  if (!state.running && activePlayers(state).length >= 2) {
    startGame(state);
  }
}

function ensureLobbyIfTooFew(state) {
  if (state.running && activePlayers(state).length < 2) {
    resetToLobby(state, 'Za mało graczy. Czekam na kolejnych...');
  }
}

function movePlayer(player, dt, state) {
  const input = player.keys || {};
  const hasInput = input.w || input.a || input.s || input.d;
  const yaw = Number.isFinite(player.yaw) ? player.yaw : 0;

  let forward = 0;
  let strafe = 0;
  if (input.w) forward += 1;
  if (input.s) forward -= 1;
  if (input.d) strafe += 1;
  if (input.a) strafe -= 1;

  let dx = 0;
  let dz = 0;
  if (hasInput) {
    // W = do przodu, S = do tyłu (poprawione pod standardowy widok FP)
    dx = forward * Math.sin(yaw) + strafe * Math.cos(yaw);
    dz = -forward * Math.cos(yaw) + strafe * Math.sin(yaw);
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
  }

  const sprint = input.shift ? 1.18 : 1;
  let speed = player.speed || 0;

  if (Date.now() < (player.speedBoostUntil || 0)) speed *= 1.7;
  if (Date.now() < (player.phaseUntil || 0)) speed *= 1.1;
  if (Date.now() < (player.lockedUntil || 0)) speed *= 0.65;

  const targetVX = dx * speed * sprint;
  const targetVZ = dz * speed * sprint;
  const accel = hasInput ? 13 : 18;
  const friction = hasInput ? 10 : 16;

  player.vx += (targetVX - (player.vx || 0)) * clamp(accel * dt, 0, 1);
  player.vz += (targetVZ - (player.vz || 0)) * clamp(accel * dt, 0, 1);

  if (!hasInput) {
    player.vx *= Math.max(0, 1 - friction * dt * 0.08);
    player.vz *= Math.max(0, 1 - friction * dt * 0.08);
  }

  const nextX = player.x + player.vx * dt;
  const nextZ = player.z + player.vz * dt;
  const phasing = Date.now() < (player.phaseUntil || 0);

  const canX = phasing || !collides(nextX, player.z);
  const canZ = phasing || !collides(player.x, nextZ);

  if (canX) player.x = nextX; else player.vx *= 0.12;
  if (canZ) player.z = nextZ; else player.vz *= 0.12;

  player.x = clamp(player.x, -MAP_HALF + 1, MAP_HALF - 1);
  player.z = clamp(player.z, -MAP_HALF + 1, MAP_HALF - 1);
}

function isCatchable(target, now) {
  return target.side === 'hider' && now >= (target.safeUntil || 0);
}

function spawnEntity(list, kind, x, z, expiresAt, ownerId) {
  list.push({ id: randomId(), kind, x, z, expiresAt, ownerId });
}

function useAbility(state, player) {
  const now = Date.now();
  if (!state.running || !player.side || now < (player.abilityReadyAt || 0)) return;

  player.abilityReadyAt = now + ABILITY_COOLDOWN_MS;

  const forwardX = Math.sin(player.yaw || 0);
  const forwardZ = -Math.cos(player.yaw || 0);
  const pushTo = (distance) => {
    const nx = player.x + forwardX * distance;
    const nz = player.z + forwardZ * distance;
    if (!collides(nx, nz, 0.42)) {
      player.x = clamp(nx, -MAP_HALF + 1, MAP_HALF - 1);
      player.z = clamp(nz, -MAP_HALF + 1, MAP_HALF - 1);
    }
  };

  if (player.abilityType === 'reveal') {
    state.revealUntil = now + (player.abilityPower || 10) * 500;
    pushAnnouncement(state, `${player.name} użył ${player.abilityName}.`);
    return;
  }

  if (player.abilityType === 'dash') {
    pushTo(6.5);
    player.speedBoostUntil = now + 4500;
    pushAnnouncement(state, `${player.name} zrobił zryw.`);
    return;
  }

  if (player.abilityType === 'shield') {
    player.shieldUntil = now + 8500;
    player.catchBonus = (player.catchBonus || 0) + 0.4;
    player.effectUntil = now + 8500;
    pushAnnouncement(state, `${player.name} aktywował tarczę.`);
    return;
  }

  if (player.abilityType === 'slow') {
    for (const other of state.players.values()) {
      if (other.joined && !other.spectator && other.side === 'hider') {
        if (dist2D(player, other) <= 20) other.lockedUntil = now + 4500;
      }
    }
    pushAnnouncement(state, `${player.name} spowolnił pobliskich chowających.`);
    return;
  }

  if (player.abilityType === 'trail') {
    state.trailUntil = now + 7000;
    player.speedBoostUntil = now + 3500;
    pushAnnouncement(state, `${player.name} uruchomił echo tropów.`);
    return;
  }

  if (player.abilityType === 'trap') {
    spawnEntity(state.traps, 'trap', player.x + forwardX * 2.2, player.z + forwardZ * 2.2, now + 25_000, player.id);
    pushAnnouncement(state, `${player.name} postawił pułapkę.`);
    return;
  }

  if (player.abilityType === 'vision') {
    player.ghostUntil = now + 6500;
    player.speedBoostUntil = now + 3500;
    pushAnnouncement(state, `${player.name} widzi wyraźniej.`);
    return;
  }

  if (player.abilityType === 'speed') {
    player.speedBoostUntil = now + (player.abilityPower || 8) * 1000;
    pushAnnouncement(state, `${player.name} włączył sprint.`);
    return;
  }

  if (player.abilityType === 'cloak') {
    player.vanishUntil = now + 7000;
    player.speedBoostUntil = now + 2500;
    pushAnnouncement(state, `${player.name} zniknął z daleka.`);
    return;
  }

  if (player.abilityType === 'blink') {
    pushTo(8.5);
    player.vanishUntil = now + 3000;
    pushAnnouncement(state, `${player.name} przeskoczył do przodu.`);
    return;
  }

  if (player.abilityType === 'decoy') {
    spawnEntity(state.decoys, 'decoy', player.x, player.z, now + 12_000, player.id);
    pushAnnouncement(state, `${player.name} zostawił fałszywy trop.`);
    return;
  }

  if (player.abilityType === 'smoke') {
    spawnEntity(state.smokes, 'smoke', player.x, player.z, now + 10_000, player.id);
    player.vanishUntil = now + 5000;
    pushAnnouncement(state, `${player.name} rzucił dym.`);
    return;
  }

  if (player.abilityType === 'phase') {
    player.phaseUntil = now + 5500;
    pushAnnouncement(state, `${player.name} wszedł w fazę.`);
    return;
  }

  if (player.abilityType === 'blend') {
    player.ghostUntil = now + 8000;
    player.speedBoostUntil = now + 4000;
    pushAnnouncement(state, `${player.name} zlał się z otoczeniem.`);
    return;
  }

  if (player.abilityType === 'stealth') {
    player.vanishUntil = now + 8500;
    player.lockedUntil = now + 1500;
    pushAnnouncement(state, `${player.name} aktywował ciszę.`);
    return;
  }

  if (player.abilityType === 'vanish') {
    player.vanishUntil = now + 9000;
    player.speedBoostUntil = now + 2000;
    pushAnnouncement(state, `${player.name} wyparował z pola widzenia.`);
    return;
  }
}

function swapRoles(state, seeker, hider) {
  const now = Date.now();
  const oldSeekerName = seeker.name;
  const oldHiderName = hider.name;

  setRole(state, hider, 'seeker');
  hider.blindUntil = now + BLIND_MS;
  hider.safeUntil = 0;
  hider.speedBoostUntil = now + 2500;
  hider.vx = 0;
  hider.vz = 0;

  setRole(state, seeker, 'hider');
  seeker.safeUntil = now + HIDE_SAFE_MS;
  seeker.blindUntil = 0;
  seeker.speedBoostUntil = 0;
  seeker.phaseUntil = 0;
  seeker.vx = 0;
  seeker.vz = 0;

  const spotA = chooseSpawn(Math.floor(Math.random() * 6));
  const spotB = chooseSpawn(Math.floor(Math.random() * 6) + 6);
  hider.x = spotA.x;
  hider.z = spotA.z;
  seeker.x = spotB.x;
  seeker.z = spotB.z;

  pushAnnouncement(state, `${oldSeekerName} został chowającym, a ${oldHiderName} przejął rolę szukającego!`);
}

function catchLogic(state) {
  const now = Date.now();
  const seekers = [...state.players.values()].filter((p) => p.joined && !p.spectator && p.side === 'seeker' && now >= (p.blindUntil || 0));
  const hiders = [...state.players.values()].filter((p) => p.joined && !p.spectator && p.side === 'hider');

  for (const seeker of seekers) {
    for (const hider of hiders) {
      if (!isCatchable(hider, now)) continue;
      const radius = 1.45 + (seeker.catchBonus || 0);
      if (dist2D(seeker, hider) <= radius) {
        if (now - (seeker.lastTaggedAt || 0) > 700 && now - (hider.lastTaggedAt || 0) > 700) {
          seeker.lastTaggedAt = now;
          hider.lastTaggedAt = now;
          swapRoles(state, seeker, hider);
          return;
        }
      }
    }
  }
}

function updateTrapsAndAreaEffects(state) {
  const now = Date.now();
  state.traps = (state.traps || []).filter((t) => t.expiresAt > now);
  state.decoys = (state.decoys || []).filter((t) => t.expiresAt > now);
  state.smokes = (state.smokes || []).filter((t) => t.expiresAt > now);

  for (const trap of state.traps) {
    for (const p of state.players.values()) {
      if (!p.joined || p.spectator || p.side !== 'hider' || p.id === trap.ownerId) continue;
      if (dist2D(p, trap) <= 3.5) {
        p.lockedUntil = Math.max(p.lockedUntil || 0, now + 3000);
        trap.expiresAt = now + 1000;
      }
    }
  }

  for (const smoke of state.smokes) {
    for (const p of state.players.values()) {
      if (!p.joined || p.spectator || p.side !== 'seeker') continue;
      if (dist2D(p, smoke) <= 10) {
        p.smokedUntil = Math.max(p.smokedUntil || 0, now + 1500);
      }
    }
  }
}

function buildState(state) {
  const now = Date.now();
  return {
    running: state.running,
    round: state.round,
    message: state.message,
    startedAt: state.startedAt,
    now,
    revealUntil: state.revealUntil || 0,
    trailUntil: state.trailUntil || 0,
    traps: state.traps,
    decoys: state.decoys,
    smokes: state.smokes,
    obstacles: obstacleDefs,
    roles: ALL_ROLES,
    announcements: state.announcements,
    players: [...state.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      x: p.x,
      z: p.z,
      yaw: p.yaw || 0,
      pitch: p.pitch || 0,
      vx: p.vx || 0,
      vz: p.vz || 0,
      joined: !!p.joined,
      side: p.side,
      roleName: p.roleName,
      roleDesc: p.roleDesc,
      abilityName: p.abilityName,
      abilityType: p.abilityType,
      color: p.color,
      blindUntil: p.blindUntil || 0,
      safeUntil: p.safeUntil || 0,
      abilityReadyAt: p.abilityReadyAt || 0,
      speedBoostUntil: p.speedBoostUntil || 0,
      ghostUntil: p.ghostUntil || 0,
      trailUntil: p.trailUntil || 0,
      shieldUntil: p.shieldUntil || 0,
      phaseUntil: p.phaseUntil || 0,
      vanishUntil: p.vanishUntil || 0,
      decoyUntil: p.decoyUntil || 0,
      smokeUntil: p.smokeUntil || 0,
      lockedUntil: p.lockedUntil || 0,
      smokedUntil: p.smokedUntil || 0,
      spectator: !!p.spectator,
      connected: true,
    })),
  };
}

function broadcast(state) {
  const payload = JSON.stringify({ type: 'state', state: buildState(state) });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}

const state = {
  running: false,
  startedAt: 0,
  round: 0,
  message: 'Czekam na 2 graczy...',
  roleDecks: { seeker: makeDeck('seeker'), hider: makeDeck('hider') },
  players: new Map(),
  announcements: [],
  traps: [],
  decoys: [],
  smokes: [],
  revealUntil: 0,
  trailUntil: 0,
};

wss.on('connection', (ws) => {
  const id = randomId();
  const player = {
    id,
    ws,
    name: `Gracz_${id.slice(0, 4)}`,
    joined: false,
    x: 0,
    z: 0,
    vx: 0,
    vz: 0,
    yaw: 0,
    pitch: 0,
    side: null,
    roleName: null,
    roleDesc: null,
    abilityName: null,
    abilityType: null,
    speed: 0,
    vision: 0,
    catchBonus: 0,
    stealth: 0,
    abilityPower: 0,
    abilityReadyAt: 0,
    effectUntil: 0,
    blindUntil: 0,
    safeUntil: 0,
    speedBoostUntil: 0,
    ghostUntil: 0,
    trailUntil: 0,
    shieldUntil: 0,
    phaseUntil: 0,
    vanishUntil: 0,
    decoyUntil: 0,
    smokeUntil: 0,
    lockedUntil: 0,
    smokedUntil: 0,
    lastTaggedAt: 0,
    keys: { w: false, a: false, s: false, d: false, shift: false },
    spectator: false,
    color: '#94a3b8',
  };

  state.players.set(id, player);

  ws.send(JSON.stringify({
    type: 'welcome',
    id,
    message: state.message,
    roles: ALL_ROLES,
  }));

  pushAnnouncement(state, `${player.name} połączył się.`);

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === 'join') {
      const clean = String(msg.name || '').trim().slice(0, 20);
      if (clean) player.name = clean;
      player.joined = true;
      const spawn = chooseSpawn(Math.floor(Math.random() * 12));
      player.x = spawn.x;
      player.z = spawn.z;
      player.vx = 0;
      player.vz = 0;
      pushAnnouncement(state, `${player.name} dołączył do gry.`);
      ws.send(JSON.stringify({ type: 'joined', id: player.id, name: player.name }));
      tryStartGame(state);
      return;
    }

    if (msg.type === 'input') {
      const keys = msg.keys || {};
      player.keys = {
        w: !!keys.w,
        a: !!keys.a,
        s: !!keys.s,
        d: !!keys.d,
        shift: !!keys.shift,
      };
      if (Number.isFinite(msg.yaw)) player.yaw = msg.yaw;
      if (Number.isFinite(msg.pitch)) player.pitch = msg.pitch;
      return;
    }

    if (msg.type === 'ability') {
      useAbility(state, player);
      return;
    }

    if (msg.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', t: msg.t || Date.now() }));
    }
  });

  ws.on('close', () => {
    state.players.delete(id);
    pushAnnouncement(state, `${player.name} opuścił grę.`);
    ensureLobbyIfTooFew(state);
  });

  tryStartGame(state);
});

setInterval(() => {
  const dt = 1 / TICK_RATE;
  const now = Date.now();

  for (const player of activePlayers(state)) {
    movePlayer(player, dt, state);
    if (now < (player.shieldUntil || 0)) {
      player.catchBonus = Math.max(player.catchBonus || 0, 0.9);
    }
  }

  updateTrapsAndAreaEffects(state);
  catchLogic(state);
  ensureLobbyIfTooFew(state);
  tryStartGame(state);
}, Math.floor(1000 / TICK_RATE));

setInterval(() => {
  broadcast(state);
}, Math.floor(1000 / BROADCAST_RATE));

server.listen(PORT, () => {
  console.log(`Hide and Role działa na porcie ${PORT}`);
});
