
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');
const { randomUUID } = require('crypto');

const port = process.env.PORT || 8080;
const publicIndex = path.join(__dirname, 'index.html');
const usersDbPath = path.join(__dirname, 'users_db.json');

const server = http.createServer((req, res) => {
    try {
        if (req.url === '/' || req.url === '/index.html') {
            if (!fs.existsSync(publicIndex)) {
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Brak pliku index.html obok server.js');
                return;
            }

            const html = fs.readFileSync(publicIndex, 'utf8');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(html);
            return;
        }

        if (req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('ok');
            return;
        }

        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
    } catch (err) {
        console.error('Błąd HTTP:', err);
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Błąd serwera');
    }
});

const wss = new WebSocketServer({ noServer: true });

let users = Object.create(null);
let onlineCount = 0;
let duelLobbies = new Map();

console.log(`Serwer BeatClicker działa na porcie ${port}`);

function loadUsers() {
    try {
        if (!fs.existsSync(usersDbPath)) {
            users = Object.create(null);
            return;
        }

        const raw = fs.readFileSync(usersDbPath, 'utf8');
        const parsed = JSON.parse(raw);
        const nextUsers = Object.create(null);

        if (parsed && typeof parsed === 'object') {
            for (const [username, user] of Object.entries(parsed)) {
                const safeUsername = normalizeText(username);
                if (!safeUsername) continue;

                nextUsers[safeUsername] = {
                    password: normalizeText(user && user.password) || '',
                    points: Math.max(0, Math.round(Number(user && user.points) || 0)),
                    elo: Math.max(0, Math.round(Number(user && user.elo) || 1000))
                };
            }
        }

        users = nextUsers;
        console.log(`Wczytano użytkowników: ${Object.keys(users).length}`);
    } catch (err) {
        console.error('Nie udało się wczytać users_db.json:', err.message);
        users = Object.create(null);
    }
}

function saveUsers() {
    try {
        const tmpPath = usersDbPath + '.tmp';
        fs.writeFileSync(tmpPath, JSON.stringify(users, null, 2), 'utf8');
        fs.renameSync(tmpPath, usersDbPath);
    } catch (err) {
        console.error('Nie udało się zapisać users_db.json:', err.message);
    }
}

loadUsers();

function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function safeSend(ws, payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
    }
}

function broadcast(payload) {
    const msg = JSON.stringify(payload);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
}

function getTopPlayers() {
    return Object.keys(users)
        .map(username => ({
            username,
            points: Number(users[username].points) || 0
        }))
        .sort((a, b) => b.points - a.points)
        .slice(0, 10);
}

function broadcastOnlineCount() {
    broadcast({ type: 'ONLINE_COUNT', count: onlineCount });
}

function broadcastLeaderboard() {
    broadcast({ type: 'LEADERBOARD', data: getTopPlayers() });
}

function getWaitingLobbies() {
    return Array.from(duelLobbies.values())
        .filter(lobby => lobby.status === 'waiting')
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(lobby => ({
            id: lobby.id,
            host: lobby.host,
            title: lobby.title,
            duration: lobby.duration,
            createdAt: lobby.createdAt
        }));
}

function broadcastDuelLobbies() {
    broadcast({ type: '1V1_LOBBIES', data: getWaitingLobbies() });
}

function sendDuelLobbiesTo(ws) {
    safeSend(ws, { type: '1V1_LOBBIES', data: getWaitingLobbies() });
}

function createLobbyId() {
    try {
        return `lobby_${randomUUID()}`;
    } catch {
        return `lobby_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }
}

function getUserElo(username) {
    if (!users[username]) return 1000;
    const elo = Number(users[username].elo);
    return Number.isFinite(elo) ? elo : 1000;
}

function setUserElo(username, elo) {
    if (!users[username]) {
        users[username] = { password: '', points: 0, elo: 1000 };
    }
    users[username].elo = Math.max(0, Math.round(Number(elo) || 0));
}

function computeDuelDelta(playerElo, opponentElo) {
    const gap = Math.abs((Number(playerElo) || 1000) - (Number(opponentElo) || 1000));
    if (gap === 0) return 0;
    // Im większa różnica ELO, tym mniejsza zmiana.
    return Math.max(1, 5 - Math.min(4, Math.floor(gap / 200)));
}

function getLobbyForUsername(username) {
    return Array.from(duelLobbies.values()).find(lobby =>
        lobby.host === username || lobby.guest === username
    ) || null;
}

function cancelLobby(lobby, reason = 'anulowano') {
    if (!lobby) return;

    const payload = {
        type: '1V1_CANCELLED',
        lobbyId: lobby.id,
        reason
    };

    safeSend(lobby.hostWs, payload);
    safeSend(lobby.guestWs, payload);

    duelLobbies.delete(lobby.id);
    if (lobby.hostWs && lobby.hostWs.currentLobbyId === lobby.id) lobby.hostWs.currentLobbyId = null;
    if (lobby.guestWs && lobby.guestWs.currentLobbyId === lobby.id) lobby.guestWs.currentLobbyId = null;

    broadcastDuelLobbies();
}

function finalizeMatch(lobby) {
    if (!lobby || lobby.resolved) return;
    lobby.resolved = true;

    const hostScore = Number(lobby.results.get(lobby.host) ?? 0);
    const guestScore = Number(lobby.results.get(lobby.guest) ?? 0);

    const hostElo = getUserElo(lobby.host);
    const guestElo = getUserElo(lobby.guest);

    let hostOutcome = 'draw';
    let guestOutcome = 'draw';
    let hostDelta = 0;
    let guestDelta = 0;

    if (hostScore > guestScore) {
        hostOutcome = 'win';
        guestOutcome = 'loss';
        hostDelta = computeDuelDelta(hostElo, guestElo);
        guestDelta = -computeDuelDelta(guestElo, hostElo);
    } else if (guestScore > hostScore) {
        hostOutcome = 'loss';
        guestOutcome = 'win';
        hostDelta = -computeDuelDelta(hostElo, guestElo);
        guestDelta = computeDuelDelta(guestElo, hostElo);
    }

    const newHostElo = Math.max(0, hostElo + hostDelta);
    const newGuestElo = Math.max(0, guestElo + guestDelta);

    setUserElo(lobby.host, newHostElo);
    setUserElo(lobby.guest, newGuestElo);
    saveUsers();

    safeSend(lobby.hostWs, {
        type: '1V1_RESULT',
        lobbyId: lobby.id,
        outcome: hostOutcome,
        delta: hostDelta,
        newElo: newHostElo,
        score: hostScore,
        opponentScore: guestScore,
        opponent: lobby.guest
    });

    safeSend(lobby.guestWs, {
        type: '1V1_RESULT',
        lobbyId: lobby.id,
        outcome: guestOutcome,
        delta: guestDelta,
        newElo: newGuestElo,
        score: guestScore,
        opponentScore: hostScore,
        opponent: lobby.host
    });

    duelLobbies.delete(lobby.id);
    if (lobby.hostWs && lobby.hostWs.currentLobbyId === lobby.id) lobby.hostWs.currentLobbyId = null;
    if (lobby.guestWs && lobby.guestWs.currentLobbyId === lobby.id) lobby.guestWs.currentLobbyId = null;

    broadcastDuelLobbies();
    broadcastLeaderboard();
}

function startMatch(lobby) {
    if (!lobby || lobby.status !== 'waiting' || !lobby.guestWs || !lobby.hostWs) return;

    lobby.status = 'matched';
    lobby.results = new Map();

    const startInMs = 1200;

    safeSend(lobby.hostWs, {
        type: '1V1_MATCH_STARTED',
        lobbyId: lobby.id,
        role: 'host',
        opponent: lobby.guest,
        trackUrl: lobby.trackUrl,
        title: lobby.title,
        duration: lobby.duration,
        difficulty: lobby.difficulty || 'normal',
        startInMs
    });

    safeSend(lobby.guestWs, {
        type: '1V1_MATCH_STARTED',
        lobbyId: lobby.id,
        role: 'guest',
        opponent: lobby.host,
        trackUrl: lobby.trackUrl,
        title: lobby.title,
        duration: lobby.duration,
        difficulty: lobby.difficulty || 'normal',
        startInMs
    });

    broadcastDuelLobbies();
}

function registerInLobby(ws, lobby, role) {
    ws.currentLobbyId = lobby.id;
    ws.currentLobbyRole = role;
    if (role === 'host') {
        lobby.hostWs = ws;
    } else {
        lobby.guestWs = ws;
    }
}

wss.on('connection', (ws, req) => {
    onlineCount += 1;
    ws.isAlive = true;
    ws.username = null;
    ws.currentLobbyId = null;
    ws.currentLobbyRole = null;

    console.log(`WS connected: ${req.socket.remoteAddress || 'unknown'}`);
    broadcastOnlineCount();
    safeSend(ws, { type: 'ONLINE_COUNT', count: onlineCount });
    safeSend(ws, { type: 'LEADERBOARD', data: getTopPlayers() });
    sendDuelLobbiesTo(ws);

    ws.on('pong', () => {
        ws.isAlive = true;
    });

    ws.on('message', (message) => {
        try {
            const raw = Buffer.isBuffer(message) ? message.toString('utf8') : String(message);
            const data = JSON.parse(raw);

            if (!data || typeof data.type !== 'string') {
                safeSend(ws, {
                    type: 'LOGIN_ERROR',
                    message: 'Nieprawidłowy format wiadomości.'
                });
                return;
            }

            if (data.type === 'LOGIN') {
                const username = normalizeText(data.username);
                const password = normalizeText(data.password);

                if (username.length < 3 || password.length < 4) {
                    safeSend(ws, {
                        type: 'LOGIN_ERROR',
                        message: 'Nick musi mieć min. 3 znaki, a hasło min. 4 znaki.'
                    });
                    return;
                }

                if (!users[username]) {
                    users[username] = { password, points: 0, elo: 1000 };
                    saveUsers();
                }

                if (users[username].password === password) {
                    ws.username = username;
                    if (!Number.isFinite(Number(users[username].elo))) {
                        users[username].elo = 1000;
                    }

                    saveUsers();
                    safeSend(ws, {
                        type: 'LOGIN_SUCCESS',
                        username,
                        points: Number(users[username].points) || 0,
                        elo: Number(users[username].elo) || 1000
                    });

                    broadcastLeaderboard();
                } else {
                    safeSend(ws, {
                        type: 'LOGIN_ERROR',
                        message: 'Nieprawidłowe hasło!'
                    });
                }
                return;
            }

            if (data.type === 'UPDATE_POINTS') {
                if (!ws.username || !users[ws.username]) return;

                const points = Number(data.points);
                if (!Number.isFinite(points) || points < 0) return;

                users[ws.username].points = points;
                saveUsers();
                broadcastLeaderboard();
                return;
            }

            if (data.type === 'REQUEST_1V1_LOBBIES') {
                sendDuelLobbiesTo(ws);
                return;
            }

            if (data.type === 'CREATE_1V1_LOBBY') {
                if (!ws.username) {
                    safeSend(ws, { type: '1V1_ERROR', message: 'Najpierw zaloguj się.' });
                    return;
                }

                const trackUrl = normalizeText(data.trackUrl);
                const title = normalizeText(data.title) || 'Bez tytułu';
                const difficulty = ['easy', 'normal', 'hard'].includes(normalizeText(data.difficulty)) ? normalizeText(data.difficulty) : 'normal';
                const duration = Number(data.duration) || 0;

                if (!trackUrl) {
                    safeSend(ws, { type: '1V1_ERROR', message: 'Brak linku do muzyki.' });
                    return;
                }

                const alreadyInLobby = getLobbyForUsername(ws.username);
                if (alreadyInLobby) {
                    safeSend(ws, { type: '1V1_ERROR', message: 'Masz już aktywną grę 1VS1.' });
                    return;
                }

                const lobbyId = createLobbyId();
                const lobby = {
                    id: lobbyId,
                    host: ws.username,
                    guest: null,
                    hostWs: ws,
                    guestWs: null,
                    trackUrl,
                    title,
                    duration,
                    difficulty,
                    createdAt: Date.now(),
                    status: 'waiting',
                    results: new Map(),
                    resolved: false
                };

                duelLobbies.set(lobbyId, lobby);
                registerInLobby(ws, lobby, 'host');

                safeSend(ws, {
                    type: '1V1_LOBBY_CREATED',
                    lobbyId,
                    title,
                    trackUrl,
                    duration,
                    difficulty
                });

                broadcastDuelLobbies();
                return;
            }

            if (data.type === 'JOIN_1V1_LOBBY') {
                if (!ws.username) {
                    safeSend(ws, { type: '1V1_ERROR', message: 'Najpierw zaloguj się.' });
                    return;
                }

                const lobbyId = normalizeText(data.lobbyId);
                const lobby = duelLobbies.get(lobbyId);

                if (!lobby) {
                    safeSend(ws, { type: '1V1_ERROR', message: 'Ta gra już nie istnieje.' });
                    return;
                }

                if (lobby.status !== 'waiting' || !lobby.hostWs) {
                    safeSend(ws, { type: '1V1_ERROR', message: 'Ta gra jest już zajęta.' });
                    return;
                }

                if (lobby.host === ws.username) {
                    safeSend(ws, { type: '1V1_ERROR', message: 'Nie możesz dołączyć do własnej gry.' });
                    return;
                }

                const alreadyInLobby = getLobbyForUsername(ws.username);
                if (alreadyInLobby) {
                    safeSend(ws, { type: '1V1_ERROR', message: 'Masz już aktywną grę 1VS1.' });
                    return;
                }

                lobby.guest = ws.username;
                registerInLobby(ws, lobby, 'guest');
                startMatch(lobby);
                return;
            }

            if (data.type === 'LEAVE_1V1_LOBBY' || data.type === 'CANCEL_1V1_LOBBY') {
                const lobbyId = normalizeText(data.lobbyId || ws.currentLobbyId);
                if (!lobbyId) return;

                const lobby = duelLobbies.get(lobbyId);
                if (!lobby) return;

                if (lobby.status === 'matched') {
                    cancelLobby(lobby, 'anulowano');
                } else {
                    cancelLobby(lobby, 'anulowano');
                }
                return;
            }

            if (data.type === 'SUBMIT_1V1_RESULT') {
                const lobbyId = normalizeText(data.lobbyId || ws.currentLobbyId);
                const lobby = duelLobbies.get(lobbyId);
                if (!lobby || lobby.status !== 'matched') return;
                if (!ws.username || (ws.username !== lobby.host && ws.username !== lobby.guest)) return;

                const score = Number(data.score);
                if (!Number.isFinite(score) || score < 0) return;

                lobby.results.set(ws.username, score);

                const hostHas = lobby.results.has(lobby.host);
                const guestHas = lobby.results.has(lobby.guest);

                if (hostHas && guestHas) {
                    finalizeMatch(lobby);
                }
                return;
            }
        } catch (e) {
            console.error('Błąd parsowania wiadomości:', e);
            safeSend(ws, {
                type: 'LOGIN_ERROR',
                message: 'Błąd danych wysłanych do serwera.'
            });
        }
    });

    ws.on('close', () => {
        onlineCount = Math.max(0, onlineCount - 1);
        broadcastOnlineCount();

        // Jeśli gracz był w lobby 1v1, zamykamy lub anulujemy jego grę.
        if (ws.currentLobbyId) {
            const lobby = duelLobbies.get(ws.currentLobbyId);
            if (lobby) {
                cancelLobby(lobby, 'rozłączono');
            }
        }

        console.log(`Rozłączono klienta. Online: ${onlineCount}`);
    });

    ws.on('error', (err) => {
        console.error('Błąd WebSocket:', err.message);
    });
});

server.on('upgrade', (req, socket, head) => {
    try {
        const url = new URL(req.url, `http://${req.headers.host}`);

        if (url.pathname !== '/ws' && url.pathname !== '/') {
            socket.destroy();
            return;
        }

        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req);
        });
    } catch {
        socket.destroy();
    }
});

const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            ws.terminate();
            return;
        }

        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => {
    clearInterval(interval);
});

server.listen(port, '0.0.0.0', () => {
    console.log(`HTTP/WebSocket server nasłuchuje na porcie ${port}`);
});
