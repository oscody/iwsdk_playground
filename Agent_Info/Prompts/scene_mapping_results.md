🐍 Serpent Grid XR — Scene Map (player POV)
  
  Data: iwsdk xr get-transform (player rig, live) · iwsdk ecs query (verified code positions) · iwsdk browser screenshot (orb). XR session 
  active, emulated Meta Quest 3. World space, metres; the player faces −Z.

  1. Player origin

  ┌──────────────────────────┬──────────────────────┬────────────────────────────────────────────────┐
  │          Thing           │  Position (x, y, z)  │                     Facing                     │
  ├──────────────────────────┼──────────────────────┼────────────────────────────────────────────────┤
  │ XR origin (world.player) │ (0, 0, 0) — floor    │ —                                              │
  ├──────────────────────────┼──────────────────────┼────────────────────────────────────────────────┤
  │ Headset / camera         │ (0, 1.60, 0)         │ forward (0, 0, −1), level (pitch/yaw/roll = 0) │
  ├──────────────────────────┼──────────────────────┼────────────────────────────────────────────────┤
  │ Left controller          │ (−0.25, 1.50, −0.40) │ −Z, level                                      │
  ├──────────────────────────┼──────────────────────┼────────────────────────────────────────────────┤
  │ Right controller         │ (+0.25, 1.50, −0.40) │ −Z, level                                      │
  └──────────────────────────┴──────────────────────┴────────────────────────────────────────────────┘

  The player stands at the origin, looking straight down −Z. Hands rest ~0.4 m ahead at 1.5 m height.

  2. Board layout

  - Center: (0, 0.92, −0.55)
  - Size: 0.78 m × 0.78 m (13×13 tiles @ 0.06 m), flat — only the neon frame has height (~0.05 m)
  - Footprint (world): x [−0.39, +0.39], z [−0.94, −0.16]
  - Distance from player: center ≈ 0.87 m from the headset; the near edge is only 0.16 m in front of you
  - Height: play surface at y 0.92 → 0.68 m below eye level (look down at it like a low table)
  - Centered in front? Horizontally yes (x = 0). Depth-wise it's dead ahead but too close — the near edge nearly touches the player.

  3. Gameplay objects (snake is idle — NEW GAME not yet pressed)

  ┌───────────────────────────────────┬────────────┬────────────────────────┐
  │              Object               │ Grid tile  │     World position     │
  ├───────────────────────────────────┼────────────┼────────────────────────┤
  │ Snake head                        │ (6, 6)     │ (0, 0.95, −0.55)       │
  ├───────────────────────────────────┼────────────┼────────────────────────┤
  │ Body segment 2                    │ (6, 7)     │ (0, 0.95, −0.49)       │
  ├───────────────────────────────────┼────────────┼────────────────────────┤
  │ Body tail                         │ (6, 8)     │ (0, 0.95, −0.43)       │
  ├───────────────────────────────────┼────────────┼────────────────────────┤
  │ Food orb (random — current spawn) │ ≈ (10, 10) │ ≈ (+0.24, 0.95, −0.31) │
  └───────────────────────────────────┴────────────┴────────────────────────┘

  - Snake runs along the centerline (x = 0), head pointing toward the far edge.
  - Distance snake→food: ≈ 8 tiles Manhattan (0.48 m of travel) / ≈ 0.34 m straight-line.
  - In bounds? Snake ✅, orb ✅ — all within x [−0.39,0.39], z [−0.94,−0.16].

  4. UI objects

  ┌───────────────────────────┬────────────────────────────────────┬─────────────────────────────────────────────────────────────┐
  │          Element          │           World position           │                         Reachable?                          │
  ├───────────────────────────┼────────────────────────────────────┼─────────────────────────────────────────────────────────────┤
  │ ▲ up arrow                │ (0, 1.17, −0.03)                   │ ray ✅ · poke ✅ (~0.5 m, but sits oddly close to the body) │
  ├───────────────────────────┼────────────────────────────────────┼─────────────────────────────────────────────────────────────┤
  │ ▼ down arrow              │ (0, 1.01, −0.03)                   │ ray ✅ · poke ✅                                            │
  ├───────────────────────────┼────────────────────────────────────┼─────────────────────────────────────────────────────────────┤
  │ ◄ left arrow              │ (−0.08, 1.09, −0.03)               │ ray ✅ · poke ✅                                            │
  ├───────────────────────────┼────────────────────────────────────┼─────────────────────────────────────────────────────────────┤
  │ ► right arrow             │ (+0.08, 1.09, −0.03)               │ ray ✅ · poke ✅                                            │
  ├───────────────────────────┼────────────────────────────────────┼─────────────────────────────────────────────────────────────┤
  │ Score / HUD panel         │ (0, 1.26, −0.97), tilted −0.32 rad │ display only                                                │
  ├───────────────────────────┼────────────────────────────────────┼─────────────────────────────────────────────────────────────┤
  │ NEW GAME / RESTART button │ (−0.155, 1.11, −0.92)              │ ray ✅ · poke ✗ (~0.66 m — ray only)                        │
  ├───────────────────────────┼────────────────────────────────────┼─────────────────────────────────────────────────────────────┤
  │ MENU button               │ (+0.155, 1.11, −0.92)              │ ray ✅ · poke ✗                                             │
  └───────────────────────────┴────────────────────────────────────┴─────────────────────────────────────────────────────────────┘

  ⚠️  The arrows sit at z ≈ −0.03 — closer to the player than the controllers themselves (controllers at z = −0.4). You'd pull your hand back 
  toward your chest to poke them.

  5. Player-relative explanation

  - The board floats low in front of you, like a knee-to-waist-high holographic table — centered left-to-right, but its near edge is almost
  against you.
  - The serpent sits in the upper-middle of the board, along the centerline, head aimed away from you (it's waiting on NEW GAME).
  - The food orb is on the lower-right of the board, toward your side.
  - The four arrow controls are closest to you — actually slightly between you and your hands.
  - The score panel and the NEW GAME / MENU buttons are at the far side of the board, up high and ~1 m away — comfortable to point at, too far
   to touch.

  6. Top-down map

     looking straight DOWN          ↑ −Z far        ↓ +Z near (player)

     −X ───────────────── 0 ───────────────── +X
   ┌───────────────────────────────────────────────┐
   │   [NEW GAME]      ░░HUD░░       [MENU]         │  z≈−0.95  (far, ~1m, ray-only)
   │  ╔═══════════════════════════════════════╗    │  z=−0.94  board FAR edge
   │  ║                  ▓ head               ║    │
   │  ║                  ▓                    ║    │  snake (x=0,
   │  ║                  ▓ tail               ║    │   upper-middle)
   │  ║                                       ║    │
   │  ║                          ● food       ║    │  orb (lower-right)
   │  ║                                       ║    │
   │  ╚═══════════════════════════════════════╝    │  z=−0.16  board NEAR edge (only 16cm away!)
   │                     ▲                          │
   │                  ◄ ⊕ ►   arrow cluster         │  z≈−0.03  (almost on the player)
   │       🎮L                      🎮R              │  z=−0.40  controllers
   │                                                │
   │                   👤 PLAYER                    │  z= 0.00  headset (eye 1.6m)
   └───────────────────────────────────────────────┘

  7. Fix recommendations

  ┌─────┬────────────────────────────────────────────────┬────────────────────────────────────────────────────────────────────────────────┐
  │  #  │                     Issue                      │                      Recommended change (in snakeGame.ts)                      │
  ├─────┼────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ 1   │ Board too close — near edge 0.16 m from the    │ Move it forward: BOARD.z −0.55 → −0.85 (near edge → ~0.46 m, a comfortable     │
  │     │ player                                         │ lean-over-a-table distance)                                                    │
  ├─────┼────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ 2   │ Board a bit low for a standing player (0.92 m  │ Raise slightly: BOARD.y 0.92 → ~1.0                                            │
  │     │ vs 1.6 m head)                                 │                                                                                │
  ├─────┼────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ 3   │ Arrow cluster sits on top of the player (z ≈   │ Fix 1 alone moves the arrows to z ≈ −0.33 (good). Otherwise reduce cz = HALF + │
  │     │ −0.03, behind the hands)                       │  0.13 → HALF + 0.05 in buildControls()                                         │
  ├─────┼────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ 4   │ RESTART / MENU are poke-unreachable (~0.66 m,  │ Fine as ray targets. If you want poke access, relocate them near the arrow     │
  │     │ far edge)                                      │ cluster instead of the HUD group                                               │
  ├─────┼────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ 5   │ Every object is (unnamed) in                   │ Set .name on key meshes/groups (board, snake-head, orb, hud, arrow-up…,        │
  │     │ scene_get_hierarchy — undebuggable             │ btn-newgame, btn-menu) so scene inspection is readable                         │
  ├─────┼────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ 6   │ Board is centered in X ✅                      │ No change                                                                      │
  └─────┴────────────────────────────────────────────────┴────────────────────────────────────────────────────────────────────────────────┘

  Single highest-value fix: push the board forward (BOARD.z = −0.85) — it simultaneously fixes the cramped near edge and pulls the arrow
  cluster out to a natural hand distance. Want me to apply fixes 1–3 and 5?