import { SessionMode, World } from "@iwsdk/core";

import { BlockGameSystem } from "./blockGame.js";

/**
 * Strata — a 3D layer-clearing falling-blocks puzzle built on the Immersive
 * Web SDK. Flat tetromino pieces fall into a 4 x 4 x 10 pit; fill a whole
 * horizontal layer and it clears, dropping everything above it.
 *
 * All scene content and game logic lives in BlockGameSystem — this file just
 * boots the World and registers that system.
 */
World.create(document.getElementById("scene-container") as HTMLDivElement, {
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    offer: "always", // browser/headset surfaces an "enter VR" offer
    features: { handTracking: true, layers: true },
  },
}).then((world) => {
  // Non-immersive (browser) view: peer down into the pit from just above it.
  // In an XR session the headset drives the camera instead.
  world.camera.position.set(0, 1.72, 0.34);
  world.camera.lookAt(0, 1.02, -0.6);

  world.registerSystem(BlockGameSystem);
});
