const express = require("express");
const app = express();
const server = require("http").createServer(app);
const WebSocket = require("ws");

const wss = new WebSocket.Server({ server });

app.use(express.static("public")); // public/index.html, client.js, style.css

// ---------------------------
// ルームデータ
// ---------------------------
const rooms = {};

// ---------------------------
// カード一覧
// ---------------------------
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

  { id: 100, name: "環境：効果ランダム化（1R）", field: { type: "randomEffect", duration: 1 }, rarity: "SR" },
  { id: 101, name: "環境：攻撃半減（2R）", field: { type: "halfAttack", duration: 2 }, rarity: "R" },
  { id: 103, name: "環境：ドロー2枚（1R）", field: { type: "doubleDraw", duration: 1 }, rarity: "SR" },
  { id: 104, name: "環境：行動固定（1R）", field: { type: "lockAction", duration: 1 }, rarity: "R" }
];

// ---------------------------
// カードを引く（サーバー側）
// ---------------------------
function drawCard() {
  const r = Math.random();
  let pool;
  if (r < 0.60) pool = allCards.filter(c => c.rarity === "N");
  else if (r < 0.85) pool = allCards.filter(c => c.rarity === "R");
  else if (r < 0.95) pool = allCards.filter(c => c.rarity === "SR");
  else pool = allCards.filter(c => c.rarity === "UR");
  return pool[Math.floor(Math.random() * pool.length)];
}

// ---------------------------
// カード使用ログ（チャット送信）
// ---------------------------
function sendCardLog(room, user, card, target) {
  let text = "";

  if (card.field) {
    text = `${user} が「${card.name}」を発動`;
  } else if (card.attackAll) {
    text = `${user} が「${card.name}」を使用（全体攻撃）`;
  } else if (card.attack) {
    text = `${user} が「${card.name}」を ${target} に使用`;
  } else if (card.disruptHand || card.stealCard || card.skipTurn || card.stealTurn) {
    text = `${user} が「${card.name}」を ${target} に使用`;
  } else {
    text = `${user} が「${card.name}」を使用`;
  }

  broadcast(room, {
    type: "chat",
    user: "SYSTEM",
    text
  });
}

// ---------------------------
// WebSocket 接続
// ---------------------------
wss.on("connection", ws => {
  ws.currentRoom = null;

  ws.on("message", raw => {
    const msg = JSON.parse(raw);
    const { type, room, user } = msg;

    if (room) ws.currentRoom = room;

    if (!rooms[room]) {
      rooms[room] = {
        players: {},
        turnOrder: [],
        turnPlayer: null,
        round: 1,
        fieldEffect: null
      };
    }

    const state = rooms[room];

    // ---------------------------
    // join：カードは絶対に引かない
    // ---------------------------
    if (type === "join") {
      if (!state.players[user]) {
        state.players[user] = {
          hp: 20,
          blockOnce: false,
          reflect: false,
          reduceIncoming: false,
          blockDisrupt: false,
          redrawCooldown: 0,
          started: false
        };
        state.turnOrder.push(user);
      }

      // 最初のプレイヤーだけ即座に初期手札3枚
      if (!state.turnPlayer) {
        state.turnPlayer = user;
        state.players[user].started = true;

        setTimeout(() => {
          broadcast(room, {
            type: "turnStart",
            player: user,
            draw: 3
          });
        }, 200);
      }

      broadcast(room, {
        type: "update",
        state: {
          players: state.players,
          turnOrder: state.turnOrder,
          turnPlayer: state.turnPlayer,
          round: state.round,
          fieldEffect: state.fieldEffect
        }
      });
      return;
    }

    // ---------------------------
    // チャット
    // ---------------------------
    if (type === "chat") {
      broadcast(room, {
        type: "chat",
        user,
        text: msg.text
      });
      return;
    }

    // ---------------------------
    // 引き直し（2ターンに1回）
// ---------------------------
    if (type === "redraw") {
      const p = state.players[user];

      if (p.redrawCooldown > 0) {
        ws.send(JSON.stringify({
          type: "error",
          message: `引き直しはあと ${p.redrawCooldown} ターン使えません`
        }));
        return;
      }

      const newHand = [];
      for (let i = 0; i < msg.handSize; i++) {
        newHand.push(drawCard());
      }

      ws.send(JSON.stringify({
        type: "redrawResult",
        newHand
      }));

      p.redrawCooldown = 2;
      return;
    }

    // ---------------------------
    // カード使用
    // ---------------------------
    if (type === "playCard") {
      const card = msg.card;
      const target = msg.target;

      // カード使用ログ
      sendCardLog(room, user, card, target);

      // 環境カード
      if (card.field) {
        state.fieldEffect = {
          name: card.name,
          type: card.field.type,
          duration: card.field.duration
        };

        nextTurn(room);
        return;
      }

      // 攻撃・妨害系は target 必須（全体攻撃除く）
      const needsTarget =
        card.attack ||
        card.disruptHand ||
        card.stealCard ||
        card.skipTurn ||
        card.stealTurn;

      if (needsTarget && !target) {
        ws.send(JSON.stringify({
          type: "error",
          message: "攻撃対象を選んでください"
        }));
        return;
      }

      // 防御カードセット
      if (card.blockOnce) state.players[user].blockOnce = true;
      if (card.reflect) state.players[user].reflect = true;
      if (card.reduceIncoming) state.players[user].reduceIncoming = true;
      if (card.blockDisrupt) state.players[user].blockDisrupt = true;

      // 攻撃処理
      if (card.attack) {
        const p = state.players[target];
        if (!p) {
          ws.send(JSON.stringify({
            type: "error",
            message: "対象プレイヤーが存在しません"
          }));
          return;
        }

        let atk = card.attack;

        // 環境：攻撃半減
        if (state.fieldEffect && state.fieldEffect.type === "halfAttack") {
          atk = Math.floor(atk * 0.5);
        }

        if (p.blockOnce) {
          p.blockOnce = false;
          broadcast(room, { type: "effect", target, text: "完全防御", color: "blue" });
        } else if (p.reflect) {
          p.reflect = false;
          state.players[user].hp -= atk;
          broadcast(room, { type: "effect", target, text: "反射", color: "blue" });
        } else if (p.reduceIncoming) {
          p.reduceIncoming = false;
          const dmg = Math.floor(atk * 0.5);
          p.hp -= dmg;
          broadcast(room, { type: "attackEffect", target, amount: dmg });
        } else {
          p.hp -= atk;
          broadcast(room, { type: "attackEffect", target, amount: atk });
        }

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

      // 全体攻撃
      if (card.attackAll) {
        let amount = card.attackAll;

        if (state.fieldEffect && state.fieldEffect.type === "halfAttack") {
          amount = Math.floor(amount * 0.5);
        }

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

      // 妨害
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

        const pNext = state.players[user];
        let draw = 1;
        if (!pNext.started) {
          draw = 3;
          pNext.started = true;
        }

        broadcast(room, {
          type: "turnStart",
          player: user,
          draw
        });

        broadcast(room, {
          type: "update",
          state: {
            players: state.players,
            turnOrder: state.turnOrder,
            turnPlayer: state.turnPlayer,
            round: state.round,
            fieldEffect: state.fieldEffect
          }
        });
        return;
      }

      nextTurn(room);
    }
  });
});

// ---------------------------
// ターン進行（1手番＝1ターン）
// 全員のターンが終わると1ラウンド経過
// ---------------------------
function nextTurn(room) {
  const state = rooms[room];

  // 引き直しクールダウン減少
  state.turnOrder.forEach(name => {
    const p = state.players[name];
    if (p.redrawCooldown > 0) p.redrawCooldown--;
  });

  const idx = state.turnOrder.indexOf(state.turnPlayer);
  let next = idx + 1;

  // 一周したらラウンド進行
  if (next >= state.turnOrder.length) {
    next = 0;
    state.round++;

    // 環境効果のラウンド減少
    if (state.fieldEffect) {
      state.fieldEffect.duration--;

      if (state.fieldEffect.duration <= 0) {
        state.fieldEffect = null;

        broadcast(room, {
          type: "chat",
          user: "SYSTEM",
          text: "環境効果が終了しました"
        });
      }
    }
  }

  state.turnPlayer = state.turnOrder[next];

  const pNext = state.players[state.turnPlayer];
  let draw = 1;
  if (!pNext.started) {
    draw = 3;
    pNext.started = true;
  }

  broadcast(room, {
    type: "turnStart",
    player: state.turnPlayer,
    draw
  });

  broadcast(room, {
    type: "update",
    state: {
      players: state.players,
      turnOrder: state.turnOrder,
      turnPlayer: state.turnPlayer,
      round: state.round,
      fieldEffect: state.fieldEffect
    }
  });
}

// ---------------------------
// 送信（room ごと）
// ---------------------------
function broadcast(room, obj) {
  wss.clients.forEach(client => {
    if (client.readyState !== WebSocket.OPEN) return;
    if (client.currentRoom !== room) return;
    client.send(JSON.stringify(obj));
  });
}

// ---------------------------
// Render 用ポート
// ---------------------------
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
