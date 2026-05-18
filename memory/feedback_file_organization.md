---
name: feedback-file-organization
description: User prefers game-specific subfolders and a shared/ folder for cross-game utilities in this project
metadata:
  type: feedback
---

Each game gets its own subfolder under `src/` (e.g. `strata/`, `serpent-grid/`). Cross-game utilities go in `src/shared/`.

**Why:** User explicitly requested this layout — "I wanted each game in sub folder example 'STRATA' or 'Serpent Grid'". When asked about shared files, chose `src/shared/` over keeping them flat at root or using `src/launcher/`.

**How to apply:** When creating new game systems or adding files to this project, always place them under the appropriate game subfolder or `shared/`. Do not add new flat files directly under `src/` (except `index.ts`).
