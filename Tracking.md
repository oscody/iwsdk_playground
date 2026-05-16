add Serpent Grid XR game and launcher menu
- Introduced GameMenuSystem to manage game selection and transitions.
- Added gameHub for shared state between games.
- Implemented Serpent Grid XR as a self-contained game with its own system.
- Updated index.ts to register GameMenuSystem instead of BlockGameSystem.
- Modified blockGame.ts to support game unregistration and cleanup.
- Created gameMenu.ts for the floating menu interface.
- Added snakeGame.ts for the new Snake game implementation.
- Enhanced user interaction with keyboard and hand tracking controls.