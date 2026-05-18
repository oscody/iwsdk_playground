---
name: project-src-structure
description: Source folder layout for the Immersive Arcade VR playground project — games in subfolders, shared utilities in shared/
metadata:
  type: project
---

The `src/` directory was reorganized (2026-05-18) into per-game subfolders plus a shared/ folder.

**Why:** User wanted each game isolated in its own subfolder for clarity and scalability.

**How to apply:** When adding new files, place game-specific code under its game subfolder and cross-game utilities under `shared/`.

```
src/
  index.ts                    # World.create() entry point
  strata/
    blockGame.ts              # BlockGameSystem — 3D falling-blocks puzzle
  serpent-grid/
    snakeGame.ts              # SnakeGameSystem — holographic tabletop Snake
    snakeHud.ts               # SnakeHud class (used by snakeGame)
  shared/
    gameHub.ts                # gameHub singleton + GameId type — launcher state
    gameMenu.ts               # GameMenuSystem — the launcher/menu UI
    holoUi.ts                 # Neon holographic canvas/texture helpers (HOLO palette, drawHoloPanel, drawHoloText, makeGlowMaterial, makeScanlineTexture)
    layoutState.ts            # snakeLayoutState — board/HUD coordinate bridge between SnakeGameSystem and PlayerTunerSystem
    playerTuner.ts            # PlayerTunerSystem — dev overlay for adjusting player height
```

**Import path conventions:**
- `index.ts` → `./shared/gameMenu.js`, `./shared/playerTuner.js`
- `shared/gameMenu.ts` → `../strata/blockGame.js`, `../serpent-grid/snakeGame.js`, `./gameHub.js`, `./holoUi.js`
- `serpent-grid/snakeGame.ts` → `../shared/holoUi.js`, `../shared/layoutState.js`, `./snakeHud.js`
- `serpent-grid/snakeHud.ts` → `../shared/holoUi.js`
- `shared/playerTuner.ts` → `./layoutState.js`
