// School Hide & Seek - lobby server (ws). Created by NH Nirob.
const http = require("http");
const { WebSocketServer } = require("ws");

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Access-Control-Allow-Origin": "*", "Content-Type": "text/plain" });
  res.end("School Hide & Seek server OK");
});
const wss = new WebSocketServer({ server });
const rooms = new Map();
let nid = 1;

const send = (ws, t, d) => { if (ws.readyState === 1) ws.send(JSON.stringify({ t, d })); };
const pub = (r) => ({
  code: r.code, host: r.host, phase: r.phase,
  players: [...r.players.values()].map((p) => ({ id: p.id, name: p.name, ready: p.ready })),
});
const sync = (r) => { const m = pub(r); for (const p of r.players.values()) send(p.ws, "lobby", m); };

function leave(ws) {
  const r = ws.room;
  if (!r) return;
  r.players.delete(ws.id);
  ws.room = null;
  if (!r.players.size) { rooms.delete(r.code); return; }
  if (r.host === ws.id) r.host = r.players.keys().next().value;
  sync(r);
}

wss.on("connection", (ws) => {
  ws.id = "p" + nid++;
  ws.room = null;
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });
  ws.on("message", (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    const d = m.d || {};
    if (m.t === "create" || m.t === "join") {
      leave(ws);
      const code = String(d.code || "").toUpperCase().slice(0, 5);
      const name = String(d.name || "Player").slice(0, 12);
      let r = rooms.get(code);
      if (m.t === "create") {
        if (r) return send(ws, "err", "Code already in use, try again");
        r = { code, host: null, phase: "lobby", players: new Map() };
        rooms.set(code, r);
      } else {
        if (!r) return send(ws, "err", "Room " + code + " not found");
        if (r.phase !== "lobby") return send(ws, "err", "Match already started");
        if (r.players.size >= 10) return send(ws, "err", "Room is full");
      }
      ws.room = r;
      r.players.set(ws.id, { id: ws.id, name, ready: false, ws });
      if (!r.host) r.host = ws.id;
      send(ws, "joined", { id: ws.id });
      sync(r);
      return;
    }
    const r = ws.room;
    if (!r) return;
    const p = r.players.get(ws.id);
    if (m.t === "ready" && r.phase === "lobby" && p) { p.ready = !!d.v; sync(r); }
    else if (m.t === "start" && ws.id === r.host && r.phase === "lobby" &&
             [...r.players.values()].every((x) => x.ready)) {
      r.phase = "started";
      for (const x of r.players.values()) send(x.ws, "start", {});
      sync(r);
    }
  });
  ws.on("close", () => leave(ws));
});

setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 25000);

server.listen(process.env.PORT || 2567);
console.log("Server listening");
