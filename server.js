const express = require("express");
const app = express();
const server = require("http").createServer(app);
const WebSocket = require("ws");
const wss = new WebSocket.Server({ server });

app.use(express.static("public")); // ← これで index.html を公開

let rooms = {};

wss.on("connection", ws => {
  ws.on("message", msg => {
    const data = JSON.parse(msg);

    if (data.type === "join") {
      const room = rooms[data.room] ||= { players: [], state: {} };
      room.players.push(ws);
      broadcast(room, { type: "system", text: "プレイヤーが参加しました" });
    }

    if (data.type === "chat") {
      const room = rooms[data.room];
      broadcast(room, { type: "chat", user: data.user, text: data.text });
    }

    if (data.type === "playCard") {
      const room = rooms[data.room];
      broadcast(room, { type: "update", state: data.state });
    }
  });
});

function broadcast(room, obj) {
  room.players.forEach(p => p.send(JSON.stringify(obj)));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server running on " + PORT));
