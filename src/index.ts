import { SessionMode, World } from "@iwsdk/core";

import { GameMenuSystem } from "./gameMenu.js";

/**
 * Immersive Arcade — a launcher hosting multiple WebXR games built on the
 * Immersive Web SDK. A floating menu lets the player pick a game; only the
 * chosen game's system runs at a time (see GameMenuSystem / gameHub.ts).
 *
 *   - Strata          — a 3D layer-clearing falling-blocks puzzle (blockGame.ts)
 *   - Serpent Grid XR — a holographic tabletop Snake game (snakeGame.ts)
 *
 * This file just boots the World and registers the launcher.
 */
World.create(document.getElementById("scene-container") as HTMLDivElement, {
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    offer: "always", // browser/headset surfaces an "enter VR" offer
    features: { handTracking: true, layers: true },
  },
}).then((world) => {
  world.registerSystem(GameMenuSystem);
});
