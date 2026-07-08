// WebSocket 接続（Render対応）
const ws = new WebSocket(
  (location.protocol === "https:" ? "wss://" : "ws://") + location.host
);

const room = "room1";
const user = "Player" + Math.floor(Math.random() * 1000);

// 接続時にルーム参加
ws.onopen = () => {
  ws.send(JSON.stringify({ type: "join", room }));
};

// メッセージ受信
ws.onmessage = e => {
  const data = JSON.parse(e.data);

  // チャット表示
  if (data.type === "chat") {
    document.getElementById("chat").innerHTML +=
      `<div><b>${data.user}:</b> ${data.text}</div>`;
  }

  // ゲーム状態更新（カードプレイ後）
  if (data.type === "update") {
    updateGameState(data.state);
  }
};

// チャット送信
function sendChat() {
  const text = document.getElementById("msg").value;
  ws.send(JSON.stringify({ type: "chat", room, user, text }));
  document.getElementById("msg").value = "";
}

// ---------------------------
// ★ 手札（カード）表示部分
// ---------------------------

// 手札の例（自由に増やせる）
const cards = [
  { id: 1, name: "攻撃 +3", attack: 3 },
  { id: 2, name: "防御 +2", defense: 2 },
  { id: 3, name: "ドロー +1", draw: 1 }
];

// 手札を画面に表示
function renderHand() {
  const handDiv = document.getElementById("hand");
  handDiv.innerHTML = ""; // 初期化

  cards.forEach(card => {
    const div = document.createElement("div");
    div.className = "card";
    div.innerText = card.name;
    div.onclick = () => playCard(card);
    handDiv.appendChild(div);
  });
}

// カードをプレイ
function playCard(card) {
  ws.send(JSON.stringify({
    type: "playCard",
    room,
    user,
    card
  }));
}

// サーバーからのゲーム状態更新
function updateGameState(state) {
  // 必要なら HP やターン情報をここで更新
  console.log("Game state updated:", state);
}

// 初期手札表示
renderHand();
