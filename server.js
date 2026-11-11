// School Hide & Seek - multiplayer server (Phase 1: rooms + lobby). Created by NH Nirob.
const http = require("http");
const express = require("express");
const { Server, Room } = require("colyseus");
const { WebSocketTransport } = require("@colyseus/ws-transport");

class SchoolRoom extends Room {
  maxClients = 10;
  onCreate(opts) {
    this.code = String(opts.code || "").toUpperCase().slice(0, 5);
    this.setMetadata({ code: this.code });
    this.p = new Map();
    this.host = null;
    this.phase = "lobby";
    this.onMessage("hello", () => this.sync());
    this.onMessage("ready", (c, v) => {
      const p = this.p.get(c.sessionId);
      if (p && this.phase === "lobby") { p.ready = !!v; this.sync(); }
    });
    this.onMessage("start", (c) => {
      if (c.sessionId !== this.host || this.phase !== "lobby") return;
      if (![...this.p.values()].every((p) => p.ready)) return;
      this.phase = "started";
      this.lock();
      this.broadcast("start", {});
      this.sync();
    });
  }
  onJoin(c, opts) {
    const name = String((opts && opts.name) || "Player").slice(0, 12);
    this.p.set(c.sessionId, { id: c.sessionId, name, ready: false });
    if (!this.host) this.host = c.sessionId;
    this.sync();
  }
  onLeave(c) {
    this.p.delete(c.sessionId);
    if (this.host === c.sessionId) this.host = [...this.p.keys()][0] || null;
    this.sync();
  }
  sync() {
    this.broadcast("lobby", { code: this.code, host: this.host, phase: this.phase, players: [...this.p.values()] });
  }
}

const app = express();
app.use((req, res, next) => { res.header("Access-Control-Allow-Origin", "*"); next(); });
app.get("/", (req, res) => res.send("School Hide & Seek server OK"));
const server = http.createServer(app);
const gameServer = new Server({ transport: new WebSocketTransport({ server }) });
gameServer.define("school", SchoolRoom).filterBy(["code"]);
gameServer.listen(process.env.PORT || 2567);
console.log("Server listening");
