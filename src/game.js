export function createGame() {
  const state = {
    balance: 0,
    unclaimed: 0,
    rate: 1,
    running: false
  };

  function tick() {
    if (!state.running) return;
    state.unclaimed += state.rate / 60;
  }

  function start() {
    state.running = true;
  }

  function claim() {
    state.balance += Math.floor(state.unclaimed);
    state.unclaimed = 0;
  }

  return {
    state,
    tick,
    start,
    claim
  };
}
