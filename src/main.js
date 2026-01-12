import "../style.css";
import {
  loadState,
  saveState,
  tick,
  offlineCatchup,
  buyUpgrade,
  claimDaily,
  computeUpgradeCost,
  computeDailyReward,
  isDailyReady,
  msToHMS,
  format,
} from "./game.js";
import { initMiniApp } from "./miniapp.js";

const state = loadState();
initMiniApp().catch(() => {});

const $ = (sel) => document.querySelector(sel);

function buildUI() {
  const root = $("#app");
  root.innerHTML = `
    <div class="wrap">
      <header class="top">
        <div class="title">
          <div class="logo">⚡</div>
          <div>
            <h1>BubaChain</h1>
            <div class="sub">Upgrade-only • Rare Storms • Daily</div>
          </div>
        </div>
        <div class="stats">
          <div class="stat">
            <div class="k">BubaCoins</div>
            <div class="v" id="bc">0</div>
          </div>
          <div class="stat">
            <div class="k">BC/s</div>
            <div class="v" id="bps">0</div>
          </div>
        </div>
      </header>

      <section class="card storm" id="stormCard">
        <div class="stormRow">
          <div>
            <div class="stormTitle" id="stormTitle">Calm</div>
            <div class="stormSub" id="stormSub">Storms are rare & powerful.</div>
          </div>
          <div class="stormMeta" id="stormMeta"></div>
        </div>
        <div class="stormBar"><div class="stormFill" id="stormFill"></div></div>
      </section>

      <section class="card daily">
        <div class="row">
          <div>
            <div class="h2">Daily Reward</div>
            <div class="muted" id="dailyInfo">Come back every 24h.</div>
          </div>
          <button class="btn" id="dailyBtn">Claim</button>
        </div>
      </section>

      <section class="card upgrades">
        <div class="h2">Upgrades</div>
        <div class="list" id="upgradeList"></div>
      </section>

      <footer class="foot muted">
        Coins (BC) are in-game only, no guaranteed monetary value.
      </footer>

      <div class="toast" id="toast"></div>
      <div class="boom" id="boom"></div>
    </div>
  `;

  $("#dailyBtn").addEventListener("click", () => {
    const res = claimDaily(state);
    if (!res.ok) return toast("Daily not ready yet.");
    saveState(state);
    toast(`+${format(res.reward)} BC claimed!`);
  });
}

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 1600);
}

function boom() {
  const el = $("#boom");
  el.classList.remove("go");
  void el.offsetWidth; // reflow
  el.classList.add("go");
}

function renderUpgrades() {
  const list = $("#upgradeList");
  const ups = Object.values(state.upgradesById);

  list.innerHTML = ups.map((u) => {
    const cost = computeUpgradeCost(u);
    const afford = state.bc >= cost;
    return `
      <div class="item">
        <div class="left">
          <div class="name">${u.name} <span class="lvl">Lv ${u.level}</span></div>
          <div class="desc muted">${u.desc}</div>
        </div>
        <button class="btn ${afford ? "" : "ghost"}" data-up="${u.id}">
          Buy • ${format(cost)}
        </button>
      </div>
    `;
  }).join("");

  list.querySelectorAll("button[data-up]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-up");
      const res = buyUpgrade(state, id);
      if (!res.ok) return toast(`Need ${format(res.cost || 0)} BC`);
      saveState(state);
      toast(`Upgraded!`);
      renderUpgrades();
    });
  });
}

function renderFrame(snapshot) {
  $("#bc").textContent = format(snapshot.bc);
  $("#bps").textContent = format(snapshot.bps);

  const storm = $("#stormCard");
  const title = $("#stormTitle");
  const sub = $("#stormSub");
  const meta = $("#stormMeta");
  const fill = $("#stormFill");

  if (snapshot.isStorm) {
    storm.classList.add("active");
    title.textContent = "STORM ⚡";
    sub.textContent = `×${snapshot.stormMult.toFixed(1)} production`;
    meta.textContent = `${msToHMS(snapshot.stormEndsInMs)} left`;
    const total = 15 * 1000;
    const pct = Math.max(0, Math.min(1, snapshot.stormEndsInMs / total));
    fill.style.width = `${pct * 100}%`;
  } else {
    storm.classList.remove("active");
    title.textContent = "Calm";
    sub.textContent = "Storms are rare & powerful.";
    meta.textContent = "";
    fill.style.width = "0%";
  }

  const ready = isDailyReady(state);
  const reward = computeDailyReward(state);
  $("#dailyBtn").disabled = !ready;
  $("#dailyInfo").textContent = ready
    ? `Ready: +${format(reward)} BC`
    : `Not ready yet. Come back later.`;

  renderUpgrades();
}

function start() {
  buildUI();

  // Offline catch-up once
  const off = offlineCatchup(state);
  if (off.applied > 0) {
    toast(`Offline: +${format(off.applied)} BC`);
    saveState(state);
  }

  renderUpgrades();

  let lastStorm = state.stormActive;

  setInterval(() => {
    const snap = tick(state);

    if (!lastStorm && snap.isStorm) {
      boom();
      toast("Storm hit! ⚡");
    }
    lastStorm = snap.isStorm;

    if (Math.random() < 0.1) saveState(state);
    renderFrame(snap);
  }, 250);

  window.addEventListener("beforeunload", () => saveState(state));
}

start();