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
  bots: BOTS.slice(0, r.bots), cfg: r.cfg,
});
const sync = (r) => { const m = pub(r); for (const p of r.players.values()) send(p.ws, "lobby", m); };
const all = (r, t, d, except) => { for (const p of r.players.values()) if (p.ws && p.ws !== except) send(p.ws, t, d); };

function removeLobby(r, p) {
  r.players.delete(p.id);
  if (!r.players.size) { rooms.delete(r.code); return; }
  if (r.host === p.id) r.host = r.players.keys().next().value;
  sync(r);
}
function startMatch(r) {
  if (r.players.size + r.bots < 5) r.bots = 5 - r.players.size;
  r.phase = "started";
  r.live = false;
  r.attached = new Set();
  r.dead = new Set();
  r.ended = null;
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
  for (const x of r.roster) if (!x.bot) { const q = r.players.get(x.id); x.look = q && q.look; }
  if (!r.players.size) { rooms.delete(r.code); return; }
  r.host = r.players.keys().next().value;
  r.seeker = r.roster[Math.floor(Math.random() * r.roster.length)].id;
  all(r, "go", { roster: r.roster, seeker: r.seeker, host: r.host, cfg: r.cfg });
}
function drop(r, id) {
  r.players.delete(id);
  r.roster = (r.roster || []).filter((x) => x.id !== id);
  all(r, "left", { id });
  if (!r.players.size) { rooms.delete(r.code); return; }
  if (r.host === id) { r.host = r.players.keys().next().value; all(r, "host", { host: r.host }); }
  if (r.seeker === id && !r.ended) all(r, "ev", { k: "end", w: "h" });
}
function resetToLobby(r) {
  r.phase = "lobby"; r.live = false; r.roster = null; r.seeker = null;
  r.dead = new Set(); r.ended = null; r.attached = new Set();
  for (const p of r.players.values()) {
    p.ready = false; p.back = true;
    clearTimeout(p.dt); clearTimeout(p.bt);
    p.bt = setTimeout(() => { if (!p.ws && r.players.get(p.id) === p) removeLobby(r, p); }, 90000);
  }
}
function leave(ws) {
  const r = ws.room;
  if (!r) return;
  ws.room = null;
  const p = r.players.get(ws.id);
  if (!p || p.ws !== ws) return;
  if (r.phase === "started") {
    p.ws = null;
    if (r.live) p.dt = setTimeout(() => { if (!p.ws && r.players.get(p.id) === p) drop(r, p.id); }, 30000);
    return;
  }
  if (p.back) { p.ws = null; return; }
  removeLobby(r, p);
}

wss.on("connection", (ws) => {
  ws.id = "p" + nid++;
  ws.room = null;
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });
  ws.on("message", (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (m.t === "ping") return;
    const d = m.d || {};
    if (m.t === "attach") {
      const r = rooms.get(String(d.code || "").toUpperCase());
      const p = r && r.players.get(d.id);
      if (!p || r.phase !== "started") return send(ws, "err", "Match not available");
      if (!r.live) {
        p.ws = ws; ws.id = d.id; ws.room = r;
        p.look = (d.look && typeof d.look === "object") ? d.look : undefined;
        r.attached.add(d.id);
        send(ws, "match", {});
        if (r.attached.size >= r.players.size) go(r);
      } else {
        clearTimeout(p.dt);
        p.ws = ws; ws.id = d.id; ws.room = r;
        send(ws, "resumed", { dead: [...r.dead], end: r.ended, host: r.host, seeker: r.seeker });
      }
      return;
    }
    if (m.t === "relobby") {
      const r = rooms.get(String(d.code || "").toUpperCase());
      const p = r && r.players.get(d.id);
      if (!p || r.phase !== "lobby") return send(ws, "err", "Room not available");
      clearTimeout(p.bt);
      p.back = false; p.ready = false; p.ws = ws; ws.id = d.id; ws.room = r;
      send(ws, "joined", { id: d.id });
      sync(r);
      return;
    }
    if (m.t === "create" || m.t === "join") {
      leave(ws);
      const code = String(d.code || "").toUpperCase().slice(0, 5);
      const name = String(d.name || "Player").slice(0, 12);
      let r = rooms.get(code);
      if (m.t === "create") {
        if (r) return send(ws, "err", "Code already in use, try again");
        r = { code, host: null, phase: "lobby", players: new Map(), bots: 0, cfg: { wx: "sunny", hw: 0, cyc: 0 }, dead: new Set(), ended: null };
        rooms.set(code, r);
      } else {
        if (!r) return send(ws, "err", "Room " + code + " not found");
        if (r.phase !== "lobby") return send(ws, "err", "Match already started");
        if (r.players.size >= 8) return send(ws, "err", "Room is full");
        if (r.players.size + r.bots >= 8) r.bots--;
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
      } else if (m.t === "ev") {
        if (d.k === "elim" && d.id) r.dead.add(d.id);
        if (d.k === "rev" && d.id) r.dead.delete(d.id);
        if (d.k === "end" && !r.ended) r.ended = d.w || "h";
        all(r, "ev", d, ws);
      } else if (m.t === "chat") {
        const text = String(d.text || "").slice(0, 120);
        if (!text) return;
        const me = r.players.get(ws.id);
        for (const q of r.players.values()) {
          if (!q.ws) continue;
          if (d.team && ((q.id === r.seeker) !== (ws.id === r.seeker))) continue;
          send(q.ws, "chat", { from: me ? me.name : "?", text, team: !!d.team });
        }
      } else if (m.t === "sig") {
        const q = r.players.get(d.to);
        if (q && q.ws) send(q.ws, "sig", { from: ws.id, s: d.s });
      } else if (m.t === "again" && r.ended) {
        const me = r.players.get(ws.id);
        all(r, "again", { by: me ? me.name : "?" });
        resetToLobby(r);
      }
      return;
    }
    if (r.phase !== "lobby") return;
    const p = r.players.get(ws.id);
    if (m.t === "ready" && p) { p.ready = !!d.v; sync(r); }
    else if (m.t === "cfg" && ws.id === r.host) {
      r.cfg = {
        wx: ["sunny", "cloudy", "rainy", "foggy", "evening", "night"].includes(d.wx) ? d.wx : "sunny",
        hw: d.hw ? 1 : 0, cyc: d.cyc ? 1 : 0,
      };
      sync(r);
    } else if (m.t === "bots" && ws.id === r.host) {
      r.bots = Math.max(0, Math.min(8 - r.players.size, Math.floor(Number(d.n) || 0)));
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
