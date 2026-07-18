const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const port = process.env.PORT || 8080;
const indexPath = path.join(__dirname, 'index.html');

const server = http.createServer((req, res) => {
    try {
        if (req.url === '/' || req.url === '/index.html') {
            if (!fs.existsSync(indexPath)) {
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Brak pliku index.html obok server.js');
                return;
            }

            const html = fs.readFileSync(indexPath, 'utf8');
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

// WebSocket na osobnej ścieżce
const wss = new WebSocketServer({ noServer: true });

// Prosta baza w pamięci
let users = {};
let onlineCount = 0;

console.log(`Serwer BeatClicker działa na porcie ${port}`);

function getTopPlayers() {
    return Object.keys(users)
        .map(username => ({
            username,
            points: Number(users[username].points) || 0
        }))
        .sort((a, b) => b.points - a.points)
        .slice(0, 10);
}

function safeSend(ws, payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
    }
}

function broadcastOnlineCount() {
    const msg = JSON.stringify({ type: 'ONLINE_COUNT', count: onlineCount });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(msg);
    });
}

function broadcastLeaderboard() {
    const msg = JSON.stringify({ type: 'LEADERBOARD', data: getTopPlayers() });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(msg);
    });
}

function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

wss.on('connection', (ws, req) => {
    onlineCount++;
    ws.isAlive = true;
    ws.username = null;

    console.log(`WS connected: ${req.socket.remoteAddress || 'unknown'}`);
    broadcastOnlineCount();
    safeSend(ws, { type: 'ONLINE_COUNT', count: onlineCount });
    safeSend(ws, { type: 'LEADERBOARD', data: getTopPlayers() });

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
                    users[username] = { password, points: 0 };
                    ws.username = username;

                    safeSend(ws, {
                        type: 'LOGIN_SUCCESS',
                        username,
                        points: 0
                    });

                    broadcastLeaderboard();
                    return;
                }

                if (users[username].password === password) {
                    ws.username = username;

                    safeSend(ws, {
                        type: 'LOGIN_SUCCESS',
                        username,
                        points: Number(users[username].points) || 0
                    });
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
                broadcastLeaderboard();
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
        console.log(`Rozłączono klienta. Online: ${onlineCount}`);
    });

    ws.on('error', (err) => {
        console.error('Błąd WebSocket:', err.message);
    });
});

server.on('upgrade', (req, socket, head) => {
    try {
        const url = new URL(req.url, `http://${req.headers.host}`);

        // Akceptujemy WS tylko na /ws i /, żeby było kompatybilnie
        if (url.pathname !== '/ws' && url.pathname !== '/') {
            socket.destroy();
            return;
        }

        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req);
        });
    } catch (e) {
        socket.destroy();
    }
});

// Heartbeat
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