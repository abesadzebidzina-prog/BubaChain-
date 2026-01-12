import { sdk } from "@farcaster/miniapp-sdk";

export async function initMiniApp() {
  let inMiniApp = false;
  try {
    inMiniApp = await sdk.isInMiniApp();
  } catch {}

  let context = null;
  if (inMiniApp) {
    try { context = sdk.context; } catch {}
  }

  try { await sdk.actions.ready(); } catch {}

  return { inMiniApp, context };
}
