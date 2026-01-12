import { initMiniApp } from "./miniapp.js";
import { createGame } from "./game.js";
import { connectInjectedWallet, disconnectInjectedWallet, hasInjectedWallet, formatAddr, BASE_CHAIN_ID_HEX } from "./wallet.js";

const el = (id) => document.getElementById(id);

// UI elements
const pillStatus = el("pillStatus");
const pillStorm  = el("pillStorm");

const intro = el("intro");
const btnCloseIntro = el("btnCloseIntro");
const btnToggleSound = el("btnToggleSound");

const balance = el("balance");
const unclaimed = el("unclaimed");
const daily = el("daily");
const rate = el("rate");
const tip = el("tip");

const btnStart = el("btnStart");
const btnReset = el("btnReset");

const fcUser = el("fcUser");
const walletAddr = el("walletAddr");
const chainInfo = el("chainInfo");
const btnConnect = el("btnConnect");
const btnDisconnect = el("btnDisconnect");

const btnWatchAd = el("btnWatchAd");
const btnClaim = el("btnClaim");
const claimInfo = el("claimInfo");

const upgradeList = el("upgradeList");

// simple sound (no assets needed)
function beep(freq = 440, ms = 80, vol = 0.02) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    setTimeout(() => { o.stop(); ctx.close(); }, ms);
  } catch { /* ignore */ }
}

function stormSound(game) {
  if (!game.state.soundOn) return;
  beep(220, 60, 0.03);
  setTimeout(() => beep(440, 80, 0.03), 70);
  setTimeout(() => beep(880, 100, 0.02), 170);
}

function clickSound(game) {
  if (!game.state.soundOn) return;
  beep(520, 40, 0.015);
}

const game = createGame();

// farcaster init
const mini = await initMiniApp();

// show farcaster user if present
if (mini?.context?.user) {
  const u = mini.context.user;
  const label = u.username ? `@${u.username}` : (u.displayName || "User");
  fcUser.textContent = `${label} (FID ${u.fid})`;
} else {
  fcUser.textContent = mini?.inMiniApp ? "Mini App (no user info)" : "Not detected";
}

// Intro behavior
btnCloseIntro.onclick = () => {
  clickSound(game);
  intro.style.display = "none";
  // daily claim on first close (nice loop)
  if (game.dailyAvailable()) {
    game.claimDaily(Date.now());
    tip.textContent = "Daily boost activated (+50% for 10 minutes).";
    game.save();
  }
};

btnToggleSound.onclick = () => {
  game.state.soundOn = !game.state.soundOn;
  btnToggleSound.textContent = `Sound: ${game.state.soundOn ? "ON" : "OFF"}`;
  clickSound(game);
  game.save();
};

// Buttons
btnStart.onclick = () => {
  clickSound(game);
  game.state.running = true;
  pillStatus.textContent = "Status: Running";
  game.save();
};

btnReset.onclick = () => {
  const ok = confirm("Reset ALL progress? This cannot be undone.");
  if (!ok) return;
  game.resetAll();
  location.reload();
};

// Wallet buttons
btnConnect.onclick = async () => {
  clickSound(game);
  try {
    const { address, chainId } = await connectInjectedWallet();
    localStorage.setItem("bubachain_wallet", address);
    walletAddr.textContent = `${formatAddr(address)}`;
    chainInfo.textContent = chainId === BASE_CHAIN_ID_HEX ? "Base" : (chainId || "Unknown");
    btnDisconnect.disabled = false;
    tip.textContent = "Wallet connected. Progress remains local for now (MVP).";
  } catch (e) {
    tip.textContent = hasInjectedWallet()
      ? `Wallet connect failed: ${e.message}`
      : "No injected wallet detected. Open inside a wallet-enabled client.";
  }
};

btnDisconnect.onclick = async () => {
  clickSound(game);
  await disconnectInjectedWallet();
  localStorage.removeItem("bubachain_wallet");
  walletAddr.textContent = "Not connected";
  chainInfo.textContent = "—";
  btnDisconnect.disabled = true;
};

// Ad simulation (10s)
let adTimer = null;
btnWatchAd.onclick = () => {
  clickSound(game);
  btnWatchAd.disabled = true;
  let t = 10;
  btnWatchAd.textContent = `Watching… ${t}s`;

  if (adTimer) clearInterval(adTimer);
  adTimer = setInterval(() => {
    t -= 1;
    if (t <= 0) {
      clearInterval(adTimer);
      adTimer = null;
      game.watchAdUnlock(Date.now());
      btnWatchAd.disabled = false;
      btnWatchAd.textContent = "Watch Ad (10s)";
      game.save();
      render();
      return;
    }
    btnWatchAd.textContent = `Watching… ${t}s`;
  }, 1000);
};

btnClaim.onclick = () => {
  clickSound(game);
  const res = game.claim(Date.now());
  if (res.ok) {
    tip.textContent = `Claimed +${res.gained} BC${game.state.stormActive ? " (Storm bonus!)" : ""}`;
    game.save();
    render();
  }
};

// Upgrades UI
function renderUpgrades() {
  upgradeList.innerHTML = "";
  const defs = game.upgradeDefs();
  defs.forEach((d) => {
    const lvl = game.state.upgrades[d.key] ?? 0;
    const cost = d.cost(lvl);
    const row = document.createElement("div");
    row.className = "up";
    row.innerHTML = `
      <div class="left">
        <div class="title">${d.title} <span class="muted">Lv ${lvl}</span></div>
        <div class="desc">${d.desc}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <div class="cost">${cost} BC</div>
        <button class="btn secondary" data-key="${d.key}">Buy</button>
      </div>
    `;
    row.querySelector("button").onclick = () => {
      clickSound(game);
      const out = game.buyUpgrade(d.key);
      if (!out.ok) {
        tip.textContent = out.reason === "no_funds" ? "Not enough BC." : "Upgrade failed.";
      } else {
        tip.textContent = `${d.title} upgraded!`;
      }
      game.save();
      render();
    };
    upgradeList.appendChild(row);
  });
}

let prevStorm = false;

function render() {
  const now = Date.now();

  balance.textContent = `${Math.floor(game.state.balanceBC)} BC`;
  unclaimed.textContent = `${Math.floor(game.state.unclaimedBC)} BC`;
  daily.textContent = `${game.state.activeMinutesToday}/${game.state.dailyLimitMin} min`;

  const eff = game.effectiveRatePerMin(now);
  rate.textContent = `${eff.toFixed(2)} BC/min`;

  // storm UI
  if (game.state.stormActive) {
    const left = Math.max(0, game.state.stormEndsAtMs - now);
    pillStorm.classList.add("stormOn");
    pillStorm.textContent = `STORM ⚡ ${Math.ceil(left / 1000)}s`;
    document.body.classList.add("storm");
  } else {
    pillStorm.classList.remove("stormOn");
    pillStorm.textContent = "Storm: OFF";
    document.body.classList.remove("storm");
  }

  // status
  if (!game.state.running) {
    pillStatus.textContent = "Status: Idle";
  } else if (document.hidden) {
    pillStatus.textContent = "Status: Paused (tab hidden)";
  } else if (game.state.activeMinutesToday >= game.state.dailyLimitMin) {
    pillStatus.textContent = "Status: Daily limit reached";
  } else {
    pillStatus.textContent = "Status: Running";
  }

  // claim availability
  const cdLeft = Math.max(0, game.state.claimCooldownMs - (now - game.state.lastClaimMs));
  const adLeft = Math.max(0, game.state.adReadyUntilMs - now);
  const can = game.canClaim(now);

  btnClaim.disabled = !can;

  if (game.state.unclaimedBC <= 0) {
    claimInfo.textContent = "Earn unclaimed coins first.";
  } else if (cdLeft > 0) {
    claimInfo.textContent = `Claim cooldown: ${Math.ceil(cdLeft / 1000)}s`;
  } else if (adLeft > 0) {
    claimInfo.textContent = game.state.stormActive
      ? "Ad verified ✅ Claim now (Storm bonus!)"
      : `Ad verified ✅ Claim within ${Math.ceil(adLeft / 1000)}s`;
  } else {
    claimInfo.textContent = "Watch an ad to unlock Claim.";
  }

  // daily reward reminder
  if (game.dailyAvailable() && intro.style.display === "none") {
    tip.textContent ||= "Daily reward available next time you open the app.";
  }

  // sound toggle label
  btnToggleSound.textContent = `Sound: ${game.state.soundOn ? "ON" : "OFF"}`;

  // storm enter sound
  if (!prevStorm && game.state.stormActive) {
    stormSound(game);
  }
  prevStorm = game.state.stormActive;

  renderUpgrades();
}

// main loop
setInterval(() => {
  game.tick(Date.now());
  game.save();
  render();
}, 1000);

document.addEventListener("visibilitychange", () => render());

// restore stored wallet display (optional)
const savedAddr = localStorage.getItem("bubachain_wallet");
if (savedAddr) {
  walletAddr.textContent = formatAddr(savedAddr);
  btnDisconnect.disabled = false;
}

// initial render
render();
