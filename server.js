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
    try { m = JSON.parse(raw); } catch (e) {
