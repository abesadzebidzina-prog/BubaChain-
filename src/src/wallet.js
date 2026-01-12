/**
 * Wallet connect (Base / EVM):
 * We try injected EIP-1193 first (window.ethereum).
 * Base is EVM, so the same address format (0x...) applies.
 */

export const BASE_CHAIN_ID_DEC = 8453;
export const BASE_CHAIN_ID_HEX = "0x2105";

export function hasInjectedWallet() {
  return typeof window !== "undefined" && !!window.ethereum && typeof window.ethereum.request === "function";
}

export async function connectInjectedWallet() {
  if (!hasInjectedWallet()) {
    throw new Error("No injected wallet found. Open inside a wallet-enabled client or use a wallet browser.");
  }
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  const address = accounts?.[0] || null;
  if (!address) throw new Error("No account returned by wallet.");

  // attempt to switch to Base
  let chainId = null;
  try {
    chainId = await window.ethereum.request({ method: "eth_chainId" });
    if (chainId !== BASE_CHAIN_ID_HEX) {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: BASE_CHAIN_ID_HEX }]
      });
      chainId = BASE_CHAIN_ID_HEX;
    }
  } catch {
    // not fatal — user can still play
  }

  return { address, chainId };
}

export async function disconnectInjectedWallet() {
  // Most injected wallets don't support programmatic disconnect.
  return true;
}

export function formatAddr(addr) {
  if (!addr) return "";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}
