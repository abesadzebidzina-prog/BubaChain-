// src/wallet.js
// EIP-1193 wallet connect + switch to Base + sign message + verified persistence.
// No transactions.

const BASE_MAINNET = {
  chainIdHex: "0x2105", // 8453
  chainId: 8453,
  chainName: "Base",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://mainnet.base.org"],
  blockExplorerUrls: ["https://basescan.org"],
};

const VERIFY_KEY = "bubachain:wallet_verified:v1";

function pickProvider() {
  if (typeof window !== "undefined" && window.ethereum) return window.ethereum;
  return null;
}

function shortAddr(addr) {
  if (!addr || addr.length < 10) return addr || "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

async function req(provider, method, params) {
  return await provider.request({ method, params });
}

function loadVerified() {
  try { return JSON.parse(localStorage.getItem(VERIFY_KEY) || "{}"); }
  catch { return {}; }
}

function saveVerified(map) {
  localStorage.setItem(VERIFY_KEY, JSON.stringify(map));
}

export function createWalletController({ onUpdate } = {}) {
  const provider = pickProvider();

  const state = {
    available: !!provider,
    connected: false,
    address: "",
    addressShort: "",
    chainId: null,
    chainName: "—",
    verified: false, // signature stored for this address
    provider,
  };

  const notify = () => onUpdate && onUpdate({ ...state });

  function syncVerifiedFlag() {
    const map = loadVerified();
    state.verified = !!(state.address && map[state.address?.toLowerCase()]);
  }

  async function refresh() {
    if (!provider) { notify(); return state; }

    try {
      const chainIdHex = await req(provider, "eth_chainId");
      state.chainId = parseInt(chainIdHex, 16);
      state.chainName = state.chainId === BASE_MAINNET.chainId ? "Base" : `Chain ${state.chainId}`;
    } catch {}

    try {
      const accounts = await req(provider, "eth_accounts");
      const addr = accounts?.[0] || "";
      state.connected = !!addr;
      state.address = addr;
      state.addressShort = shortAddr(addr);
      syncVerifiedFlag();
    } catch {}

    notify();
    return state;
  }

  async function connect() {
    if (!provider) throw new Error("No wallet provider found.");
    const accounts = await req(provider, "eth_requestAccounts");
    const addr = accounts?.[0] || "";
    state.connected = !!addr;
    state.address = addr;
    state.addressShort = shortAddr(addr);
    syncVerifiedFlag();
    await refresh();
    return state;
  }

  async function disconnect() {
    // No universal disconnect in EIP-1193; we just clear UI state.
    state.connected = false;
    state.address = "";
    state.addressShort = "";
    state.verified = false;
    notify();
    return state;
  }

  async function switchToBase() {
    if (!provider) throw new Error("No wallet provider.");
    try {
      await req(provider, "wallet_switchEthereumChain", [{ chainId: BASE_MAINNET.chainIdHex }]);
    } catch (err) {
      if (err?.code === 4902) {
        await req(provider, "wallet_addEthereumChain", [BASE_MAINNET]);
      } else {
        throw err;
      }
    }
    await refresh();
    return state;
  }

  async function signToVerify() {
    if (!provider) throw new Error("No wallet provider.");
    if (!state.connected || !state.address) throw new Error("Connect wallet first.");

    const domain = window.location.host;
    const ts = new Date().toISOString();

    const message =
`BubaChain Wallet Verification

Domain: ${domain}
Address: ${state.address}
Time: ${ts}

I verify I control this wallet for BubaChain.`;

    // personal_sign params are [message, address]
    const signature = await req(provider, "personal_sign", [message, state.address]);

    const map = loadVerified();
    map[state.address.toLowerCase()] = {
      message,
      signature,
      verifiedAt: Date.now(),
    };
    saveVerified(map);

    syncVerifiedFlag();
    notify();
    return { ok: true, message, signature };
  }

  async function estimateGasTest() {
    if (!provider) throw new Error("No wallet provider.");
    if (!state.connected || !state.address) throw new Error("Connect wallet first.");

    // Harmless estimate: 0-value tx to yourself with empty data (no send)
    const gas = await req(provider, "eth_estimateGas", [{
      from: state.address,
      to: state.address,
      value: "0x0",
      data: "0x",
    }]);

    return gas; // hex string
  }

  function bindEvents() {
    if (!provider?.on) return;

    provider.on("accountsChanged", (accounts) => {
      const addr = accounts?.[0] || "";
      state.connected = !!addr;
      state.address = addr;
      state.addressShort = shortAddr(addr);
      syncVerifiedFlag();
      notify();
    });

    provider.on("chainChanged", (chainIdHex) => {
      state.chainId = parseInt(chainIdHex, 16);
      state.chainName = state.chainId === BASE_MAINNET.chainId ? "Base" : `Chain ${state.chainId}`;
      notify();
    });
  }

  bindEvents();

  return {
    state,
    refresh,
    connect,
    disconnect,
    switchToBase,
    signToVerify,
    estimateGasTest,
    BASE_MAINNET,
  };
}
