import sdk from "@farcaster/miniapp-sdk";

export async function initMiniApp() {
  try {
    // Tell Farcaster the app is ready as soon as UI is mounted
    // We call this after a microtask to avoid blocking initial render.
    await Promise.resolve();
    await sdk.actions.ready();
  } catch {
    // Safe no-op for non-Farcaster contexts (normal browser)
  }
}
