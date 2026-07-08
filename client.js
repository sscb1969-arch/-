const ws = new WebSocket(
  (location.protocol === "https:" ? "wss://" : "ws://") + location.host
);

const room = "room1";
const user = "Player" + Math.floor(Math.random()*1000);

ws.onopen = () => {
  ws.send(JSON.stringify({ type: "join", room }));
};

ws.onmessage = e => {
  const data = JSON.parse(e.data);
  if (data.type === "chat") {
    document.getElementById("chat").innerHTML += `<div><b>${data.user}:</b> ${data.text}</div>`;
  }
};

function sendChat() {
  const text = document.getElementById("msg").value;
  ws.send(JSON.stringify({ type: "chat", room, user, text }));
  document.getElementById("msg").value = "";
}
