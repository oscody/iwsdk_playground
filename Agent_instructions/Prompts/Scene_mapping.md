Map my Serpent Grid XR scene from the player’s point of view.

Use IWSDK MCP tools if available:
- xr_get_session_status
- xr_get_transform
- scene_get_hierarchy
- scene_get_object_transform
- browser_screenshot
- browser_get_console_logs

If MCP tools are not available, use the IWSDK CLI equivalents:
- iwsdk dev status
- iwsdk xr status
- iwsdk scene hierarchy
- iwsdk browser screenshot

I need a spatial report with these sections:

1. Player origin
   - XR origin position
   - headset/camera position
   - headset forward direction
   - left/right controller positions

2. Board layout
   - board center position
   - board size
   - board distance from player
   - board height relative to player
   - whether the board is centered in front of the player

3. Gameplay objects
   - snake head position
   - snake body segment positions
   - food orb position
   - distance from snake to food
   - whether these are inside the board bounds

4. UI objects
   - restart button position
   - menu button position
   - score panel position
   - arrow button positions
   - whether each button is reachable by controller

5. Player-relative explanation
   Describe everything using natural language:
   “The board is in front of you,”
   “The food is upper-left on the board,”
   “The snake is near the upper-middle,”
   “The arrow controls are closest to the player.”

6. Top-down map
   Make an ASCII map of the scene from above.

7. Fix recommendations
   Tell me what should be moved, resized, lowered, raised, centered, or renamed in code.