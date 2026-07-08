const WebSocket = require("ws");
const wss = new WebSocket.Server({ port: 8080 });

const rooms = {};

wss.on("connection", ws => {
  ws.on("message", msg => {
    const data = JSON.parse(msg);

    if (data.type === "join") {
      const room = rooms[data.room] ||= {
        players: [],
        state: {
          turn: 1,
          turnPlayer: null,
          actionPoints: 2,
          players: {},
          fieldEffect: null
        }
      };
      room.players.push(ws);
      room.state.players[data.user] = { hp: 20 };

      if (!room.state.turnPlayer) {
        room.state.turnPlayer = data.user;
      }

      broadcast(room, { type: "update", state: room.state });
      // ターン開始ドロー
      broadcast(room, { type: "turnStart", player: room.state.turnPlayer, draw: 1 });
    }

    if (data.type === "chat") {
      const room = rooms[data.room];
      broadcast(room, { type: "chat", user: data.user, text: data.text });
    }

    if (data.type === "playCard") {
      const room = rooms[data.room];
      let card = data.card;
      const target = data.target;

      // フィールド効果適用
      card = applyFieldEffect(room, card);

      // 攻撃
      if (card.attack) {
        room.state.players[target].hp -= card.attack;
        if (room.state.players[target].hp < 0) room.state.players[target].hp = 0;
      }

      // 全体攻撃
      if (card.attackAll) {
        Object.keys(room.state.players).forEach(name => {
          room.state.players[name].hp -= card.attackAll;
          if (room.state.players[name].hp < 0) room.state.players[name].hp = 0;
        });
      }

      // 防御・回復（ここでは自分にだけ）
      if (card.defense) {
        room.state.players[data.user].hp += card.defense;
        if (room.state.players[data.user].hp > 20) room.state.players[data.user].hp = 20;
      }
      if (card.healSelf) {
        room.state.players[data.user].hp += card.healSelf;
        if (room.state.players[data.user].hp > 20) room.state.players[data.user].hp = 20;
      }

      // 妨害
      if (card.disruptHand) {
        broadcast(room, { type: "disruptHand", target, amount: card.disruptHand });
      }
      if (card.revealHand) {
        broadcast(room, { type: "revealHand", target });
      }
      if (card.blockDraw) {
        broadcast(room, { type: "blockDraw", target });
      }
      if (card.stealDraw) {
        broadcast(room, { type: "stealDraw", target, thief: data.user });
      }
      if (card.skipTurn) {
        const names = Object.keys(room.state.players);
        const index = names.indexOf(room.state.turnPlayer);
        room.state.turnPlayer = names[(index + 2) % names.length];
        room.state.actionPoints = 2;
      }
      if (card.stealTurn) {
        room.state.turnPlayer = data.user;
        room.state.actionPoints = 2;
      }
      if (card.reduceAction) {
        room.state.actionPoints -= card.reduceAction;
        if (room.state.actionPoints < 0) room.state.actionPoints = 0;
      }

      // フィールド効果カード
      if (card.field) {
        room.state.fieldEffect = {
          type: card.field.type,
          duration: card.field.duration,
          name: card.name
        };
        broadcast(room, { type: "fieldEffect", effect: room.state.fieldEffect });
      }

      // 行動ポイント
      if (card.extraAction) {
        room.state.actionPoints += card.extraAction;
      }
      room.state.actionPoints--;

      // 勝敗判定
      if (room.state.players[target] && room.state.players[target].hp <= 0) {
        broadcast(room, { type: "gameOver", winner: data.user });
        return;
      }

      // 行動ポイントが尽きたら次ターン
      if (room.state.actionPoints <= 0) {
        nextTurn(room);
      } else {
        broadcast(room, { type: "update", state: room.state });
      }
    }

    if (data.type === "giveCard") {
      const room = rooms[data.room];
      broadcast(room, { type: "giveCard", card: data.card, to: data.to });
    }
  });
});

function broadcast(room, payload) {
  room.players.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  });
}

function nextTurn(room) {
  // フィールド効果のターン数減少
  if (room.state.fieldEffect) {
    room.state.fieldEffect.duration--;
    if (room.state.fieldEffect.duration <= 0) {
      room.state.fieldEffect = null;
      broadcast(room, { type: "fieldEnd" });
    }
  }

  const names = Object.keys(room.state.players);
  const index = names.indexOf(room.state.turnPlayer);
  const nextIndex = (index + 1) % names.length;
  room.state.turnPlayer = names[nextIndex];
  room.state.turn++;
  room.state.actionPoints = 2;

  broadcast(room, { type: "update", state: room.state });
  broadcast(room, { type: "turnStart", player: room.state.turnPlayer, draw: 1 });
}

function applyFieldEffect(room, card) {
  const effect = room.state.fieldEffect;
  if (!effect) return card;

  const c = JSON.parse(JSON.stringify(card)); // コピー

  switch (effect.type) {
    case "randomEffect":
      return allRandomCard();
    case "halfAttack":
      if (c.attack) c.attack = Math.floor(c.attack / 2);
      if (c.attackAll) c.attackAll = Math.floor(c.attackAll / 2);
      return c;
    case "doubleDraw":
      if (c.draw) c.draw *= 2;
      return c;
    case "lockAction":
      room.state.actionPoints = 1;
      return c;
    default:
      return c;
  }
}

function allRandomCard() {
  // 簡易版：攻撃3か防御3のどちらか
  const r = Math.random();
  if (r < 0.5) return { name: "ランダム攻撃 +3", attack: 3 };
  return { name: "ランダム防御 +3", defense: 3 };
}
