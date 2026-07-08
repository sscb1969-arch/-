const WebSocket = require("ws");
const wss = new WebSocket.Server({ port: 8080 });

const rooms = {};

function drawCard() {
  const r = Math.random();
  let pool;
  if (r < 0.60) pool = allCards.filter(c => c.rarity === "N");
  else if (r < 0.85) pool = allCards.filter(c => c.rarity === "R");
  else if (r < 0.95) pool = allCards.filter(c => c.rarity === "SR");
  else pool = allCards.filter(c => c.rarity === "UR");
  return pool[Math.floor(Math.random() * pool.length)];
}

wss.on("connection", ws => {
  ws.on("message", msg => {
    msg = JSON.parse(msg);

    const { type, room, user } = msg;

    if (!rooms[room]) {
      rooms[room] = {
        players: {},
        turnOrder: [],
        turnPlayer: null
      };
    }

    const state = rooms[room];

    // ★ join：カードは引かない
    if (type === "join") {
      if (!state.players[user]) {
        state.players[user] = {
          hp: 20,
          blockOnce: false,
          reflect: false,
          reduceIncoming: false,
          blockDisrupt: false
        };
        state.turnOrder.push(user);
      }

      if (!state.turnPlayer) {
        state.turnPlayer = user;

        // ★初期手札3枚
        broadcast(room, {
          type: "turnStart",
          player: user,
          draw: 3
        });
      }

      broadcast(room, {
        type: "update",
        state
      });
      return;
    }

    // ★チャット
    if (type === "chat") {
      broadcast(room, {
        type: "chat",
        user,
        text: msg.text
      });
      return;
    }

    // ★カード使用
    if (type === "playCard") {
      const card = msg.card;
      const target = msg.target;

      // 防御カードのセット
      if (card.blockOnce) state.players[user].blockOnce = true;
      if (card.reflect) state.players[user].reflect = true;
      if (card.reduceIncoming) state.players[user].reduceIncoming = true;
      if (card.blockDisrupt) state.players[user].blockDisrupt = true;

      // ★攻撃カード
      if (card.attack) {
        const p = state.players[target];

        // 完全防御
        if (p.blockOnce) {
          p.blockOnce = false;
          broadcast(room, { type: "effect", target, text: "完全防御", color: "blue" });
        }

        // 反射
        else if (p.reflect) {
          p.reflect = false;
          state.players[user].hp -= card.attack;
          broadcast(room, { type: "effect", target, text: "反射", color: "blue" });
        }

        // 軽減
        else if (p.reduceIncoming) {
          p.reduceIncoming = false;
          const dmg = Math.floor(card.attack * 0.5);
          p.hp -= dmg;
          broadcast(room, { type: "attackEffect", target, amount: dmg });
        }

        // 通常攻撃
        else {
          p.hp -= card.attack;
          broadcast(room, { type: "attackEffect", target, amount: card.attack });
        }

        // ★死亡判定
        if (p.hp <= 0) {
          const rankings = Object.keys(state.players)
            .map(name => ({ name, hp: state.players[name].hp }))
            .sort((a, b) => b.hp - a.hp);

          broadcast(room, {
            type: "gameOver",
            winner: user,
            rankings
          });
          return;
        }
      }

      // ★全体攻撃
      if (card.attackAll) {
        const amount = card.attackAll;
        const targets = [];

        state.turnOrder.forEach(name => {
          const p = state.players[name];
          p.hp -= amount;
          targets.push(name);
        });

        broadcast(room, {
          type: "attackEffectAll",
          amount,
          targets
        });
      }

      // ★妨害カード
      if (card.disruptHand) {
        broadcast(room, {
          type: "disruptHand",
          target,
          amount: card.disruptHand
        });
      }

      if (card.stealCard) {
        broadcast(room, {
          type: "stealDraw",
          target,
          thief: user
        });
      }

      if (card.skipTurn) {
        nextTurn(room, true);
        return;
      }

      if (card.stealTurn) {
        state.turnPlayer = user;
        broadcast(room, {
          type: "turnStart",
          player: user,
          draw: 1
        });
        return;
      }

      // ★ターン終了 → 次のターンへ
      nextTurn(room, false);
    }
  });
});

// ★ターン進行
function nextTurn(room, skip) {
  const state = rooms[room];
  const idx = state.turnOrder.indexOf(state.turnPlayer);

  let next = idx + 1;
  if (next >= state.turnOrder.length) next = 0;

  state.turnPlayer = state.turnOrder[next];

  broadcast(room, {
    type: "turnStart",
    player: state.turnPlayer,
    draw: 1 // ★ターン開始時は必ず1枚
  });

  broadcast(room, {
    type: "update",
    state
  });
}

// ★送信
function broadcast(room, obj) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(obj));
    }
  });
}
