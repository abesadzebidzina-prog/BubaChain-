/**
 * BubaChain game logic (Vanilla JS)
 * - Calm idle mining
 * - Rare, strong Storm Mode (explosive visuals + subtle sound)
 * - Daily rewards + long-term goals
 * - Upgrade-only progression (5–6 upgrades)
 * - Claim gated by "Ad simulation"
 * - Anti-cheat light: tab must be visible, daily limit, cooldown
 */

const STORAGE_KEY = "bubachain_state_v1";

export function createGame() {
  const state = {
    // currency
    balanceBC: 0,
    unclaimedBC: 0,

    // run state
    running: false,
    lastTickMs: Date.now(),
    activeMinutesToday: 0,
    dailyLimitMin: 360,

    // claim gating
    lastClaimMs: 0,
    claimCooldownMs: 60_000,
    adReadyUntilMs: 0,
    adWindowMs: 30_000,

    // upgrades (levels)
    upgrades: {
      miner: 0,        // +rate
      turbo: 0,        // storm frequency
      stormBoost: 0,   // storm multiplier/duration
      claimBoost: 0,   // shorter cooldown
      capacity: 0,     // higher daily limit
      luck: 0          // optional: slightly higher storm chance
    },

    // storm mode
    stormActive: false,
    stormEndsAtMs: 0,
    nextStormAtMs: 0,

    // daily reward
    dailyClaimedDate: "",  // to enforce daily reward
    dailyBoostUntilMs: 0,  // +50% for 10 minutes

    // settings
    soundOn: true
  };

  function todayStr() {
    return new Date().toDateString();
  }

  function load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      scheduleNextStorm();
      return;
    }
    try {
      const data = JSON.parse(raw);

      // daily reset for active minutes
      if (data._date === todayStr()) {
        state.activeMinutesToday = data.activeMinutesToday ?? 0;
        state.dailyClaimedDate = data.dailyClaimedDate ?? "";
      } else {
        state.activeMinutesToday = 0;
        state.dailyClaimedDate = "";
      }

      state.balanceBC = data.balanceBC ?? 0;
      state.unclaimedBC = data.unclaimedBC ?? 0;
      state.running = data.running ?? false;
      state.lastTickMs = data.lastTickMs ?? Date.now();

      state.lastClaimMs = data.lastClaimMs ?? 0;
      state.adReadyUntilMs = data.adReadyUntilMs ?? 0;

      state.upgrades = { ...state.upgrades, ...(data.upgrades || {}) };

      state.stormActive = data.stormActive ?? false;
      state.stormEndsAtMs = data.stormEndsAtMs ?? 0;
      state.nextStormAtMs = data.nextStormAtMs ?? 0;

      state.dailyBoostUntilMs = data.dailyBoostUntilMs ?? 0;

      state.soundOn = data.soundOn ?? true;

      // enforce derived values
      applyDerived();

      // if storm expired while away, end it
      const now = Date.now();
      if (state.stormActive && now > state.stormEndsAtMs) {
        state.stormActive = false;
        state.stormEndsAtMs = 0;
        scheduleNextStorm();
      }
      if (!state.nextStormAtMs) scheduleNextStorm();
    } catch {
      scheduleNextStorm();
    }
  }

  function save() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        _date: todayStr(),
        balanceBC: state.balanceBC,
        unclaimedBC: state.unclaimedBC,
        running: state.running,
        lastTickMs: state.lastTickMs,
        activeMinutesToday: state.activeMinutesToday,

        lastClaimMs: state.lastClaimMs,
        adReadyUntilMs: state.adReadyUntilMs,

        upgrades: state.upgrades,

        stormActive: state.stormActive,
        stormEndsAtMs: state.stormEndsAtMs,
        nextStormAtMs: state.nextStormAtMs,

        dailyClaimedDate: state.dailyClaimedDate,
        dailyBoostUntilMs: state.dailyBoostUntilMs,

        soundOn: state.soundOn
      })
    );
  }

  function resetAll() {
    localStorage.removeItem(STORAGE_KEY);
    Object.assign(state, createGame().state);
  }

  function applyDerived() {
    // Claim Boost reduces cooldown
    const claimLevel = state.upgrades.claimBoost;
    const baseCooldown = 60_000;
    state.claimCooldownMs = Math.max(15_000, baseCooldown - claimLevel * 8_000);

    // Capacity increases daily limit
    const capLevel = state.upgrades.capacity;
    state.dailyLimitMin = 360 + capLevel * 60; // +1h per level
  }

  function baseRatePerMin() {
    // Miner upgrade increases baseline rate
    // Start 1 BC/min, +1 per miner level
    return 1 + state.upgrades.miner;
  }

  function stormSettings() {
    // Rare & strong. Turbo makes it a bit more frequent.
    // StormBoost increases multiplier/duration.
    const boost = state.upgrades.stormBoost;
    const mult = 2 + boost * 0.25; // 2.0 -> 3.25 at boost=5
    const dur = 30_000 + boost * 3_000; // 30s -> 45s at boost=5
    return { mult, dur };
  }

  function turboWindowMs() {
    // Frequency window: 5–15 minutes, turbo pulls it down mildly.
    const t = state.upgrades.turbo;
    const min = Math.max(3 * 60_000, 5 * 60_000 - t * 20_000);
    const max = Math.max(min + 60_000, 15 * 60_000 - t * 40_000);
    return { min, max };
  }

  function luckBonusChance() {
    // Optional: tiny extra chance to trigger storm early
    return Math.min(0.15, state.upgrades.luck * 0.03);
  }

  function scheduleNextStorm(now = Date.now()) {
    const { min, max } = turboWindowMs();
    const delay = Math.floor(min + Math.random() * (max - min));
    state.nextStormAtMs = now + delay;
  }

  function startStorm(now = Date.now()) {
    const { dur } = stormSettings();
    state.stormActive = true;
    state.stormEndsAtMs = now + dur;
  }

  function endStorm() {
    state.stormActive = false;
    state.stormEndsAtMs = 0;
    scheduleNextStorm();
  }

  function effectiveRatePerMin(now = Date.now()) {
    let rate = baseRatePerMin();

    // Daily boost (+50% for 10 min)
    if (now < state.dailyBoostUntilMs) rate *= 1.5;

    // Storm multiplies strongly
    if (state.stormActive) {
      const { mult } = stormSettings();
      rate *= mult;
    }

    return rate;
  }

  function canTick(now = Date.now()) {
    if (!state.running) return false;
    if (document.hidden) return false; // light anti-cheat
    if (state.activeMinutesToday >= state.dailyLimitMin) return false;
    return true;
  }

  function tick(now = Date.now()) {
    // storm scheduler
    if (!state.stormActive) {
      if (now >= state.nextStormAtMs) startStorm(now);
      else if (Math.random() < luckBonusChance() * 0.01) startStorm(now); // tiny nudge
    } else {
      if (now >= state.stormEndsAtMs) endStorm();
    }

    if (!canTick(now)) return;

    // minute-based earnings
    if (now - state.lastTickMs >= 60_000) {
      const rate = effectiveRatePerMin(now);
      state.unclaimedBC += Math.floor(rate);
      state.activeMinutesToday += 1;
      state.lastTickMs = now;
    }
  }

  function watchAdUnlock(now = Date.now()) {
    state.adReadyUntilMs = now + state.adWindowMs;
  }

  function canClaim(now = Date.now()) {
    if (state.unclaimedBC <= 0) return false;
    if (now - state.lastClaimMs < state.claimCooldownMs) return false;
    if (now > state.adReadyUntilMs) return false;
    return true;
  }

  function claim(now = Date.now()) {
    if (!canClaim(now)) return { ok: false, gained: 0 };

    // Storm claim bonus: +20% on unclaimed (rare & exciting)
    const stormBonus = state.stormActive ? 1.2 : 1.0;
    const gained = Math.floor(state.unclaimedBC * stormBonus);

    state.balanceBC += gained;
    state.unclaimedBC = 0;
    state.adReadyUntilMs = 0;
    state.lastClaimMs = now;
    return { ok: true, gained };
  }

  function dailyAvailable() {
    return state.dailyClaimedDate !== todayStr();
  }

  function claimDaily(now = Date.now()) {
    if (!dailyAvailable()) return false;
    // Daily Boost: +50% for 10 minutes (fits “balanced” and “zen -> peak”)
    state.dailyBoostUntilMs = now + 10 * 60_000;
    state.dailyClaimedDate = todayStr();
    return true;
  }

  function upgradeDefs() {
    // 5–6 upgrades with simple scaling
    return [
      {
        key: "miner",
        title: "Miner",
        desc: "Increase base BC per minute.",
        cost: (lvl) => Math.floor(25 * Math.pow(1.55, lvl))
      },
      {
        key: "turbo",
        title: "Turbo",
        desc: "Storms arrive a bit sooner (still rare).",
        cost: (lvl) => Math.floor(80 * Math.pow(1.6, lvl))
      },
      {
        key: "stormBoost",
        title: "Storm Booster",
        desc: "Stronger / longer Storms.",
        cost: (lvl) => Math.floor(140 * Math.pow(1.65, lvl))
      },
      {
        key: "claimBoost",
        title: "Claim Booster",
        desc: "Shorter claim cooldown.",
        cost: (lvl) => Math.floor(90 * Math.pow(1.62, lvl))
      },
      {
        key: "capacity",
        title: "Daily Capacity",
        desc: "Increase daily active mining limit.",
        cost: (lvl) => Math.floor(120 * Math.pow(1.58, lvl))
      },
      {
        key: "luck",
        title: "Lucky Spark",
        desc: "Tiny chance to trigger Storm a bit earlier.",
        cost: (lvl) => Math.floor(110 * Math.pow(1.6, lvl))
      }
    ];
  }

  function buyUpgrade(key) {
    const def = upgradeDefs().find((d) => d.key === key);
    if (!def) return { ok: false, reason: "unknown" };

    const lvl = state.upgrades[key] ?? 0;
    const cost = def.cost(lvl);
    if (state.balanceBC < cost) return { ok: false, reason: "no_funds" };

    state.balanceBC -= cost;
    state.upgrades[key] = lvl + 1;
    applyDerived();
    return { ok: true };
  }

  load();
  applyDerived();

  return {
    state,
    save,
    tick,
    resetAll,
    watchAdUnlock,
    claim,
    canClaim,
    dailyAvailable,
    claimDaily,
    upgradeDefs,
    buyUpgrade,
    effectiveRatePerMin,
    baseRatePerMin
  };
}
