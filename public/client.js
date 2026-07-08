let ws;
let user = "";
let room = "";
let hand = [];
let currentTurnPlayer = "";
let selectedCardIndex = null;
let playedThisTurn = false;

// カード一覧（クライアント側表示用）
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

function startGame() {
  document.getElementById("startScreen").style.display = "none";
  document.getElementById("gameScreen").style.display = "block";

  user = document.getElementById("user").value.trim();
  room = document.getElementById("room").value.trim();

  connect();
}

function connect() {
  const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  const wsUrl = isLocal ? "ws://localhost:8080" : `wss://${location.host}`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "join", user, room }));
  };

  ws.onmessage = e => {
    const data = JSON.parse(e.data);

    if (data.type === "update") {
      updateGameState(data.state);
    }

    if (data.type === "turnStart") {
      playedThisTurn = false;
      currentTurnPlayer = data.player;

      const drawCount = data.draw || 0;
      const newCards = drawCards(drawCount);

      newCards.forEach(c => animateCardAdd(c));
      hand.push(...newCards);
    }

    if (data.type === "attackEffect") {
      showDamage(data.target, data.amount);
    }

    if (data.type === "attackEffectAll") {
      data.targets.forEach(name => showDamage(name, data.amount));
    }

    if (data.type === "chat") {
      const chat = document.getElementById("chat");
      chat.innerHTML += `<div class="chatMsg"><b>${data.user}:</b> ${data.text}</div>`;
      chat.scrollTop = chat.scrollHeight;
    }

    if (data.type === "gameOver") {
      showVictory(data.winner, data.rankings);
    }

    if (data.type === "redrawResult") {
      hand = data.newHand;
      selectedCardIndex = null;
      renderHand();
    }

    if (data.type === "error") {
      alert(data.message);
    }
  };
}

// ---------------------------
// カードドロー（クライアント側）
// ---------------------------
function drawCards(n) {
  const result = [];
  for (let i = 0; i < n; i++) {
    const r = Math.random();
    let pool;
    if (r < 0.60) pool = allCards.filter(c => c.rarity === "N");
    else if (r < 0.85) pool = allCards.filter(c => c.rarity === "R");
    else if (r < 0.95) pool = allCards.filter(c => c.rarity === "SR");
    else pool = allCards.filter(c => c.rarity === "UR");
    result.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  return result;
}

// ---------------------------
// UI：カード追加アニメ
// ---------------------------
function animateCardAdd(card) {
  const handDiv = document.getElementById("hand");
  const div = document.createElement("div");
  div.className = "card " + card.rarity + " drawAnim";
  div.innerText = `${card.name}\n(${card.rarity})`;
  handDiv.appendChild(div);

  setTimeout(() => renderHand(), 300);
}

// ---------------------------
// UI：ダメージ演出
// ---------------------------
function showDamage(targetName, amount) {
  const targetBox = document.getElementById("player_" + targetName);
  if (!targetBox) return;

  targetBox.classList.add("playerHit");

  const dmg = document.createElement("div");
  dmg.className = "damageEffect";
  dmg.innerText = "-" + amount;

  targetBox.appendChild(dmg);

  setTimeout(() => {
    dmg.remove();
    targetBox.classList.remove("playerHit");
  }, 800);
}

// ---------------------------
// UI：勝利演出
// ---------------------------
function showVictory(winner, rankings) {
  const overlay = document.createElement("div");
  overlay.id = "victoryOverlay";
  overlay.innerHTML = `
    <div class="victoryBox">
      <h1>勝者：${winner}</h1>
      <h2>順位</h2>
      <ol>
        ${rankings.map(p => `<li>${p.name}（HP: ${p.hp}）</li>`).join("")}
      </ol>
    </div>
  `;
  document.body.appendChild(overlay);
}

// ---------------------------
// ゲーム状態更新
// ---------------------------
function updateGameState(state) {
  currentTurnPlayer = state.turnPlayer;

  document.getElementById("turnPlayer").innerText = state.turnPlayer;
  document.getElementById("roundNumber").innerText = state.round;

  // 環境効果表示
  const envBox = document.getElementById("environmentEffect");
  if (state.fieldEffect) {
    envBox.innerText = `${state.fieldEffect.name}（残り ${state.fieldEffect.duration} R）`;
  } else {
    envBox.innerText = "なし";
  }

  renderPlayerList(state.players, state.turnOrder);

  // 引き直しクールダウン表示
  if (state.players[user]) {
    updateRedrawCooldown(state.players[user].redrawCooldown || 0);
  }

  // 攻撃対象リスト
  const targetSelect = document.getElementById("targetSelect");
  targetSelect.innerHTML = "";
  state.turnOrder.forEach(name => {
    if (name !== user) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.innerText = name;
      targetSelect.appendChild(opt);
    }
  });
}

// ---------------------------
// プレイヤー一覧描画
// ---------------------------
function renderPlayerList(players, order) {
  const list = document.getElementById("playerList");
  list.innerHTML = "";

  order.forEach(name => {
    const box = document.createElement("div");
    box.className = "playerBox";
    box.id = "player_" + name;

    const hpPercent = (players[name].hp / 20) * 100;

    box.innerHTML = `
      <div>${name}（HP: ${players[name].hp}）</div>
      <div class="hpBar"><div class="hpFill" style="width:${hpPercent}%"></div></div>
    `;
    list.appendChild(box);
  });
}

// ---------------------------
// 手札描画
// ---------------------------
function renderHand() {
  const handDiv = document.getElementById("hand");
  handDiv.innerHTML = "";

  hand.forEach((card, i) => {
    const div = document.createElement("div");
    div.className = "card " + card.rarity;
    div.innerText = `${card.name}\n(${card.rarity})`;

    if (selectedCardIndex === i) {
      div.style.border = "3px solid yellow";
    }

    div.onclick = () => {
      selectedCardIndex = i;
      renderHand();
    };

    handDiv.appendChild(div);
  });
}

// ---------------------------
// 引き直しクールダウン表示
// ---------------------------
function updateRedrawCooldown(cd) {
  const text = document.getElementById("redrawCooldownText");
  const btn = document.getElementById("redrawBtn");

  if (cd > 0) {
    text.innerText = `（あと ${cd} ターン）`;
    btn.classList.add("disabled");
  } else {
    text.innerText = "";
    btn.classList.remove("disabled");
  }
}

// ---------------------------
// カード使用
// ---------------------------
function playSelectedCard() {
  if (user !== currentTurnPlayer) {
    alert("まだあなたのターンではありません");
    return;
  }
  if (selectedCardIndex === null) {
    alert("カードを選択してください");
    return;
  }

  const card = hand[selectedCardIndex];

  const isDefense =
    card.defense ||
    card.healSelf ||
    card.blockOnce ||
    card.blockDisrupt ||
    card.reduceIncoming ||
    card.reflect;

  if (!isDefense && playedThisTurn) {
    alert("攻撃・妨害カードは1ターンに1枚までです");
    return;
  }

  const target = document.getElementById("targetSelect").value;

  ws.send(JSON.stringify({
    type: "playCard",
    room,
    user,
    target,
    card
  }));

  if (!isDefense) playedThisTurn = true;

  hand.splice(selectedCardIndex, 1);
  selectedCardIndex = null;
  renderHand();
}

// ---------------------------
// 引き直し
// ---------------------------
function redraw() {
  if (user !== currentTurnPlayer) {
    alert("あなたのターンではありません");
    return;
  }

  ws.send(JSON.stringify({
    type: "redraw",
    room,
    user,
    handSize: hand.length
  }));
}

// ---------------------------
// チャット送信
// ---------------------------
function sendChat() {
  const text = document.getElementById("msg").value;
  ws.send(JSON.stringify({ type: "chat", room, user, text }));
  document.getElementById("msg").value = "";
}
