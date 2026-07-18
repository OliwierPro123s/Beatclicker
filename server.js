const { WebSocketServer } = require('ws');

const port = process.env.PORT || 8080;
const wss = new WebSocketServer({ port });

// Udawana baza danych w pamięci serwera (na produkcję warto zmienić na MongoDB/PostgreSQL)
let users = {}; 
let onlineCount = 0;

console.log(`Serwer BeatClicker działa na porcie ${port}`);

function getTopPlayers() {
    return Object.keys(users)
        .map(username => ({ username, points: users[username].points }))
        .sort((a, b) => b.points - a.points)
        .slice(0, 10);
}

function broadcastOnlineCount() {
    const message = JSON.stringify({ type: 'ONLINE_COUNT', count: onlineCount });
    wss.clients.forEach(client => {
        if (client.readyState === 1) client.send(message);
    });
}

function broadcastLeaderboard() {
    const message = JSON.stringify({ type: 'LEADERBOARD', data: getTopPlayers() });
    wss.clients.forEach(client => {
        if (client.readyState === 1) client.send(message);
    });
}

wss.on('connection', (ws) => {
    onlineCount++;
    broadcastOnlineCount();
    
    // Na start wysyłamy aktualną topkę nowemu klientowi
    ws.send(JSON.stringify({ type: 'LEADERBOARD', data: getTopPlayers() }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'LOGIN') {
                const { username, password } = data;
                
                if (!users[username]) {
                    // Rejestracja nowego konta, jeśli nie istnieje
                    users[username] = { password, points: 0 };
                    ws.username = username;
                    ws.send(JSON.stringify({ type: 'LOGIN_SUCCESS', username, points: 0 }));
                    broadcastLeaderboard();
                } else {
                    // Logowanie do istniejącego konta
                    if (users[username].password === password) {
                        ws.username = username;
                        ws.send(JSON.stringify({ type: 'LOGIN_SUCCESS', username, points: users[username].points }));
                    } else {
                        ws.send(JSON.stringify({ type: 'LOGIN_ERROR', message: 'Nieprawidłowe hasło!' }));
                    }
                }
            }
            
            if (data.type === 'UPDATE_POINTS') {
                if (ws.username && users[ws.username]) {
                    users[ws.username].points = data.points;
                    broadcastLeaderboard();
                }
            }
        } catch (e) {
            console.error("Błąd parsowania wiadomości:", e);
        }
    });

    ws.on('close', () => {
        onlineCount--;
        broadcastOnlineCount();
    });
});