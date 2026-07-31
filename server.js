const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const TICK_RATE = 30;
const STATE_BROADCAST_RATE = 15;

const MAP_HALF = 38;
const PLAYER_RADIUS = 0.42;
const CATCH_BASE_RADIUS = 1.35;
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

// Buildings + hiding spots around open paths / roads.
const obstacleDefs = [
  // Central streets and small cover
  { x: -24, z: -22, w: 7, d: 7, h: 4.6, kind: 'house' },
  { x: -14, z: -22, w: 6, d: 6, h: 4.0, kind: 'shop' },
  { x: -4, z: -21, w: 7, d: 6, h: 4.4, kind: 'warehouse' },
  { x: 8, z: -22, w: 5, d: 5, h: 3.4, kind: 'shed' },
  { x: 20, z: -22, w: 8, d: 7, h: 4.8, kind: 'house' },

  { x: -25, z: -6, w: 7, d: 7, h: 4.4, kind: 'shop' },
  { x: -14, z: -5, w: 6, d: 6, h: 4.2, kind: 'house' },
  { x: -2, z: -6, w: 8, d: 7, h: 4.7, kind: 'warehouse' },
  { x: 10, z: -5, w: 6, d: 6, h: 3.8, kind: 'market' },
  { x: 22, z: -6, w: 7, d: 7, h: 4.6, kind: 'house' },

  { x: -24, z: 11, w: 6, d: 6, h: 3.8, kind: 'shed' },
  { x: -12, z: 12, w: 8, d: 7, h: 4.8, kind: 'warehouse' },
  { x: 1, z: 12, w: 6, d: 6, h: 4.1, kind: 'shop' },
  { x: 13, z: 11, w: 7, d: 7, h: 4.5, kind: 'house' },
  { x: 24, z: 12, w: 6, d: 6, h: 4.0, kind: 'market' },

  { x: -24, z: 26, w: 7, d: 7, h: 4.2, kind: 'house' },
  { x: -10, z: 24, w: 6, d: 6, h: 4.0, kind: 'shop' },
  { x: 4, z: 24, w: 8, d: 7, h: 4.8, kind: 'warehouse' },
  { x: 18, z: 25, w: 7, d: 7, h: 4.4, kind: 'house' },

  // Five mega buildings
  { x: -30, z: -30, w: 10, d: 10, h: 7.4, kind: 'mega' },
  { x: 30, z: -28, w: 11, d: 10, h: 8.1, kind: 'mega' },
  { x: -30, z: 30, w: 11, d: 10, h: 7.8, kind: 'mega' },
  { x: 30, z: 30, w: 12, d: 12, h: 8.4, kind: 'mega' },
  { x: 0, z: 30, w: 13, d: 11, h: 8.7, kind: 'mega' },

  // Caves / hideouts
  { x: -30, z: 0, w: 10, d: 8, h: 5.6, kind: 'cave' },
  { x: 30, z: 0, w: 10, d: 8, h: 5.6, kind: 'cave' },
  { x: 0, z: -30, w: 11, d: 8, h: 5.6, kind: 'cave' },

  // Props, fences and trees for cover
  { x: -18, z: -14, w: 3.8, d: 3.8, h: 2.8, kind: 'tree' },
  { x: -6, z: -14, w: 3.4, d: 3.4, h: 2.5, kind: 'tree' },
  { x: 7, z: -14, w: 3.4, d: 3.4, h: 2.5, kind: 'tree' },
  { x: 19, z: -14, w: 4.2, d: 4.2, h: 3.0, kind: 'crate' },

  { x: -20, z: 4, w: 5.5, d: 2.0, h: 1.5, kind: 'wall' },
  { x: 20, z: 4, w: 5.5, d: 2.0, h: 1.5, kind: 'wall' },
  { x: -20, z: -11, w: 5.5, d: 2.0, h: 1.5, kind: 'wall' },
  { x: 20, z: -11, w: 5.5, d: 2.0, h: 1.5, kind: 'wall' },
  { x: -18, z: 18, w: 5.2, d: 2.0, h: 1.4, kind: 'fence' },
  { x: 18, z: 18, w: 5.2, d: 2.0, h: 1.4, kind: 'fence' },

  { x: -8, z: 20, w: 4.0, d: 4.0, h: 2.8, kind: 'crate' },
  { x: 8, z: 20, w: 4.0, d: 4.0, h: 2.8, kind: 'crate' },
  { x: 0, z: 0, w: 6.0, d: 6.0, h: 3.5, kind: 'market' },
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

function getRoleDefinition(side, roleName) {
  const list = side === 'seeker' ? SEEKER_ROLES : HIDER_ROLES;
  return list.find((r) => r.name === roleName) || list[0];
}

function nextRole(state, side) {
  if (!state.roleDecks[side].length) {
    state.roleDecks[side] = makeRoleDeck(side);
  }
  return state.roleDecks[side].pop();
}

function chooseSpawn(index) {
  const spots = [
    { x: -24, z: -24 },
    { x: 24, z: -24 },
    { x: -24, z: 24 },
    { x: 24, z: 24 },
    { x: -13, z: 0 },
    { x: 13, z: 0 },
    { x: 0, z: -13 },
    { x: 0, z: 13 },
    { x: -20, z: 10 },
    { x: 20, z: -10 },
  ];
  const s = spots[index % spots.length];
  return { x: s.x + (Math.random() * 2 - 1), z: s.z + (Math.random() * 2 - 1) };
}

function findFreeSpawn(index) {
  const base = chooseSpawn(index);
  const rings = [0, 1.25, 2.5, 3.75, 5];
  for (const r of rings) {
    const checks = r === 0
      ? [{ x: base.x, z: base.z }]
      : Array.from({ length: 12 }, (_v, i) => {
          const ang = (Math.PI * 2 * i) / 12;
          return {
            x: base.x + Math.cos(ang) * r,
            z: base.z + Math.sin(ang) * r,
          };
        });
    for (const p of checks) {
      if (!collides(p.x, p.z)) {
        return { x: p.x, z: p.z };
      }
    }
  }
  return { x: base.x, z: base.z };
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

function getActivePlayers(state) {
  return [...state.players.values()].filter((p) => !p.spectator);
}

function pushAnnouncement(state, text) {
  state.announcements.unshift({ text, at: Date.now() });
  state.announcements = state.announcements.slice(0, 6);
}

function assignRoleToPlayer(state, player, side) {
  const roleName = nextRole(state, side);
  const roleDef = getRoleDefinition(side, roleName);
  player.side = side;
  player.roleName = roleDef.name;
  player.roleDesc = roleDef.desc;
  player.speed = roleDef.speed;
  player.vision = roleDef.vision;
  player.catchBonus = roleDef.catchBonus || 0;
  player.stealth = roleDef.stealth || 0;
  player.color = roleDef.color;
}

function resetToLobby(state, reason = 'Czekam na 2 graczy...') {
  state.running = false;
  state.startedAt = 0;
  state.round = 0;
  state.message = reason;
  for (const p of state.players.values()) {
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
    p.vx = 0;
    p.vz = 0;
    p.yaw = 0;
    p.pitch = 0;
  }
  pushAnnouncement(state, 'Gra wróciła do lobby.');
}

function startGame(state) {
  const active = getActivePlayers(state);
  if (active.length < 2) return;

  state.running = true;
  state.startedAt = Date.now();
  state.round += 1;
  state.message = `Runda ${state.round} rozpoczęta!`;

  const shuffled = seededShuffle(active);
  const firstSeeker = shuffled[0];

  shuffled.forEach((p, index) => {
    const spawn = findFreeSpawn(index);
    p.spectator = false;
    p.blindUntil = 0;
    p.safeUntil = 0;
    p.lastTaggedAt = 0;
    p.x = spawn.x;
    p.z = spawn.z;
    p.vx = 0;
    p.vz = 0;
    if (p === firstSeeker) {
      assignRoleToPlayer(state, p, 'seeker');
    } else {
      assignRoleToPlayer(state, p, 'hider');
    }
  });

  pushAnnouncement(state, `Start gry! ${firstSeeker.name} zaczyna jako szukający.`);
}

function ensureGameRunning(state) {
  const active = getActivePlayers(state);
  if (active.length >= 2 && !state.running) {
    startGame(state);
  }
}

function endIfTooFewPlayers(state) {
  if (state.running && getActivePlayers(state).length < 2) {
    resetToLobby(state, 'Za mało graczy. Czekam na kolejnych...');
  }
}

function movePlayer(player, dt) {
  const input = player.keys || {};
  const hasInput = input.w || input.a || input.s || input.d;

  // Movement is fixed to world axes so W/A/S/D always means up/left/down/right
  // no matter how the camera is rotated.
  let dx = 0;
  let dz = 0;
  if (input.w) dz -= 1;
  if (input.s) dz += 1;
  if (input.a) dx -= 1;
  if (input.d) dx += 1;
  const len = Math.hypot(dx, dz);
  if (len > 0) {
    dx /= len;
    dz /= len;
  }

  const sprintMult = input.shift ? 1.2 : 1;
  const baseSpeed = player.speed || 0;
  const targetSpeed = baseSpeed * sprintMult;
  const desiredVX = dx * targetSpeed;
  const desiredVZ = dz * targetSpeed;

  const accel = hasInput ? 14 : 20;
  const friction = hasInput ? 12 : 18;

  player.vx += (desiredVX - player.vx) * clamp(accel * dt, 0, 1);
  player.vz += (desiredVZ - player.vz) * clamp(accel * dt, 0, 1);

  if (!hasInput) {
    player.vx *= Math.max(0, 1 - friction * dt * 0.08);
    player.vz *= Math.max(0, 1 - friction * dt * 0.08);
  }

  const travel = Math.max(Math.abs(player.vx), Math.abs(player.vz)) * dt;
  const steps = Math.max(1, Math.ceil(travel / 0.22));
  const stepDt = dt / steps;

  for (let i = 0; i < steps; i += 1) {
    const nextX = player.x + player.vx * stepDt;
    const nextZ = player.z + player.vz * stepDt;

    const canX = !collides(nextX, player.z);
    const canZ = !collides(player.x, nextZ);

    if (canX) {
      player.x = nextX;
    } else {
      player.vx *= 0.05;
    }

    if (canZ) {
      player.z = nextZ;
    } else {
      player.vz *= 0.05;
    }
  }

  player.x = clamp(player.x, -MAP_HALF + 1, MAP_HALF - 1);
  player.z = clamp(player.z, -MAP_HALF + 1, MAP_HALF - 1);
}

function isCatchable(target, now) {
  return target.side === 'hider' && now >= (target.safeUntil || 0);
}

function swapRoles(state, seeker, hider) {
  const now = Date.now();

  const oldSeekerName = seeker.name;
  const oldHiderName = hider.name;

  assignRoleToPlayer(state, hider, 'seeker');
  hider.blindUntil = now + BLIND_MS;
  hider.safeUntil = 0;
  hider.vx = 0;
  hider.vz = 0;

  assignRoleToPlayer(state, seeker, 'hider');
  seeker.safeUntil = now + SAFE_HIDE_MS;
  seeker.blindUntil = 0;
  seeker.vx = 0;
  seeker.vz = 0;

  const spotA = findFreeSpawn(Math.floor(Math.random() * 4));
  const spotB = findFreeSpawn(Math.floor(Math.random() * 4) + 4);
  hider.x = spotA.x;
  hider.z = spotA.z;
  seeker.x = spotB.x;
  seeker.z = spotB.z;

  pushAnnouncement(state, `${oldSeekerName} został chowającym, a ${oldHiderName} przejął rolę szukającego!`);
}

function catchLogic(state) {
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
          swapRoles(state, seeker, hider);
          return;
        }
      }
    }
  }
}

function buildBroadcastState(state) {
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
      yaw: p.yaw || 0,
      pitch: p.pitch || 0,
      vx: p.vx || 0,
      vz: p.vz || 0,
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

function broadcastState(state) {
  const payload = JSON.stringify({ type: 'state', state: buildBroadcastState(state) });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
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
};

wss.on('connection', (ws) => {
  const id = randomId();
  const player = {
    id,
    ws,
    name: `Gracz_${id.slice(0, 4)}`,
    x: 0,
    z: 0,
    vx: 0,
    vz: 0,
    yaw: 0,
    pitch: 0,
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
    spectator: true,
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

  pushAnnouncement(state, `${player.name} dołączył do lobby.`);

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
      player.keys = { w: false, a: false, s: false, d: false, shift: false };
      player.blindUntil = 0;
      player.safeUntil = 0;
      const spawn = findFreeSpawn(Math.floor(Math.random() * 10));
      player.x = spawn.x;
      player.z = spawn.z;
      pushAnnouncement(state, `${player.name} gotowy do gry.`);
      ensureGameRunning(state);
      ws.send(JSON.stringify({ type: 'joined', name: player.name }));
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

    if (msg.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', t: msg.t || Date.now() }));
    }
  });

  ws.on('close', () => {
    state.players.delete(id);
    pushAnnouncement(state, `${player.name} opuścił grę.`);
    endIfTooFewPlayers(state);
  });

  ensureGameRunning(state);
});

let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.05, (now - lastTick) / 1000);
  lastTick = now;

  for (const player of getActivePlayers(state)) {
    movePlayer(player, dt);
  }

  if (state.running) {
    catchLogic(state);
  } else {
    ensureGameRunning(state);
  }

  for (const p of state.players.values()) {
    if (p.side === 'seeker' && p.blindUntil && now >= p.blindUntil) {
      p.blindUntil = 0;
      pushAnnouncement(state, `${p.name} odzyskał wzrok.`);
    }
    if (p.side === 'hider' && p.safeUntil && now >= p.safeUntil) {
      p.safeUntil = 0;
      pushAnnouncement(state, `${p.name} może znów zostać złapany.`);
    }
  }
}, 1000 / TICK_RATE);

setInterval(() => {
  broadcastState(state);
}, 1000 / STATE_BROADCAST_RATE);

server.listen(PORT, () => {
  console.log(`Hide and Role działa na porcie ${PORT}`);
});
