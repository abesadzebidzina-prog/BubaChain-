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
import { initMiniApp, getFarcasterUser } from "./miniapp.js";
import { createWalletController } from "./wallet.js";

const state = loadState();
initMiniApp().catch(() => {});
const $ = (sel) => document.querySelector(sel);

function walletMultiplier(walletState) {
  if (!walletState?.connected) return 1;
  return walletState.verified ? 1.25 : 1.10;
}

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 1700);
}

function boom() {
  const el = $("#boom");
  el.classList.remove("go");
  void el.offsetWidth;
  el.classList.add("go");
}

function buildUI() {
  $("#app").innerHTML = `
    <div class="wrap">
      <header class="top">
        <div class="title">
          <div class="logo">⚡</div>
          <div>
            <h1>BubaChain</h1>
            <div class="sub">Upgrade-only • Rare Storms • Daily • Wallet</div>
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

      <section class="card">
        <div class="h2">Identity</div>
        <div class="muted" id="fcMeta">Farcaster: not detected</div>

        <div class="h2" style="margin-top:14px;">Wallet (Base / EVM)</div>

        <div class="row" style="margin-top:8px;">
          <div class="muted" id="walletMeta">Not connected</div>
          <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-end;">
            <button class="btn" id="walletConnectBtn">Connect</button>
            <button class="btn ghost" id="walletSwitchBtn" disabled>Switch to Base</button>
            <button class="btn ghost" id="walletSignBtn" disabled>Sign Link Proof</button>
          </div>
        </div>

        <div class="muted" style="margin-top:10px;" id="walletBonusInfo">Wallet bonus: none</div>

        <div class="h2" style="margin-top:14px;">Onchain Prep (no tx)</div>
        <div class="row" style="margin-top:8px;">
          <div class="muted" id="onchainMeta">Not ready</div>
          <button class="btn ghost" id="gasBtn" disabled>Estimate Gas</button>
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
}

function renderUpgrades() {
  const list = $("#upgradeList");
  const ups = Object.values(state.upgradesById);

  list.innerHTML = ups.map((u) => {
    const cost = computeUpgradeCost(u);
    const afford = state.bc >= cost;
    return `
      <div class="item">
        <div>
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
      toast("Upgrade purchased");
      renderUpgrades();
    });
  });
}

function renderFrame(snapshot, walletState) {
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
    const total = 15000;
    const pct = Math.max(0, Math.min(1, snapshot.stormEndsInMs / total));
    fill.style.width = `${pct * 100}%`;
  } else {
    storm.classList.remove("active");
    title.textContent = "Calm";
    sub.textContent = "Storms are rare & powerful.";
    meta.textContent = "";
    fill.style.width = "0%";
  }

  const mult = walletMultiplier(walletState);
  const dailyReady = isDailyReady(state);
  const dailyReward = computeDailyReward(state, { walletMult: mult });

  $("#dailyBtn").disabled = !dailyReady;
  $("#dailyInfo").textContent = dailyReady
    ? `Ready: +${format(dailyReward)} BC`
    : "Not ready yet. Come back later.";

  renderUpgrades();
}

async function start() {
  buildUI();

  // Show Farcaster identity (if available)
  const fc = await getFarcasterUser();
  const fcMeta = $("#fcMeta");
  if (fc) {
    const name = fc.displayName || fc.username || "User";
    const handle = fc.username ? `@${fc.username}` : "";
    fcMeta.textContent = `Farcaster: ${name} ${handle} • FID ${fc.fid ?? "?"}`;
  } else {
    fcMeta.textContent = "Farcaster: not detected (open inside Farcaster to see identity)";
  }

  const wallet = createWalletController({
    getFarcasterUser,
    onUpdate: (w) => {
      const meta = $("#walletMeta");
      const connectBtn = $("#walletConnectBtn");
      const switchBtn = $("#walletSwitchBtn");
      const signBtn = $("#walletSignBtn");
      const bonusInfo = $("#walletBonusInfo");
      const onchainMeta = $("#onchainMeta");
      const gasBtn = $("#gasBtn");

      if (!w.available) {
        meta.textContent = "No wallet provider found (open in Farcaster or install a wallet).";
        connectBtn.disabled = true;
        switchBtn.disabled = true;
        signBtn.disabled = true;
        bonusInfo.textContent = "Wallet bonus: none";
        onchainMeta.textContent = "Not ready";
        gasBtn.disabled = true;
        return;
      }

      if (!w.connected) {
        meta.textContent = "Not connected";
        connectBtn.textContent = "Connect";
        switchBtn.disabled = true;
        signBtn.disabled = true;
        bonusInfo.textContent = "Wallet bonus: none";
        onchainMeta.textContent = "Connect wallet to prepare onchain";
        gasBtn.disabled = true;
      } else {
        meta.textContent = `${w.addressShort} • ${w.chainName} • ${w.verified ? "Linked" : "Not linked"}`;
        connectBtn.textContent = "Disconnect";

        const onBase = (w.chainId === wallet.BASE_MAINNET.chainId);
        switchBtn.disabled = onBase;
        signBtn.disabled = false;

        const mult = walletMultiplier(w);
        bonusInfo.textContent = w.verified
          ? `Wallet bonus: Linked ×${mult.toFixed(2)} earnings & daily`
          : `Wallet bonus: Connected ×${mult.toFixed(2)} earnings & daily (link for more)`;

        onchainMeta.textContent = onBase ? "Ready (Base)" : "Switch to Base to be ready";
        gasBtn.disabled = !onBase;
      }
    }
  });

  await wallet.refresh();

  $("#walletConnectBtn").addEventListener("click", async () => {
    try {
      if (!wallet.state.connected) {
        await wallet.connect();
        toast("Wallet connected");
      } else {
        await wallet.disconnect();
        toast("Wallet disconnected");
      }
    } catch (e) {
      toast(e?.message || "Wallet error");
    }
  });

  $("#walletSwitchBtn").addEventListener("click", async () => {
    try {
      await wallet.switchToBase();
      toast("Switched to Base");
    } catch (e) {
      toast(e?.message || "Switch failed");
    }
  });

  $("#walletSignBtn").addEventListener("click", async () => {
    try {
      const res = await wallet.signToVerify();
      if (res?.ok) toast("Linked ✅");
    } catch (e) {
      toast(e?.message || "Sign failed");
    }
  });

  $("#gasBtn").addEventListener("click", async () => {
    try {
      const gasHex = await wallet.estimateGasTest();
      const gas = parseInt(gasHex, 16);
      toast(`EstimateGas OK: ${gas}`);
    } catch (e) {
      toast(e?.message || "Estimate gas failed");
    }
  });

  // Offline catch-up with current wallet multiplier
  const mult0 = walletMultiplier(wallet.state);
  const off = offlineCatchup(state, { walletMult: mult0 });
  if (off.applied > 0) {
    toast(`Offline: +${format(off.applied)} BC`);
    saveState(state);
  }

  $("#dailyBtn").addEventListener("click", () => {
    const mult = walletMultiplier(wallet.state);
    const res = claimDaily(state, { walletMult: mult });
    if (!res.ok) return toast("Daily not ready yet.");
    saveState(state);
    toast(`+${format(res.reward)} BC claimed!`);
  });

  let lastStorm = state.stormActive;

  setInterval(() => {
    const mult = walletMultiplier(wallet.state);
    const snap = tick(state, { walletMult: mult });

    if (!lastStorm && snap.isStorm) {
      boom();
      toast("Storm hit! ⚡");
    }
    lastStorm = snap.isStorm;

    if (Math.random() < 0.1) saveState(state);
    renderFrame(snap, wallet.state);
  }, 250);

  window.addEventListener("beforeunload", () => saveState(state));
}

start();
