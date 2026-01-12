export async function connectWallet() {
  if (!window.ethereum) {
    throw new Error("No wallet detected");
  }
  const accounts = await window.ethereum.request({
    method: "eth_requestAccounts"
  });
  return accounts[0];
}
