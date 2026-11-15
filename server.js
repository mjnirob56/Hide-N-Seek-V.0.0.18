// School Hide & Seek - online server (ws). Created by NH Nirob.
const http = require("http");
const { WebSocketServer } = require("ws");
const BOTS = ["Rafi","Tuli","Sumi","Babu","Mitu","Jony","Lima","Raju","Nila","Sajib"];
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Access-Control-Allow-Origin": "*", "Content-Type": "text/plain" });
  res.end("School Hide & Seek server OK");
});
const wss = new WebSocketServer({ server });
const rooms = new Map();
let nid = 1;
const send = (ws, t, d) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t, d })); };
const pub = (r) => ({
  code: r.code, host: r.host, phase: r.phase,
  players: [...r.players.values()].map((p) => ({ id: p.id, name: p.name, ready: p.ready })),
  bots: BOTS.slice(0, r.bots),
});
const sync = (r) => { const m = pub(r); for (const p of r.players.values()) send(p.ws, "lobby", m); };
const all = (r, t, d, except) => { for (const p of r.players.values()) if (p.ws && p.ws !== except) send(p.ws, t, d); };

function startMatch(r) {
  if (r.players.size + r.bots < 5) r.bots = 5 - r.players.size;
  r.phase = "started";
  r.live = false;
  r.attached = new Set();
  r.roster = [...r.players.values()].map((p) => ({ id: p.id, name: p.name, bot: 0 }));
  for (let i = 0; i < r.bots; i++) r.roster.push({ id: "b" + i, name: BOTS[i], bot: 1 });
  all(r, "start", {});
  r.timer = setTimeout(() => go(r), 20000);
}
function go(r) {
  if (r.live) return;
  clearTimeout(r.timer);
  r.live = true;
  for (const p of [...r.players.values()]) if (!r.attached.has(p.id)) r.players.delete(p.id);
  r.roster = r.roster.filter((x) => x.bot || r.players.has(x.id));
  if (!r.players.size) { rooms.delete(r.code); return; }
  r.host = r.players.keys().next().value;
  r.seeker = r.roster[Math.floor(Math.random() * r.roster.length)].id;
  all(r, "go", { roster: r.roster, seeker: r.seeker, host: r.host });
}
function drop(r, id) {
  r.players.delete(id);
  r.roster = r.roster.filter((x) => x.id !== id);
  all(r, "left", { id });
  if (!r.players.size) { rooms.delete(r.code); return; }
  if (r.host === id) { r.host = r.players.keys().next().value; all(r, "host", { host: r.host }); }
  if (r.seeker === id) all(r, "ev", { k: "end", w: "h" });
}
function leave(ws) {
  const r = ws.room;
  if (!r) return;
  ws.room = null;
  if (r.phase === "started") {
    const p = r.players.get(ws.id);
    if (!p || p.ws !== ws) return;
    p.ws = null;
    if (r.live) drop(r, ws.id);
    return;
  }
  r.players.delete(ws.id);
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
    if (m.t === "attach") {
      const r = rooms.get(String(d.code || "").toUpperCase());
      const p = r && r.players.get(d.id);
      if (!p || r.phase !== "started" || r.live) return send(ws, "err", "Match not available");
      p.ws = ws; ws.id = d.id; ws.room = r;
      r.attached.add(d.id);
      send(ws, "match", {});
      if (r.attached.size >= r.players.size) go(r);
      return;
    }
    if (m.t === "create" || m.t === "join") {
      leave(ws);
      const code = String(d.code || "").toUpperCase().slice(0, 5);
      const name = String(d.name || "Player").slice(0, 12);
      let r = rooms.get(code);
      if (m.t === "create") {
        if (r) return send(ws, "err", "Code already in use, try again");
        r = { code, host: null, phase: "lobby", players: new Map(), bots: 0 };
        rooms.set(code, r);
      } else {
        if (!r) return send(ws, "err", "Room " + code + " not found");
        if (r.phase !== "lobby") return send(ws, "err", "Match already started");
        if (r.players.size >= 10) return send(ws, "err", "Room is full");
        if (r.players.size + r.bots >= 10) r.bots--;
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
    if (r.live) {
      if (m.t === "st") {
        if (d.id !== ws.id && !(ws.id === r.host && String(d.id).startsWith("b"))) d.id = ws.id;
        all(r, "st", d, ws);
      } else if (m.t === "ev") all(r, "ev", d, ws);
      return;
    }
    if (r.phase !== "lobby") return;
    const p = r.players.get(ws.id);
    if (m.t === "ready" && p) { p.ready = !!d.v; sync(r); }
    else if (m.t === "bots" && ws.id === r.host) {
      r.bots = Math.max(0, Math.min(10 - r.players.size, Math.floor(Number(d.n) || 0)));
      sync(r);
    } else if (m.t === "start" && ws.id === r.host && [...r.players.values()].every((x) => x.ready)) startMatch(r);
  });
  ws.on("close", () => leave(ws));
});
setInterval(() => {
  wss.clients.forEach((ws) => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; ws.ping(); });
}, 25000);
server.listen(process.env.PORT || 2567);
console.log("Server listening");
