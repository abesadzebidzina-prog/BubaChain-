import { initMiniApp } from "./miniapp.js";
import { createGame } from "./game.js";
import { connectInjectedWallet, hasInjectedWallet, formatAddr, BASE_CHAIN_ID_HEX } from "./wallet.js";

const $ = (id) => document.getElementById(id);

const pillStatus = $("pillStatus");
const pillStorm = $("pillStorm");

const intro = $("intro");
const btnCloseIntro = $("btnCloseIntro");
const btnToggleSound = $("btnToggleSound");

const balance = $("balance");
const unclaimed = $("unclaimed");
const daily = $("daily");
const rate = $("rate");
const tip = $("tip");

const btnStart = $("btnStart");
const btnReset = $("btnReset");

const fcUser = $("fcUser");
const walletAddr = $("walletAddr");
const chainInfo = $("chainInfo");
const btnConnect = $("btnConnect");
const btnDisconnect = $("btnDisconnect");

const btnWatchAd = $("btnWatchAd");
const btnClaim = $("btnClaim");
const claimInfo = $("claimInfo");

function beep(freq = 520, ms = 40, vol = 0.015) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    setTimeout(() => { o.stop(); ctx.close(); }, ms);
  } catch {}
}

const game = createGame();
const mini = await initMiniApp();

if (mini?.context?.user) {
  const u = mini.context.user;
  const label = u.username ? `@${u.username}` : (u.displayName || "User");
  fcUser.textContent = `${label} (FID ${u.fid})`;
} else {
  fcUser.textContent = mini?.inMiniApp ? "Mini App (no user info)" : "Not detected";
}

btnCloseIntro.onclick = () => {
  if (game.state.soundOn) beep();
  intro.style.display = "none";
  if (game.dailyAvailable()) {
    game.claimDaily(Date.now());
    tip.textContent = "Daily boost activated (+50% for 10 minutes).";
    game.save();
  }
};

btnToggleSound.onclick = () => {
  game.state.soundOn = !game.state.soundOn;
  btnToggleSound.textContent = `Sound: ${game.state.soundOn ? "ON" : "OFF"}`;
  if (game.state.soundOn) beep();
  game.save();
};

btnStart.onclick = () => {
  if (game.state.soundOn) beep();
  game.start();
  game.save();
  render();
};

btnReset.onclick = () => {
  const ok = confirm("Reset ALL progress? This cannot be undone.");
  if (!ok) return;
  localStorage.clear();
  location.reload();
};

btnConnect.onclick = async () => {
  if (game.state.soundOn) beep();
  try {
    const { address, chainId } = await connectInjectedWallet();
    localStorage.setItem("bubachain_wallet", address);
    walletAddr.textContent = formatAddr(address);
    chainInfo.textContent = chainId === BASE_CHAIN_ID_HEX ? "Base" : (chainId || "Unknown");
    btnDisconnect.disabled = false;
    tip.textContent = "Wallet connected (MVP).";
  } catch (e) {
    tip.textContent = hasInjectedWallet()
      ? `Wallet connect failed: ${e.message}`
      : "No injected wallet detected. Open inside a wallet-enabled client.";
  }
};

btnDisconnect.onclick = async () => {
  if (game.state.soundOn) beep();
  localStorage.removeItem("bubachain_wallet");
  walletAddr.textContent = "Not connected";
  chainInfo.textContent = "—";
  btnDisconnect.disabled = true;
};

let adTimer = null;
btnWatchAd.onclick = () => {
  if (game.state.soundOn) beep();
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
  if (game.state.soundOn) beep(620, 60, 0.02);
  const res = game.claim(Date.now());
  if (res.ok) {
    tip.textContent = `Claimed +${res.gained} BC${game.state.stormActive ? " (Storm bonus!)" : ""}`;
    game.save();
    render();
  }
};

function render() {
  const now = Date.now();

  balance.textContent = `${Math.floor(game.state.balanceBC)} BC`;
  unclaimed.textContent = `${Math.floor(game.state.unclaimedBC)} BC`;
  daily.textContent = `${game.state.activeMinutesToday}/${game.state.dailyLimitMin} min`;
  rate.textContent = `${game.effectiveRate(now).toFixed(2)} BC/min`;

  // status
  if (!game.state.running) pillStatus.textContent = "Status: Idle";
  else if (document.hidden) pillStatus.textContent = "Status: Paused (tab hidden)";
  else if (game.state.activeMinutesToday >= game.state.dailyLimitMin) pillStatus.textContent = "Status: Daily limit reached";
  else pillStatus.textContent = "Status: Running";

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

  // claim UI
  const cdLeft = Math.max(0, game.state.claimCooldownMs - (now - game.state.lastClaimMs));
  const adLeft = Math.max(0, game.state.adReadyUntilMs - now);
  btnClaim.disabled = !game.canClaim(now);

  if (game.state.unclaimedBC <= 0) claimInfo.textContent = "Earn unclaimed coins first.";
  else if (cdLeft > 0) claimInfo.textContent = `Claim cooldown: ${Math.ceil(cdLeft / 1000)}s`;
  else if (adLeft > 0) claimInfo.textContent = game.state.stormActive ? "Ad verified ✅ Claim now (Storm bonus!)" : `Ad verified ✅ Claim within ${Math.ceil(adLeft / 1000)}s`;
  else claimInfo.textContent = "Watch an ad to unlock Claim.";

  btnToggleSound.textContent = `Sound: ${game.state.soundOn ? "ON" : "OFF"}`;
}

setInterval(() => {
  game.tick(Date.now());
  game.save();
  render();
}, 1000);

document.addEventListener("visibilitychange", render);

// restore saved wallet
const saved = localStorage.getItem("bubachain_wallet");
if (saved) {
  walletAddr.textContent = formatAddr(saved);
  btnDisconnect.disabled = false;
}

render();
