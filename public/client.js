function connect() {
  user = document.getElementById("user").value;
  room = document.getElementById("room").value;

  // ★ ローカル開発なら ws://localhost:8080
  // ★ Render 本番なら wss:// + location.host
  const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  const wsUrl = isLocal
    ? "ws://localhost:8080"
    : `wss://${location.host}`;

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
      if (data.player === user) {
        if (!blockNextDraw) {
          const newCards = drawCards(data.draw);
          hand.push(...newCards);
          renderHand();
        } else {
          blockNextDraw = false;
        }
      }
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

    // 妨害系
    if (data.type === "disruptHand" && data.target === user) {
      for (let i = 0; i < data.amount; i++) {
        if (hand.length > 0) {
          const index = Math.floor(Math.random() * hand.length);
          hand.splice(index, 1);
        }
      }
      renderHand();
    }

    if (data.type === "revealHand" && data.target === user) {
      alert("あなたの手札：" + hand.map(c => c.name).join(", "));
    }

    if (data.type === "blockDraw" && data.target === user) {
      blockNextDraw = true;
    }

    if (data.type === "stealDraw" && data.target === user) {
      const stolen = drawCards(1)[0];
      ws.send(JSON.stringify({
        type: "giveCard",
        card: stolen,
        to: data.thief,
        room
      }));
    }

    if (data.type === "giveCard" && data.to === user) {
      hand.push(data.card);
      renderHand();
    }

    if (data.type === "gameOver") {
      alert(`勝者: ${data.winner}`);
    }
  };
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
}

function renderPlayerList(players) {
  const list = document.getElementById("playerList");
  list.innerHTML = "";
  Object.keys(players).forEach(name => {
    const box = document.createElement("div");
    box.className = "playerBox";
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
    if (redrawSelected.includes(i)) {
      div.style.border = "3px solid red";
    }
    div.onclick = () => toggleRedraw(i);
    handDiv.appendChild(div);
  });
}

function toggleRedraw(i) {
  if (redrawSelected.includes(i)) {
    redrawSelected = redrawSelected.filter(x => x !== i);
  } else {
    if (redrawSelected.length < 2) redrawSelected.push(i);
  }
  renderHand();
}

function redraw() {
  if (user !== currentTurnPlayer) return;
  redrawSelected.forEach(i => {
    hand[i] = drawCards(1)[0];
  });
  redrawSelected = [];
  renderHand();
}

function playSelectedCard() {
  if (user !== currentTurnPlayer) {
    alert("まだあなたのターンではありません");
    return;
  }
  const target = document.getElementById("target").value;
  const card = hand[0]; // とりあえず先頭を出す例。ここはUIで選択に変えてもいい。
  if (!card) return;

  ws.send(JSON.stringify({
    type: "playCard",
    room,
    user,
    target,
    card
  }));

  hand.shift();
  renderHand();
}

function sendChat() {
  const text = document.getElementById("msg").value;
  ws.send(JSON.stringify({ type: "chat", room, user, text }));
  document.getElementById("msg").value = "";
}
