const STORAGE_KEY = "bubachain:v2";
const now = () => Date.now();
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export const format = (n) => {
  if (!Number.isFinite(n)) return "0";
  if (n < 1000) return n.toFixed(0);
  const units = ["K","M","B","T","Qa","Qi"];
  let u=-1, x=n;
  while (x >= 1000 && u < units.length-1){ x/=1000; u++; }
  return `${x.toFixed(x<10?2:x<100?1:0)}${units[u]}`;
};

export const msToHMS = (ms) => {
  const s = Math.max(0, Math.floor(ms/1000));
  const hh = Math.floor(s/3600);
  const mm = Math.floor((s%3600)/60);
  const ss = s%60;
  const pad = (x) => String(x).padStart(2,"0");
  return hh>0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`;
};

const defaultUpgrades = () => ([
  { id:"mining_rig", name:"Mining Rig", desc:"+0.2 BC/s per level", level:0, baseCost:25,  costMult:1.18, effect:(lvl)=>0.2*lvl },
  { id:"generator",  name:"Generator",  desc:"+1.0 BC/s per level", level:0, baseCost:120, costMult:1.22, effect:(lvl)=>1.0*lvl },
  { id:"storm_magnet",name:"Storm Magnet",desc:"+0.25% storm chance/min per level", level:0, baseCost:180, costMult:1.25, effect:(lvl)=>0.0025*lvl },
  { id:"storm_core", name:"Storm Core", desc:"+x0.5 storm multiplier per level", level:0, baseCost:260, costMult:1.28, effect:(lvl)=>0.5*lvl },
  { id:"daily_booster",name:"Daily Booster",desc:"+25% daily reward per level", level:0, baseCost:150, costMult:1.20, effect:(lvl)=>0.25*lvl },
  { id:"vault", name:"Vault", desc:"Offline cap +30 min per level (max 12h)", level:0, baseCost:220, costMult:1.20, effect:(lvl)=>clamp(30*60*1000*lvl,0,12*60*60*1000) },
]);

export function computeUpgradeCost(upg){
  return Math.floor(upg.baseCost * Math.pow(upg.costMult, upg.level));
}

function computeBaseBps(state){
  const u = state.upgradesById;
  return u.mining_rig.effect(u.mining_rig.level) + u.generator.effect(u.generator.level);
}

function computeStormChancePerMinute(state){
  const base = 0.01; // 1%/min
  const bonus = state.upgradesById.storm_magnet.effect(state.upgradesById.storm_magnet.level);
  return clamp(base + bonus, 0, 0.25);
}

function computeStormMultiplier(state){
  const base = 10;
  const add  = state.upgradesById.storm_core.effect(state.upgradesById.storm_core.level);
  return base + add;
}

export function computeDailyReward(state, { walletMult = 1 } = {}){
  const base = 50;
  const totalLvls = Object.values(state.upgradesById).reduce((a,u)=>a+u.level,0);
  const scaling = totalLvls * 8;
  const booster = 1 + state.upgradesById.daily_booster.effect(state.upgradesById.daily_booster.level);
  return Math.floor((base + scaling) * booster * walletMult);
}

export function isDailyReady(state){
  const last = state.dailyLastClaimAt || 0;
  return now() - last >= 24*60*60*1000;
}

function makeState(){
  const upgrades = defaultUpgrades();
  const upgradesById = Object.fromEntries(upgrades.map(u=>[u.id,u]));
  return {
    version:2,
    bc:0,
    totalEarned:0,
    lastTickAt: now(),
    dailyLastClaimAt:0,
    stormActive:false,
    stormEndsAt:0,
    lastStormAt:0,
    upgradesById,
  };
}

export function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return makeState();
    const parsed = JSON.parse(raw);
    const s = makeState();

    if(typeof parsed.bc==="number") s.bc = parsed.bc;
    if(typeof parsed.totalEarned==="number") s.totalEarned = parsed.totalEarned;
    if(typeof parsed.lastTickAt==="number") s.lastTickAt = parsed.lastTickAt;
    if(typeof parsed.dailyLastClaimAt==="number") s.dailyLastClaimAt = parsed.dailyLastClaimAt;

    if(parsed.upgradesById){
      for(const [id,u] of Object.entries(s.upgradesById)){
        const lvl = parsed.upgradesById?.[id]?.level;
        if(Number.isFinite(lvl)) u.level = Math.max(0, Math.floor(lvl));
      }
    }

    if(parsed.stormActive && typeof parsed.stormEndsAt==="number"){
      s.stormActive = parsed.stormEndsAt > now();
      s.stormEndsAt = parsed.stormEndsAt;
    }
    if(typeof parsed.lastStormAt==="number") s.lastStormAt = parsed.lastStormAt;

    return s;
  }catch{
    return makeState();
  }
}

export function saveState(state){
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    version: state.version,
    bc: state.bc,
    totalEarned: state.totalEarned,
    lastTickAt: state.lastTickAt,
    dailyLastClaimAt: state.dailyLastClaimAt,
    stormActive: state.stormActive,
    stormEndsAt: state.stormEndsAt,
    lastStormAt: state.lastStormAt,
    upgradesById: Object.fromEntries(Object.entries(state.upgradesById).map(([id,u])=>[id,{level:u.level}])),
  }));
}

function applyEarnings(state, amount){
  if(amount<=0) return;
  state.bc += amount;
  state.totalEarned += amount;
}

function startStorm(state){
  state.stormActive = true;
  const durationSec = 15;
  state.stormEndsAt = now() + durationSec*1000;
  state.lastStormAt = now();
  return { type:"storm_start", durationSec };
}

function endStormIfNeeded(state){
  if(state.stormActive && now() >= state.stormEndsAt){
    state.stormActive = false;
    state.stormEndsAt = 0;
    return { type:"storm_end" };
  }
  return null;
}

export function offlineCatchup(state, { walletMult = 1 } = {}){
  const elapsed = Math.max(0, now() - (state.lastTickAt || now()));
  const cap = state.upgradesById.vault.effect(state.upgradesById.vault.level);
  const capped = cap > 0 ? Math.min(elapsed, cap) : 0;
  if(capped <= 0) return { applied:0, elapsedMs:elapsed, cappedMs:0 };

  const bps = computeBaseBps(state);
  const earned = bps * walletMult * (capped/1000);
  applyEarnings(state, earned);
  return { applied:earned, elapsedMs:elapsed, cappedMs:capped };
}

export function tick(state, { walletMult = 1 } = {}){
  const t = now();
  const dtMs = Math.max(0, t - state.lastTickAt);
  state.lastTickAt = t;

  const events = [];

  const stormEnd = endStormIfNeeded(state);
  if(stormEnd) events.push(stormEnd);

  const baseBps = computeBaseBps(state);
  const stormMult = state.stormActive ? computeStormMultiplier(state) : 1;

  // walletMult applies to ALL earnings (connected/verified bonus)
  applyEarnings(state, baseBps * stormMult * walletMult * (dtMs/1000));

  const pm = computeStormChancePerMinute(state);
  const pTick = 1 - Math.pow(1 - pm, dtMs/(60*1000));
  if(!state.stormActive && Math.random() < pTick){
    events.push(startStorm(state));
  }

  return {
    bc: state.bc,
    bps: baseBps * walletMult,
    rawBps: baseBps,
    walletMult,
    isStorm: state.stormActive,
    stormEndsInMs: state.stormActive ? Math.max(0, state.stormEndsAt - t) : 0,
    stormMult: computeStormMultiplier(state),
    dailyReady: isDailyReady(state),
    events,
  };
}

export function buyUpgrade(state, id){
  const u = state.upgradesById[id];
  if(!u) return { ok:false, reason:"unknown_upgrade" };
  const cost = computeUpgradeCost(u);
  if(state.bc < cost) return { ok:false, reason:"not_enough_bc", cost };
  state.bc -= cost;
  u.level += 1;
  return { ok:true, id, newLevel:u.level, cost };
}

export function claimDaily(state, { walletMult = 1 } = {}){
  if(!isDailyReady(state)) return { ok:false, reason:"not_ready" };
  const reward = computeDailyReward(state, { walletMult });
  state.dailyLastClaimAt = now();
  applyEarnings(state, reward);
  return { ok:true, reward };
}
