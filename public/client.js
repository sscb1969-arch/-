let ws;
let user = "";
let room = "";
let hand = [];
let redrawSelected = [];
let currentTurnPlayer = "";
let blockNextDraw = false;
let selectedCardIndex = null;

// ★ ゲーム開始
function startGame() {
  document.getElementById("startScreen").style.display = "none";
  document.getElementById("gameScreen").style.display = "block";
  document.getElementById("roomName").innerText = document.getElementById("room").value;
  connect();
}

// ★ カード一覧
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
  { id: 21, name: "妨害：手札公開", revealHand: true, rarity: "R" },
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

function connect() {
  user = document.getElementById("user").value.trim();
  room = document.getElementById("room").value.trim();

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
      const drawCount = 3;
      const newCards = drawCards(drawCount);
      newCards.forEach(c => animateCardAdd(c));
      hand.push(...newCards);
    }

    if (data.type === "attackEffect") {
      showDamage(data.target, data.amount);
    }

    if (data.type === "attackEffectAll") {
      Object.keys(data.players).forEach(name => {
        showDamage(name, data.amount);
      });
    }

    if (data.type === "fieldEffect") {
      document.getElementById("fieldEffect").innerText =
        `${data.effect.name}（残り${data.effect.duration}ターン）`;
    }

    if (data.type === "fieldEnd") {
      document.getElementById("fieldEffect").innerText = "なし";
    }

    if (data.type === "chat") {
      const chat = document.getElementById("chat");
      chat.innerHTML += `<div class="chatMsg"><b>${data.user}:</b> ${data.text}</div>`;
      chat.scrollTop = chat.scrollHeight;
    }
  };
}

// ★ カード引きアニメ
function animateCardAdd(card) {
  const handDiv = document.getElementById("hand");
  const div = document.createElement("div");
  div.className = "card " + card.rarity + " drawAnim";
  div.innerText = `${card.name}\n(${card.rarity})`;
  handDiv.appendChild(div);

  setTimeout(() => {
    renderHand();
  }, 300);
}

// ★ ダメージ演出
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

function updateGameState(state) {
  currentTurnPlayer = state.turnPlayer;
  document.getElementById("turnPlayer").innerText = state.turnPlayer;
  renderPlayerList(state.players);

  const targetSelect = document.getElementById("targetSelect");
  targetSelect.innerHTML = "";
  Object.keys(state.players).forEach(name => {
    if (name !== user) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.innerText = name;
      targetSelect.appendChild(opt);
    }
  });
}

function renderPlayerList(players) {
  const list = document.getElementById("playerList");
  list.innerHTML = "";
  Object.keys(players).forEach(name => {
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

function playSelectedCard() {
  if (user !== currentTurnPlayer) {
    alert("まだあなたのターンではありません");
    return;
  }
  if (selectedCardIndex === null) {
    alert("カードを選択してください");
    return;
  }

  const target = document.getElementById("targetSelect").value;
  const card = hand[selectedCardIndex];

  ws.send(JSON.stringify({
    type: "playCard",
    room,
    user,
    target,
    card
  }));

  hand.splice(selectedCardIndex, 1);
  selectedCardIndex = null;
  renderHand();
}

function sendChat() {
  const text = document.getElementById("msg").value;
  ws.send(JSON.stringify({ type: "chat", room, user, text }));
  document.getElementById("msg").value = "";
}
