import { sdk } from "@farcaster/miniapp-sdk";

/**
 * Mini App readiness:
 * If you don't call ready(), users can see an infinite loading screen. :contentReference[oaicite:2]{index=2}
 */
export async function initMiniApp() {
  let inMiniApp = false;
  try {
    inMiniApp = await sdk.isInMiniApp(); // recommended check :contentReference[oaicite:3]{index=3}
  } catch {
    inMiniApp = false;
  }

  let context = null;
  if (inMiniApp) {
    try {
      context = sdk.context; // context includes user info like fid/username/displayName :contentReference[oaicite:4]{index=4}
    } catch {
      context = null;
    }
  }

  // Call ready as soon as UI is stable
  try {
    await sdk.actions.ready(); // hides splash in clients :contentReference[oaicite:5]{index=5}
  } catch {
    // no-op in normal browsers
  }

  return { inMiniApp, context };
}
