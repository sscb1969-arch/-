const express = require("express");
const app = express();
const server = require("http").createServer(app);
const WebSocket = require("ws");

const wss = new WebSocket.Server({ server });

app.use(express.static("public")); // ← index.html, client.js, style.css を置く場所

const rooms = {};

// ★ カード一覧（client.js と同じものをここに置く）
const allCards = [
  { id: 1, name: "攻撃 +3", attack: 3, rarity: "N" },
  { id: 2, name: "強攻撃 +6", attack: 6, extraAction: -1, rarity: "R" },
  { id: 3, name: "連撃 2回", attackMulti: 2, rarity: "SR" },
  { id: 4, name: "貫通攻撃 +4", attack: 4, pierce: true, rarity: "R" },
  { id: 5, name: "吸収攻撃 +3 回復2", attack: 3, healSelf: 2, rarity: "SR" },
  { id: 6, name: "妨害攻撃", attack: 2, reduceAction: 1, rarity: "SR" },
  { id: 7, name: "全体攻撃 +2", attackAll: 2, rarity: "UR" },
  { id: 8, name: "追行動攻撃 +2", attack: 2, extraAction: 1, rarity: "SR" },

  { id: 11, name: "防御 +3", defense: 3, rarity: "N" },
  { id: 12, name: "強防御 +6", defense: 6, extraAction: -1, rarity: "R" },
  { id: 13, name: "軽減（半減）", reduceIncoming: 0.5, rarity: "R" },
  { id: 14, name: "反射 2", reflect: 2, rarity: "SR" },
  { id: 15, name: "完全防御", blockOnce: true, rarity: "SR" },
  { id: 16, name: "妨害無効", blockDisrupt: true, rarity: "SR" },

  { id: 20, name: "妨害：手札破壊", disruptHand: 1, rarity: "R" },
  { id: 22, name: "妨害：手札交換", stealCard: true, rarity: "SR" },
  { id: 23, name: "妨害：ターンスキップ", skipTurn: true, rarity: "SR" },
  { id: 24, name: "妨害：ターン奪取", stealTurn: true, rarity: "SR" },
  { id: 25, name: "妨害：行動-1", reduceAction: 1, rarity: "SR" },
  { id: 27, name: "妨害：ドロー封印", blockDraw: true, rarity: "R" },
  { id: 28, name: "妨害：ドロー逆転", stealDraw: true, rarity: "SR" },

  { id: 100, name: "環境：効果ランダム化（1T）", field: { type: "randomEffect", duration: 1 }, rarity: "SR" },
  { id: 101, name: "環境：攻撃半減（2T）", field: { type: "halfAttack", duration: 2 }, rarity: "R" },
  { id: 103, name: "環境：ドロー2枚（1T）", field: { type: "doubleDraw", duration: 1 }, rarity: "SR" },
  { id: 104, name: "環境：行動固定（1T）", field: { type: "lockAction", duration: 1 }, rarity: "R" }
];

// ★ カードを引く
function drawCard() {
  const r = Math.random();
  let pool;
  if (r < 0.60) pool = allCards.filter(c => c.rarity === "N");
  else if (r < 0.85) pool = allCards.filter(c => c.rarity === "R");
  else if (r < 0.95) pool = allCards.filter(c => c.rarity === "SR");
  else pool = allCards.filter(c => c.rarity === "UR");
  return pool[Math.floor(Math.random() * pool.length)];
}

// ★ WebSocket 接続
wss.on("connection", ws => {
  ws.on("message", raw => {
    const msg = JSON.parse(raw);
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

      // ★最初のプレイヤーに初期手札3枚
      if (!state.turnPlayer) {
        state.turnPlayer = user;

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

      // 防御カードセット
      if (card.blockOnce) state.players[user].blockOnce = true;
      if (card.reflect) state.players[user].reflect = true;
      if (card.reduceIncoming) state.players[user].reduceIncoming = true;
      if (card.blockDisrupt) state.players[user].blockDisrupt = true;

      // ★攻撃処理
      if (card.attack) {
        const p = state.players[target];

        if (p.blockOnce) {
          p.blockOnce = false;
          broadcast(room, { type: "effect", target, text: "完全防御", color: "blue" });
        } else if (p.reflect) {
          p.reflect = false;
          state.players[user].hp -= card.attack;
          broadcast(room, { type: "effect", target, text: "反射", color: "blue" });
        } else if (p.reduceIncoming) {
          p.reduceIncoming = false;
          const dmg = Math.floor(card.attack * 0.5);
          p.hp -= dmg;
          broadcast(room, { type: "attackEffect", target, amount: dmg });
        } else {
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
          state.players[name].hp -= amount;
          targets.push(name);
        });

        broadcast(room, {
          type: "attackEffectAll",
          amount,
          targets
        });
      }

      // ★妨害
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
        nextTurn(room);
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

      // ★ターン終了
      nextTurn(room);
    }
  });
});

// ★ターン進行
function nextTurn(room) {
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

// ★ Render 用ポート設定
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
