const KEY = "bubachain_state_mvp";

export function createGame() {
  const state = {
    balanceBC: 0,
    unclaimedBC: 0,
    running: false,

    // simple idle
    baseRatePerMin: 1,

    // daily limit
    activeMinutesToday: 0,
    dailyLimitMin: 360,

    // claim gate
    lastClaimMs: 0,
    claimCooldownMs: 60_000,
    adReadyUntilMs: 0,
    adWindowMs: 30_000,

    // storm (rare + strong)
    stormActive: false,
    stormEndsAtMs: 0,
    nextStormAtMs: 0,

    // daily boost
    dailyClaimedDate: "",
    dailyBoostUntilMs: 0,

    soundOn: true,
    lastTickMs: Date.now()
  };

  function todayStr() { return new Date().toDateString(); }

  function save() {
    localStorage.setItem(KEY, JSON.stringify({ ...state, _date: todayStr() }));
  }

  function load() {
    const raw = localStorage.getItem(KEY);
    if (!raw) { scheduleNextStorm(); return; }
    try {
      const data = JSON.parse(raw);

      // daily reset
      if (data._date === todayStr()) {
        state.activeMinutesToday = data.activeMinutesToday ?? 0;
        state.dailyClaimedDate = data.dailyClaimedDate ?? "";
      } else {
        state.activeMinutesToday = 0;
        state.dailyClaimedDate = "";
      }

      Object.assign(state, data);
      if (!state.nextStormAtMs) scheduleNextStorm();

      const now = Date.now();
      if (state.stormActive && now > state.stormEndsAtMs) endStorm();
    } catch {
      scheduleNextStorm();
    }
  }

  function start() { state.running = true; }

  function scheduleNextStorm(now = Date.now()) {
    const min = 5 * 60_000;
    const max = 15 * 60_000;
    state.nextStormAtMs = now + Math.floor(min + Math.random() * (max - min));
  }

  function startStorm(now = Date.now()) {
    state.stormActive = true;
    state.stormEndsAtMs = now + 30_000; // 30s
  }

  function endStorm() {
    state.stormActive = false;
    state.stormEndsAtMs = 0;
    scheduleNextStorm();
  }

  function dailyAvailable() {
    return state.dailyClaimedDate !== todayStr();
  }

  function claimDaily(now = Date.now()) {
    if (!dailyAvailable()) return false;
    state.dailyBoostUntilMs = now + 10 * 60_000; // +50% for 10 min
    state.dailyClaimedDate = todayStr();
    return true;
  }

  function effectiveRate(now = Date.now()) {
    let rate = state.baseRatePerMin;

    if (now < state.dailyBoostUntilMs) rate *= 1.5;
    if (state.stormActive) rate *= 2;

    return rate;
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

    const bonus = state.stormActive ? 1.2 : 1.0;
    const gained = Math.floor(state.unclaimedBC * bonus);

    state.balanceBC += gained;
    state.unclaimedBC = 0;
    state.adReadyUntilMs = 0;
    state.lastClaimMs = now;

    return { ok: true, gained };
  }

  function tick(now = Date.now()) {
    // storm scheduling
    if (!state.stormActive && now >= state.nextStormAtMs) startStorm(now);
    if (state.stormActive && now >= state.stormEndsAtMs) endStorm();

    // light anti-cheat
    if (!state.running) return;
    if (document.hidden) return;
    if (state.activeMinutesToday >= state.dailyLimitMin) return;

    // minute tick
    if (now - state.lastTickMs >= 60_000) {
      state.unclaimedBC += Math.floor(effectiveRate(now));
      state.activeMinutesToday += 1;
      state.lastTickMs = now;
    }
  }

  load();

  return {
    state,
    save,
    start,
    tick,
    watchAdUnlock,
    canClaim,
    claim,
    dailyAvailable,
    claimDaily,
    effectiveRate
  };
}
