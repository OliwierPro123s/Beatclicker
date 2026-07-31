const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const TICK_RATE = 20;
const STATE_BROADCAST_RATE = 10;
const PLAYER_RADIUS = 0.62;
const MAP_HALF = 28;
const CATCH_BASE_RADIUS = 1.55;
const SAFE_HIDE_MS = 30_000;
const BLIND_MS = 30_000;

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(__dirname));
app.get('/health', (_req, res) => res.json({ ok: true }));

const SEEKER_ROLES = [
  { name: 'Tracker', desc: 'Większy zasięg wykrywania i stabilny pościg.', speed: 5.15, vision: 34, catchBonus: 0.55, color: '#ff6b6b' },
  { name: 'Radar', desc: 'Najlepiej widzi cel w średnim dystansie.', speed: 4.95, vision: 38, catchBonus: 0.35, color: '#ff9f43' },
  { name: 'Hunter', desc: 'Najszybszy start i agresywny pościg.', speed: 5.75, vision: 28, catchBonus: 0.25, color: '#ff4d4d' },
  { name: 'Sentinel', desc: 'Stabilny łowca z dobrym balansem prędkości.', speed: 5.05, vision: 32, catchBonus: 0.40, color: '#ff7f50' },
  { name: 'Warden', desc: 'Większy zasięg łapania i mocny nacisk.', speed: 4.90, vision: 36, catchBonus: 0.60, color: '#e74c3c' },
  { name: 'Echo', desc: 'Dobrze trzyma tempo podczas długiego pościgu.', speed: 5.45, vision: 30, catchBonus: 0.30, color: '#ff8c69' },
  { name: 'Analyst', desc: 'Bardzo dobry do wyłapywania ruchu na dystans.', speed: 5.20, vision: 35, catchBonus: 0.35, color: '#ffb347' },
  { name: 'Snare Master', desc: 'Nacisk na kontrolę i zamykanie przestrzeni.', speed: 4.80, vision: 31, catchBonus: 0.50, color: '#f97316' },
  { name: 'Night Watch', desc: 'Najlepszy wzrok w ciemniejszych fragmentach mapy.', speed: 5.10, vision: 40, catchBonus: 0.25, color: '#fb7185' },
  { name: 'Pursuer', desc: 'Najbardziej zwinny w gonitwie na prostej.', speed: 5.90, vision: 27, catchBonus: 0.25, color: '#ff5252' },
  { name: 'Pathfinder', desc: 'Płynny ruch i dobre ustawianie się na skrzydłach.', speed: 5.35, vision: 32, catchBonus: 0.35, color: '#f87171' },
  { name: 'Stalker', desc: 'Silny w cichym, stopniowym zawężaniu dystansu.', speed: 5.55, vision: 33, catchBonus: 0.35, color: '#ff7070' },
];

const HIDER_ROLES = [
  { name: 'Ghost', desc: 'Cichszy i trudniejszy do zauważenia przy ścianach.', speed: 5.05, vision: 28, stealth: 22, color: '#60a5fa' },
  { name: 'Sprinter', desc: 'Bardzo szybki i dobry na krótkie przebiegi.', speed: 5.95, vision: 24, stealth: 18, color: '#38bdf8' },
  { name: 'Blink', desc: 'Najlepszy w gwałtownych ucieczkach i skrętach.', speed: 5.55, vision: 24, stealth: 18, color: '#22c55e' },
  { name: 'Decoy', desc: 'Świetny w mieszaniu tropów i myleniu pościgu.', speed: 5.15, vision: 25, stealth: 19, color: '#14b8a6' },
  { name: 'Smoke', desc: 'Lubi chaos i zasłanianie własnej trasy.', speed: 5.00, vision: 26, stealth: 20, color: '#a78bfa' },
  { name: 'Shade', desc: 'Dobrze znika w bocznych korytarzach.', speed: 5.20, vision: 27, stealth: 22, color: '#818cf8' },
  { name: 'Acrobat', desc: 'Wygodny przy skokach i dynamicznym ruchu.', speed: 5.30, vision: 24, stealth: 20, color: '#2dd4bf' },
  { name: 'Burrower', desc: 'Najlepiej czuje się przy przeszkodach i zakrętach.', speed: 5.10, vision: 26, stealth: 21, color: '#34d399' },
  { name: 'Mimic', desc: 'Świetny, gdy trzeba zlać się z otoczeniem.', speed: 5.00, vision: 28, stealth: 23, color: '#67e8f9' },
  { name: 'Runner', desc: 'Najdłużej utrzymuje tempo w otwartym terenie.', speed: 5.80, vision: 24, stealth: 18, color: '#4ade80' },
  { name: 'Quietfoot', desc: 'Najsłabszy ślad i bardzo mały zasięg zdrady.', speed: 4.95, vision: 29, stealth: 25, color: '#93c5fd' },
  { name: 'Vanisher', desc: 'Idealny do szybkiego znikania po zmianie roli.', speed: 5.25, vision: 24, stealth: 16, color: '#f472b6' },
];

const ALL_ROLES = { seekers: SEEKER_ROLES, hiders: HIDER_ROLES };

const obstacleDefs = [
  { x: -17, z: -11, w: 4, d: 4, h: 2.8, kind: 'crate' },
  { x: -10, z: -16, w: 5, d: 3, h: 2.5, kind: 'crate' },
  { x: -2, z: -10, w: 4, d: 5, h: 3.2, kind: 'tree' },
  { x: 6, z: -14, w: 5, d: 5, h: 2.7, kind: 'crate' },
  { x: 14, z: -9, w: 4, d: 4, h: 2.8, kind: 'tree' },
  { x: 17, z: 4, w: 4, d: 4, h: 3.2, kind: 'crate' },
  { x: 9, z: 12, w: 6, d: 3, h: 2.5, kind: 'crate' },
  { x: -1, z: 16, w: 5, d: 5, h: 2.8, kind: 'tree' },
  { x: -12, z: 13, w: 4, d: 4, h: 2.2, kind: 'crate' },
  { x: -18, z: 3, w: 5, d: 5, h: 3.4, kind: 'tree' },
  { x: -5, z: 1, w: 4, d: 4, h: 2.5, kind: 'crate' },
  { x: 4, z: 2, w: 4, d: 6, h: 3.0, kind: 'tree' },
  { x: 12, z: 0, w: 5, d: 4, h: 2.7, kind: 'crate' },
  { x: -8, z: 7, w: 4, d: 4, h: 2.3, kind: 'crate' },
  { x: 1, z: -4, w: 4, d: 4, h: 2.9, kind: 'tree' },
  { x: 21, z: -15, w: 4, d: 4, h: 2.6, kind: 'crate' },
  { x: -21, z: 15, w: 4, d: 4, h: 2.6, kind: 'crate' },
  { x: 0, z: 22, w: 8, d: 2, h: 1.6, kind: 'crate' },
];

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function distance2D(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function seededShuffle(arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function makeRoleDeck(side) {
  const source = side === 'seeker' ? SEEKER_ROLES : HIDER_ROLES;
  return seededShuffle(source.map((r) => r.name));
}

const state = {
  running: false,
  startedAt: 0,
  round: 0,
  message: 'Czekam na 2 graczy...',
  roleDecks: {
    seeker: makeRoleDeck('seeker'),
    hider: makeRoleDeck('hider'),
  },
  players: new Map(),
  announcements: [],
  lastBroadcastAt: 0,
};

function pushAnnouncement(text) {
  state.announcements.unshift({ text, at: Date.now() });
  state.announcements = state.announcements.slice(0, 5);
}

function getRoleDefinition(side, roleName) {
  const list = side === 'seeker' ? SEEKER_ROLES : HIDER_ROLES;
  return list.find((r) => r.name === roleName) || list[0];
}

function nextRole(side) {
  const deck = state.roleDecks[side];
  if (!deck.length) {
    state.roleDecks[side] = makeRoleDeck(side);
  }
  return state.roleDecks[side].pop();
}

function chooseSpawn(index) {
  const spots = [
    { x: -22, z: -22 },
    { x: 22, z: -22 },
    { x: -22, z: 22 },
    { x: 22, z: 22 },
    { x: 0, z: 0 },
    { x: -8, z: 20 },
    { x: 10, z: -20 },
  ];
  const s = spots[index % spots.length];
  return { x: s.x + (Math.random() * 2 - 1), z: s.z + (Math.random() * 2 - 1) };
}

function getActivePlayers() {
  return [...state.players.values()].filter((p) => !p.spectator);
}

function ensureGameRunning() {
  const active = getActivePlayers();
  if (active.length >= 2 && !state.running) {
    startGame();
  }
}

function resetToLobby(reason = 'Czekam na 2 graczy...') {
  state.running = false;
  state.startedAt = 0;
  state.round = 0;
  state.message = reason;
  state.players.forEach((p) => {
    p.spectator = false;
    p.side = null;
    p.roleName = null;
    p.roleDesc = null;
    p.speed = 0;
    p.vision = 0;
    p.catchBonus = 0;
    p.stealth = 0;
    p.blindUntil = 0;
    p.safeUntil = 0;
  });
  pushAnnouncement('Gra wróciła do lobby.');
}

function assignRoleToPlayer(player, side) {
  const roleName = nextRole(side);
  const roleDef = getRoleDefinition(side, roleName);
  player.side = side;
  player.roleName = roleDef.name;
  player.roleDesc = roleDef.desc;
  player.speed = roleDef.speed;
  player.vision = roleDef.vision;
  player.catchBonus = roleDef.catchBonus || 0;
  player.stealth = roleDef.stealth || 0;
}

function startGame() {
  const active = getActivePlayers();
  if (active.length < 2) return;

  state.running = true;
  state.startedAt = Date.now();
  state.round += 1;
  state.message = `Runda ${state.round} rozpoczęta!`;

  const shuffled = seededShuffle(active);
  const firstSeeker = shuffled[0];
  shuffled.forEach((p, index) => {
    p.spectator = false;
    p.spawnLock = false;
    p.blindUntil = 0;
    p.safeUntil = 0;
    p.lastTaggedAt = 0;
    p.x = chooseSpawn(index).x;
    p.z = chooseSpawn(index).z;
    if (p === firstSeeker) {
      assignRoleToPlayer(p, 'seeker');
    } else {
      assignRoleToPlayer(p, 'hider');
    }
  });

  pushAnnouncement(`Start gry! ${firstSeeker.name} zaczyna jako szukający.`);
}

function endIfTooFewPlayers() {
  const active = getActivePlayers();
  if (state.running && active.length < 2) {
    resetToLobby('Za mało graczy. Czekam na kolejnych...');
  }
}

function circleRectCollides(cx, cz, radius, rect) {
  const halfW = rect.w / 2;
  const halfD = rect.d / 2;
  const nearestX = clamp(cx, rect.x - halfW, rect.x + halfW);
  const nearestZ = clamp(cz, rect.z - halfD, rect.z + halfD);
  const dx = cx - nearestX;
  const dz = cz - nearestZ;
  return dx * dx + dz * dz < radius * radius;
}

function collides(x, z) {
  if (x < -MAP_HALF || x > MAP_HALF || z < -MAP_HALF || z > MAP_HALF) return true;
  return obstacleDefs.some((ob) => circleRectCollides(x, z, PLAYER_RADIUS, ob));
}

function movePlayer(player, dt) {
  if (!player.keys) return;

  const roleSpeed = player.speed || 0;
  let dx = 0;
  let dz = 0;
  if (player.keys.w) dz -= 1;
  if (player.keys.s) dz += 1;
  if (player.keys.a) dx -= 1;
  if (player.keys.d) dx += 1;

  const len = Math.hypot(dx, dz) || 1;
  dx /= len;
  dz /= len;

  let speed = roleSpeed;
  if (player.keys.shift) speed *= 1.22;

  const nextX = player.x + dx * speed * dt;
  const nextZ = player.z + dz * speed * dt;

  const canX = !collides(nextX, player.z);
  const canZ = !collides(player.x, nextZ);
  if (canX) player.x = nextX;
  if (canZ) player.z = nextZ;

  player.x = clamp(player.x, -MAP_HALF + 1, MAP_HALF - 1);
  player.z = clamp(player.z, -MAP_HALF + 1, MAP_HALF - 1);
  player.lastMoveAt = Date.now();
}

function isCatchable(target, now) {
  return target.side === 'hider' && now >= (target.safeUntil || 0);
}

function swapRoles(seeker, hider) {
  const now = Date.now();

  const oldSeekerName = seeker.name;
  const oldHiderName = hider.name;

  assignRoleToPlayer(hider, 'seeker');
  hider.blindUntil = now + BLIND_MS;
  hider.safeUntil = 0;

  assignRoleToPlayer(seeker, 'hider');
  seeker.safeUntil = now + SAFE_HIDE_MS;
  seeker.blindUntil = 0;

  const spotA = chooseSpawn(Math.floor(Math.random() * 4));
  const spotB = chooseSpawn(Math.floor(Math.random() * 4) + 4);
  hider.x = spotA.x;
  hider.z = spotA.z;
  seeker.x = spotB.x;
  seeker.z = spotB.z;

  pushAnnouncement(`${oldSeekerName} został chowającym, a ${oldHiderName} przejął rolę szukającego!`);
}

function catchLogic() {
  const now = Date.now();
  const seekers = [...state.players.values()].filter((p) => !p.spectator && p.side === 'seeker' && now >= (p.blindUntil || 0));
  const hiders = [...state.players.values()].filter((p) => !p.spectator && p.side === 'hider');

  for (const seeker of seekers) {
    for (const hider of hiders) {
      if (!isCatchable(hider, now)) continue;
      const catchRadius = CATCH_BASE_RADIUS + (seeker.catchBonus || 0);
      if (distance2D(seeker, hider) <= catchRadius) {
        if (now - (hider.lastTaggedAt || 0) > 1000 && now - (seeker.lastTaggedAt || 0) > 1000) {
          hider.lastTaggedAt = now;
          seeker.lastTaggedAt = now;
          swapRoles(seeker, hider);
          return;
        }
      }
    }
  }
}

function buildBroadcastState() {
  const now = Date.now();
  return {
    running: state.running,
    round: state.round,
    message: state.message,
    startedAt: state.startedAt,
    now,
    players: [...state.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      x: p.x,
      z: p.z,
      side: p.side,
      roleName: p.roleName,
      roleDesc: p.roleDesc,
      color: p.color,
      spectator: !!p.spectator,
      blindUntil: p.blindUntil || 0,
      safeUntil: p.safeUntil || 0,
      connected: true,
    })),
    announcements: state.announcements,
    obstacles: obstacleDefs,
    roles: ALL_ROLES,
  };
}

function broadcastState() {
  const payload = JSON.stringify({ type: 'state', state: buildBroadcastState() });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

wss.on('connection', (ws) => {
  const id = randomId();
  const player = {
    id,
    ws,
    name: `Gracz_${id.slice(0, 4)}`,
    x: 0,
    z: 0,
    side: null,
    roleName: null,
    roleDesc: null,
    speed: 0,
    vision: 0,
    catchBonus: 0,
    stealth: 0,
    blindUntil: 0,
    safeUntil: 0,
    keys: { w: false, a: false, s: false, d: false, shift: false },
    spectator: false,
    lastTaggedAt: 0,
    color: '#94a3b8',
  };

  state.players.set(id, player);

  ws.send(JSON.stringify({
    type: 'welcome',
    id,
    roles: ALL_ROLES,
    message: state.message,
  }));

  pushAnnouncement(`${player.name} dołączył do lobby.`);

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === 'join') {
      const clean = String(msg.name || '').trim().slice(0, 18);
      if (clean) player.name = clean;
      player.spectator = false;
      player.x = chooseSpawn(Math.floor(Math.random() * 7)).x;
      player.z = chooseSpawn(Math.floor(Math.random() * 7)).z;
      pushAnnouncement(`${player.name} gotowy do gry.`);
      ensureGameRunning();
      return;
    }

    if (msg.type === 'input' && msg.keys) {
      player.keys = {
        w: !!msg.keys.w,
        a: !!msg.keys.a,
        s: !!msg.keys.s,
        d: !!msg.keys.d,
        shift: !!msg.keys.shift,
      };
      return;
    }

    if (msg.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', t: msg.t || Date.now() }));
    }
  });

  ws.on('close', () => {
    state.players.delete(id);
    pushAnnouncement(`${player.name} opuścił grę.`);
    endIfTooFewPlayers();
  });
});

let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.05, (now - lastTick) / 1000);
  lastTick = now;

  const active = getActivePlayers();

  for (const player of active) {
    movePlayer(player, dt);
  }

  if (state.running) {
    catchLogic();
  } else {
    ensureGameRunning();
  }

  for (const p of state.players.values()) {
    if (p.side === 'seeker' && p.blindUntil && now >= p.blindUntil) {
      p.blindUntil = 0;
      pushAnnouncement(`${p.name} odzyskał wzrok.`);
    }
    if (p.side === 'hider' && p.safeUntil && now >= p.safeUntil) {
      p.safeUntil = 0;
      pushAnnouncement(`${p.name} może znów zostać złapany.`);
    }
  }
}, 1000 / TICK_RATE);

setInterval(() => {
  broadcastState();
}, 1000 / STATE_BROADCAST_RATE);

server.listen(PORT, () => {
  console.log(`Hide and Role działa na porcie ${PORT}`);
});
