import sdk from "@farcaster/miniapp-sdk";

// Returns minimal Farcaster context if available:
// { fid, username, displayName } or null
export async function getFarcasterUser() {
  try {
    // Many environments expose context through sdk.context
    // We try a few safe patterns.
    const ctx = sdk?.context;

    // If context is a promise-like getter in your SDK version
    const resolved = (typeof ctx?.then === "function") ? await ctx : ctx;

    const user =
      resolved?.user ||
      resolved?.viewer ||
      resolved?.client?.user ||
      resolved?.client?.viewer ||
      null;

    const fid = user?.fid ?? user?.id ?? null;
    const username = user?.username ?? user?.handle ?? null;
    const displayName = user?.displayName ?? user?.name ?? null;

    if (!fid && !username && !displayName) return null;
    return { fid: fid ? Number(fid) : null, username, displayName };
  } catch {
    return null;
  }
}

export async function initMiniApp() {
  try {
    await Promise.resolve();
    await sdk.actions.ready();
  } catch {
    // ok in non-Farcaster
  }
}
