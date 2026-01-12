// ===============================
// BubaChain – Core + Ad Simulation
// ===============================

// -------- STATE --------
let coins = 0;
let unclaimed = 0;

let running = false;
let coinsPerMinute = 1;

let upgradeCost = 10;

let lastTick = Date.now();
let activeMinutesToday = 0;
const DAILY_LIMIT = 360; // 6 hours

let lastClaim = 0;
const CLAIM_COOLDOWN = 60 * 1000; // 1 minute

// Ad simulation gate
let adReadyUntil = 0;            // timestamp until claim is allowed
const AD_WINDOW = 30 * 1000;     // after watching ad, you have 30s to claim
let adCountdownTimer = null;

// -------- ELEMENTS --------
const balanceDiv = document.getElementById("balance");
const unclaimedDiv = document.getElementById("unclaimed");
const startBtn = document.getElementById("start");

const statusEl = document.getElementById("status");
const dailyEl = document.getElementById("daily");

const watchAdBtn = document.getElementById("watchAd");
const claimBtn = document.getElementById("claim");
const claimInfo = document.getElementById("claimInfo");

const buyUpgradeBtn = document.getElementById("buyUpgrade");
const upgradeCostSpan = document.getElementById("upgradeCost");

// -------- SAVE / LOAD --------
function save() {
  localStorage.setItem("bubachain_state", JSON.stringify({
    coins,
    unclaimed,
    running,
    coinsPerMinute,
    upgradeCost,
    activeMinutesToday,
    lastTick,
    lastClaim,
    adReadyUntil,
    date: new Date().toDateString()
  }));
}

function load() {
  const raw = localStorage.getItem("bubachain_state");
  if (!raw) return;

  const data = JSON.parse(raw);

  if (data.date === new Date().toDateString()) {
    activeMinutesToday = data.activeMinutesToday ?? 0;
  } else {
    activeMinutesToday = 0;
  }

  coins = data.coins ?? 0;
  unclaimed = data.unclaimed ?? 0;
  running = data.running ?? false;
  coinsPerMinute = data.coinsPerMinute ?? 1;
  upgradeCost = data.upgradeCost ?? 10;
  lastTick = data.lastTick ?? Date.now();

  lastClaim = data.lastClaim ?? 0;
  adReadyUntil = data.adReadyUntil ?? 0;
}

// -------- UI --------
function updateUI() {
  balanceDiv.innerText = `Balance: ${Math.floor(coins)}`;
  unclaimedDiv.innerText = `Unclaimed: ${Math.floor(unclaimed)}`;
  upgradeCostSpan.innerText = upgradeCost;

  // Status
  let statusText = "Status: Idle";
  if (running && document.hidden) statusText = "Status: Paused (tab hidden)";
  if (running && !document.hidden) statusText = "Status: Running";
  statusEl.innerText = statusText;

  // Daily
  const left = Math.max(0, DAILY_LIMIT - activeMinutesToday);
  dailyEl.innerText = `Daily limit: ${activeMinutesToday}/${DAILY_LIMIT} min (left: ${left})`;

  // Claim cooldown + ad gate
  const now = Date.now();
  const cooldownLeft = Math.max(0, CLAIM_COOLDOWN - (now - lastClaim));
  const adLeft = Math.max(0, adReadyUntil - now);

  // Claim button logic
  const canClaimByAd = adLeft > 0;
  const canClaimByCooldown = cooldownLeft === 0;
  const hasUnclaimed = unclaimed > 0;

  claimBtn.disabled = !(canClaimByAd && canClaimByCooldown && hasUnclaimed);

  if (!hasUnclaimed) {
    claimInfo.innerText = "Earn unclaimed coins first.";
  } else if (cooldownLeft > 0) {
    claimInfo.innerText = `Claim cooldown: ${Math.ceil(cooldownLeft / 1000)}s`;
  } else if (adLeft > 0) {
    claimInfo.innerText = `Ad verified ✅ Claim within ${Math.ceil(adLeft / 1000)}s`;
  } else {
    claimInfo.innerText = "Watch an ad to unlock Claim.";
  }
}

// -------- ACTIONS --------
startBtn.onclick = () => {
  running = true;
  updateUI();
  save();
};

// Simulated ad: 10 seconds countdown
watchAdBtn.onclick = () => {
  watchAdBtn.disabled = true;
  let t = 10;
  watchAdBtn.innerText = `Watching... ${t}s`;

  if (adCountdownTimer) clearInterval(adCountdownTimer);

  adCountdownTimer = setInterval(() => {
    t -= 1;
    if (t <= 0) {
      clearInterval(adCountdownTimer);
      adCountdownTimer = null;

      // unlock claim for 30 seconds
      adReadyUntil = Date.now() + AD_WINDOW;
      watchAdBtn.disabled = false;
      watchAdBtn.innerText = "Watch Ad (10s)";
      updateUI();
      save();
      return;
    }
    watchAdBtn.innerText = `Watching... ${t}s`;
  }, 1000);
};

claimBtn.onclick = () => {
  const now = Date.now();

  // must have ad window
  if (now > adReadyUntil) return;

  // cooldown check
  if (now - lastClaim < CLAIM_COOLDOWN) return;

  if (unclaimed <= 0) return;

  coins += unclaimed;
  unclaimed = 0;

  // consume ad window
  adReadyUntil = 0;

  lastClaim = now;

  updateUI();
  save();
};

buyUpgradeBtn.onclick = () => {
  if (coins < upgradeCost) return;

  coins -= upgradeCost;
  coinsPerMinute += 1;
  upgradeCost = Math.floor(upgradeCost * 1.5);

  updateUI();
  save();
};

// -------- MAIN LOOP --------
setInterval(() => {
  if (!running) return;
  if (document.hidden) return;
  if (activeMinutesToday >= DAILY_LIMIT) return;

  const now = Date.now();
  if (now - lastTick >= 60000) {
    unclaimed += coinsPerMinute;
    activeMinutesToday += 1;
    lastTick = now;

    updateUI();
    save();
  }
}, 1000);

// -------- INIT --------
load();
updateUI();
document.addEventListener("visibilitychange", updateUI);
