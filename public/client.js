let ws;
let room = "room1";
let user = ""; // ← 名前はタイトル画面で決める

// ゲーム開始ボタンを押したとき
function startGame() {
  user = document.getElementById("playerName").value || 
         "Player" + Math.floor(Math.random()*1000);

  // タイトル画面 → ゲーム画面へ切り替え
  document.getElementById("titleScreen").style.display = "none";
  document.getElementById("gameScreen").style.display = "block";

  // WebSocket 接続開始
  ws = new WebSocket(
    (location.protocol === "https:" ? "wss://" : "ws://") + location.host
  );

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "join", room }));
  };

  ws.onmessage = e => {
    const data = JSON.parse(e.data);

    if (data.type === "chat") {
      document.getElementById("chat").innerHTML +=
        `<div><b>${data.user}:</b> ${data.text}</div>`;
    }

    if (data.type === "update") {
      updateGameState(data.state);
    }
  };

  // 手札表示
  renderHand();
}

// チャット送信
function sendChat() {
  const text = document.getElementById("msg").value;
  ws.send(JSON.stringify({ type: "chat", room, user, text }));
  document.getElementById("msg").value = "";
}

// ---------------------------
// ★ 手札（カード）表示部分
// ---------------------------

const cards = [
  { id: 1, name: "攻撃 +3", attack: 3 },
  { id: 2, name: "防御 +2", defense: 2 },
  { id: 3, name: "ドロー +1", draw: 1 }
];

function renderHand() {
  const handDiv = document.getElementById("hand");
  handDiv.innerHTML = "";

  cards.forEach(card => {
    const div = document.createElement("div");
    div.className = "card";
    div.innerText = card.name;
    div.onclick = () => playCard(card);
    handDiv.appendChild(div);
  });
}

function playCard(card) {
  ws.send(JSON.stringify({
    type: "playCard",
    room,
    user,
    card
  }));
}

function updateGameState(state) {
  console.log("Game state updated:", state);
}
