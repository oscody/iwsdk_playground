Serpent Grid XR — Implementation Plan

Context

The playground/ project currently runs one game — Strata, a 3D
falling-blocks puzzle (src/blockGame.ts, booted by src/index.ts). The
request is to add a second game, Serpent Grid XR (a holographic tabletop
Snake game), without deleting existing functionality — Strata must stay fully
playable.

This requires the project to host two games. The chosen architecture is a
launcher menu: a floating holographic menu boots first; the player picks a
game; that game's system is registered at selection time and unregistered on
return. Strata's code stays intact — only additive changes.

Confirmed decisions:

- Coexistence: launcher menu, one game at a time, with a return-to-menu path.
- Iteration-1 scope: core loop + presentation (no obstacles/portals/power-ups/
  boss/room-scale).
- Hand input: point-and-pinch steering for hand-tracking players.

Architecture — launcher

world.registerSystem / unregisterSystem work at runtime, so games are
registered on demand. A persistent GameMenuSystem owns all transitions.

- src/gameHub.ts — tiny shared module: type GameId = "menu" | "strata" | "snake" and a
  mutable gameHub = { requested: GameId }. No signal/dep needed.
- GameMenuSystem is the only system registered at boot. Each frame it
  reconciles: if gameHub.requested !== current, it unregisterSystem(...) the
  old game, registerSystem(...) the new one, shows/hides the menu, and reframes
  the non-immersive camera.
- Menu buttons (STRATA, SERPENT GRID XR) and a persistent corner MENU button
  are 3D meshes carrying RayInteractable + PokeInteractable. The InputSystem
  adds the transient Pressed tag; the menu edge-detects it. These work with
  controller ray and finger poke out of the box.
- Picking a game registers its system (its init() builds + starts it).
  Pressing MENU sets gameHub.requested = "menu", which unregisters the running
  game — triggering its destroy() teardown — and reshows the menu.

Files

New

- src/gameHub.ts — GameId type + gameHub state object.
- src/gameMenu.ts — GameMenuSystem: builds the floating menu (title +
  two game buttons), the persistent MENU button, reconciles game registration,
  sets the menu camera framing.
- src/snakeGame.ts — SnakeGameSystem: the entire Serpent Grid XR game,
  fully self-contained in one root transform entity (same pattern as
  blockGame.ts).

Modified — additive only, no functionality removed

- src/index.ts — register GameMenuSystem instead of BlockGameSystem.
  Strata's camera lines move out (into blockGame.ts). World.create config
  unchanged (xr with handTracking: true — needed for pinch).
- src/blockGame.ts — three additive changes only:
  a. capture the root entity: this.rootEntity = world.createTransformEntity(...),
  b. move Strata's camera framing into init(),
  c. add a destroy() that disposes the game's geometries/materials and the
  root entity (called automatically by unregisterSystem).
  No existing game logic is touched.
- index.html — title → "Immersive Arcade" (cosmetic).

No ui/ or new asset files are required (see Audio below).

Serpent Grid XR design (snakeGame.ts)

Same self-contained pattern as Strata: one SnakeGameSystem owning a gameRoot
Group entity; visual pieces are plain meshes parented under it.

Board — a flat 13×13 tile grid in the X-Z plane (a tabletop), tile size
0.06 m (~0.78 m square), centered at world (0, 0.92, -0.55). Neon line grid,
translucent base plate, glowing emissive frame. A large inward-facing gradient
sphere in gameRoot provides the dark neon "arena" backdrop — self-contained,
so it never affects Strata or the menu.

Serpent — body: {x,z}[] of tile coords (head = body[0]); dir and a
buffered nextDir (prevents 180° reversal). Segment meshes are glowing emissive
rounded cubes pulled from a grow-only pool; the head is visually distinct.
Between ticks each segment lerps from its previous tile to its current tile
(tickTimer / tickInterval) for a smooth energy-glide.

Loop — every tickInterval (starts ~0.32 s): advance head by dir; wall
(board edge) or self-collision → game over; eating the energy orb grows the
snake, respawns the orb on a random free tile, increments score, and shortens
tickInterval (floor ~0.12 s). Energy orb = a pulsing emissive sphere.

Controls (all set nextDir, ignoring direct reversal):

- Keyboard — Arrows / WASD (Up/W → −Z away, Down/S → +Z, Left/A → −X, Right/D → +X).
- Controller — gamepad.getAxesEnteringUp/Down/Left/Right(InputComponent.Thumbstick).
- Floating arrow buttons — four 3D arrow meshes beside the board, each an
  entity tagged with a custom SnakeArrow component (a direction code) plus
  RayInteractable + PokeInteractable. A query { required: [SnakeArrow, Pressed] } with
  .subscribe("qualify", …) turns the snake. Usable by
  controller ray and by finger poke.
- Hand point-and-pinch — for each hand source (input.xr.isPrimary("hand", h)),
  on gamepad.getSelectStart() (pinch), read world.player.raySpaces[h] world
  forward, project to X-Z, snap to the dominant cardinal axis → nextDir.

HUD — a floating canvas-texture panel (proven, zero-risk, same technique as
Strata's score panel) above the board: SCORE, LENGTH, SPEED, and GAME OVER /
restart prompt. Restart via R, a controller button, or an on-board button.

Audio — AudioSource components + AudioUtils.play(entity). Iteration 1:
a positional AudioSource on the orb for the pickup chime and a non-positional
one for game-over, both reusing the existing public/audio/chime.mp3. Code
references /audio/eat.mp3, /audio/gameover.mp3 if present and falls back to
chime.mp3 — dropping nicer files into public/audio/ upgrades the audio with
no code change.

Presentation — emissive "energy" materials, a gentle scale-pulse on the orb
and snake head, neon grid + glowing frame, the gradient arena dome, and smooth
inter-tile motion. Plus per-game lights in gameRoot.

SDK APIs reused (verified, @iwsdk/core 0.4.0)

- createSystem / createComponent / Types — ECS (dist/ecs/).
- RayInteractable, PokeInteractable, Pressed, Hovered — interaction tags
  (dist/input/state-tags.d.ts), processed by the always-on InputSystem.
- world.input.xr.gamepads.left/right → getAxesEntering\*, getButtonDown,
  getSelectStart (@iwsdk/xr-input/dist/gamepad/stateful-gamepad.d.ts).
- world.input.keyboard.getKeyDown/getKeyPressed (dist/input/stateful-keyboard.d.ts).
- world.player.raySpaces[h] (@iwsdk/xr-input/dist/rig/xr-origin.d.ts).
- AudioSource, AudioUtils, PlaybackMode (dist/audio/).
- world.createTransformEntity, world.registerSystem / unregisterSystem,
  entity.destroy() / dispose().
- Three.js classes re-exported from @iwsdk/core (dist/runtime/three.js).

Out of scope (future iterations)

Obstacles, portals, power-ups, boss patterns, room-scale/grabbable board
placement, and uikitml/PanelUI HUDs — all deferred per the chosen scope.

Verification

1. Type check — cd playground && npx tsc --noEmit (must pass clean).
2. Bundle — npx vite build (confirms every import resolves).

Verification

1. Type check — cd playground && npx tsc --noEmit (must pass clean).
2. Bundle — npx vite build (confirms every import resolves).
3. Run — npm run dev:runtime (plain Vite, https://localhost:8081),
   keyboard-testable in the browser:

- Menu appears on load; non-immersive camera frames it.
- Click STRATA → Strata builds and plays exactly as before (regression
  check); the corner MENU button returns to the launcher.
- Click SERPENT GRID XR → board + serpent appear; arrow keys / WASD steer;
  eating orbs grows the snake, raises score, speeds up; wall/self collision
  ends the game; restart works; MENU returns.
- Switch back and forth several times — no leftover meshes, no double-register
  warnings.

4. XR — npm run dev (IWSDK dev server + Quest 3 emulator): verify thumbstick
   steering, ray/poke on arrow + menu buttons, and hand point-and-pinch.
