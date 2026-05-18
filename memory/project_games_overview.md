---
name: project-games-overview
description: Overview of the two games and the launcher in the Immersive Arcade VR playground
metadata:
  type: project
---

The playground is called **Immersive Arcade** — a WebXR launcher hosting two games, one active at a time.

**Why:** Multiple games share one World; `GameMenuSystem` is always registered and swaps game systems in/out via `gameHub.requested`.

**How to apply:** When adding a third game, create a new subfolder under `src/`, register its system in `gameMenu.ts`'s `applyTransition()`, and add a game card in `buildMenu()`. See [[project-src-structure]].

## Games

### Strata (`src/strata/blockGame.ts`)
- 3D falling-blocks puzzle (Tetris-style)
- Pit: 4×4 columns × 10 floors, 0.1 m per cell
- Controls: Arrows/WASD move, Q/E rotate, Space hard-drop, Shift soft-drop, R restart; XR thumbstick + buttons
- Key constant: `PIT_Z = -0.6`, `PIT_Y = 1.0`
- No local deps — self-contained

### Serpent Grid XR (`src/serpent-grid/`)
- Holographic tabletop Snake game
- 13×13 neon grid, 0.06 m tiles, board at `{ x:0, y:1.0, z:-0.85 }`
- Controls: Arrows/WASD, XR thumbstick, floating arrow buttons (ray/poke), point-and-pinch with hand tracking
- Key constants: `START_TICK=0.34s`, `MIN_TICK=0.12s`, `TICK_STEP=0.025s`, `START_LEN=1`
- Dependencies: `holoUi`, `layoutState`, `snakeHud`

## Launcher
- `GameMenuSystem` always running — floating neon menu with two game cards
- `gameHub.requested: GameId` (`"menu" | "strata" | "snake"`) drives transitions
- Transitions are microtask-deferred so `registerSystem`/`unregisterSystem` never fires mid-update
- Strata gets a corner MENU button; Serpent Grid XR draws its own MENU button in its HUD
- Keyboard: `1` → Strata, `2` → Serpent Grid XR, `Escape` → menu from any game

## Shared UI Style
- `HOLO` palette: cyan `#46e0c0`, green `#3fe07a`, amber `#ffb020`, red `#ff6b6b`, text `#f5f7ff`, lavender `#9aa4d4`
- `drawHoloPanel()`, `drawHoloText()`, `makeGlowMaterial()`, `makeScanlineTexture()` in `shared/holoUi.ts`
