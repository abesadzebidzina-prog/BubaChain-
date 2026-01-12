export const BASE_CHAIN_ID_HEX = "0x2105"; // Base mainnet

export function hasInjectedWallet() {
  return typeof window !== "undefined" && !!window.ethereum && typeof window.ethereum.request === "function";
}

export async function connectInjectedWallet() {
  if (!hasInjectedWallet()) throw new Error("No injected wallet detected.");

  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  const address = accounts?.[0];
  if (!address) throw new Error("No wallet address returned.");

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
    // not fatal
  }

  return { address, chainId };
}

export function formatAddr(addr) {
  return addr ? addr.slice(0, 6) + "…" + addr.slice(-4) : "";
}
