import express from "express";
import cors from "cors";
import crypto from "crypto";

const app = express();
app.use(cors());
app.use(express.json());

// In-memory store (MVP). Später DB.
const sessions = new Map(); // sessionId -> { startedAt, lastHeartbeat, totalSeconds }

function makeId() {
  // Works even if randomUUID is not available
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
}

// Start a session
app.post("/start-session", (req, res) => {
  const sessionId = makeId();
  sessions.set(sessionId, {
    startedAt: Date.now(),
    lastHeartbeat: Date.now(),
    totalSeconds: 0,
  });
  res.json({ sessionId });
});

// Heartbeat (client calls e.g. every 30s)
app.post("/heartbeat", (req, res) => {
  const { sessionId } = req.body || {};
  if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });

  const s = sessions.get(sessionId);
  if (!s) return res.status(400).json({ error: "Invalid session" });

  const now = Date.now();
  const deltaSec = Math.floor((now - s.lastHeartbeat) / 1000);

  // Anti-cheat light: must ping roughly every 30s (+/-)
  if (deltaSec < 5 || deltaSec > 45) {
    return res.status(400).json({ error: "Suspicious heartbeat", deltaSec });
  }

  s.totalSeconds += deltaSec;
  s.lastHeartbeat = now;

  res.json({ ok: true, totalSeconds: s.totalSeconds });
});

// End session
app.post("/end-session", (req, res) => {
  const { sessionId } = req.body || {};
  if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });

  const s = sessions.get(sessionId);
  if (!s) return res.status(400).json({ error: "Invalid session" });

  sessions.delete(sessionId);
  res.json({ ok: true, totalSeconds: s.totalSeconds });
});

const PORT = 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`API running on http://localhost:${PORT}`);
});
