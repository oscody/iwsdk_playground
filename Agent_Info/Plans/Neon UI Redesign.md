Immersive Arcade — Neon Holographic UI Redesign

 Context

 The launcher menu and Serpent Grid XR's UI currently use flat, minimal canvas
 panels (dark rectangles, a thin accent bar, plain text). The goal is a premium
 neon holographic VR arcade look — dark navy panels, glowing cyan/purple/
 green edges, corner brackets, holographic depth, and subtle motion — while
 keeping Lithos-level layout discipline (spacing, hierarchy, readable type).

 This is a purely visual pass: no layout, content, wording, or game-logic
 changes. All launcher transitions, input handling, and game rules stay exactly
 as they are.

 Hard constraint: src/blockGame.ts (Strata) must NOT be modified. The menu
 still imports and launches BlockGameSystem — importing is fine, editing is not.

 User decisions: scope = launcher menu + Serpent Grid XR in-game UI;
 depth = layered (neon 2D textures + lightweight 3D glow layers); animation =
 subtle (pulsing glow, drifting scanlines, hover pulse).

 Files

 New

 - src/holoUi.ts — shared neon-holographic helpers, so the menu and the
 snake UI render from one consistent style (DRY).

 Modified (visual only)

 - src/gameMenu.ts — rewrite the visual construction; keep all logic.
 - src/snakeGame.ts — restyle the canvas UI; keep all game logic.

 Untouched

 - src/blockGame.ts (Strata), src/index.ts, src/playerTuner.ts,
 src/gameHub.ts.

 src/holoUi.ts — shared style system

 Pure helpers, imported by both gameMenu.ts and snakeGame.ts:

 - HOLO — palette: cyan #46e0c0 (primary), bright cyan #7ff5e6, purple
 #9b6cff (secondary), green #3fe07a (Serpent Grid XR), navy panel
 #0c1024, lavender text #9aa4d4.
 - drawHoloPanel(ctx, x, y, w, h, opts) — rounded panel (ctx.roundRect) with
 a navy vertical gradient fill, a glowing accent border (shadowBlur stroke),
 a thin inner highlight, and L-shaped corner brackets. opts: accent,
 radius, glow (0–1), brackets.
 - drawHoloText(ctx, text, x, y, opts) — uppercase glow text via shadowBlur +
 ctx.letterSpacing; drawn bloom-then-sharp so it stays readable.
 - makeGlowTexture(color) → CanvasTexture — radial gradient fading to
 transparent, for additive 3D outer-glow planes.
 - makeScanlineTexture() → CanvasTexture — faint repeating horizontal lines;
 UV-scrolled for the drifting-scanline animation.

 Canvases that carry glow are drawn with transparent margins so the bloom bleeds
 past the panel edge without extra meshes.

 Launcher menu — src/gameMenu.ts

 Unchanged: MENU_POS, the class, all fields, init, applyTransition,
 frameMenuCamera, pollButtons, pollKeyboard, setInteractable, and the
 transition/microtask logic. Content & layout (title, subtitle, two cards,
 corner MENU button) unchanged.

 Rewrite the visual builders:
 - Backboard → drawHoloPanel navy gradient, rounded, glowing cyan edge,
 inner highlight, corner brackets, faint scanlines.
 - 3D outer glow → a larger plane behind the backboard, makeGlowTexture
 texture, AdditiveBlending, low opacity — the "suspended in space" halo.
 - Title "IMMERSIVE ARCADE" → drawHoloText, large, wide letter-spacing,
 bright cyan, controlled glow (arcade signage). Subtitle "SELECT A GAME" → a
 small rounded holographic pill.
 - Game cards (makeCard) → redrawable holographic cards: navy rounded rect,
 glowing border in the card accent (STRATA cyan, SERPENT GRID XR green),
 glowing side rail replacing the flat bar, corner brackets, glow title +
 lavender uppercase subtitle. Each card keeps its ctx/tex + a small
 additive glow plane so it can be repainted on hover.
 - Hover/selected → on hover-change, repaint the card with a brighter border/
 glow; keep the scale-up (bump to ~1.06) and add a small z-lift + a brighter,
 pulsing card glow plane.
 - Corner MENU button (buildMenuButton) → same holographic treatment.
 - z-layering — outer glow (back) · backboard · cards (front, slight +z).

 update() gains a delta param + an elapsed accumulator for animation
 (below). The existing hover loop is extended to drive per-card repaint + glow.

 Serpent Grid XR UI — src/snakeGame.ts

 Unchanged: every game rule — tick, startGame, setDir, collision, the
 started/idle state, all input, the board grid/frame/dome/snake/orb geometry
 (already neon — leave geometry & logic alone; only align stray accent colors to
 HOLO).

 Restyle the canvas UI to match the menu, via holoUi helpers:
 - drawHud — holographic panel + drawHoloText for "SERPENT GRID XR",
 SCORE/LENGTH/SPEED, and the GAME OVER state.
 - drawTextButton, drawActionButton, makeArrow — holographic buttons
 (rounded, glowing accent border, corner accents); NEW GAME green, RESTART
 amber, MENU cyan, arrows cyan.
 - buildHud — add a soft additive glow plane behind the HUD group.

 Animation (subtle, performant)

 Driven by elapsed in each system's update(); no per-frame canvas
 redraws (canvases repaint only on state change):
 - Additive glow planes gently pulse opacity/scale via sin (~0.4 Hz).
 - The hovered menu card's glow plane pulses brighter/faster.
 - Scanline overlay texture offset.y drifts slowly.

 Out of scope

 No new menus, navigation, icons, or content. Game names/descriptions unchanged.
 Strata and the Player Tuner overlay are not restyled.

 Verification

 1. cd playground && npx tsc --noEmit — must pass clean.
 2. npx vite build — confirms every import (incl. holoUi.ts) resolves.
 3. With the dev server running + a browser connected (npx iwsdk dev status →
 browserConnected: true): npx iwsdk browser screenshot of the launcher;
 then enter Serpent Grid XR and screenshot its board/HUD/buttons. Check the
 neon panels, glow, corner brackets, hover states, and animation.
 4. Regression: launch Strata from the menu — it must look and play exactly
 as before (its blockGame.ts is untouched).