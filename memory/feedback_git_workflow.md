---
name: feedback-git-workflow
description: Git file-move rules — always use git mv, never cp+rm, and never commit as part of a "git management" workflow
metadata:
  type: feedback
---

Always use `git mv` for file moves and renames — never `cp` + `rm`.

**Why:** `cp`/`rm` causes git to see D+A pairs instead of renames, losing file history. Discovered when the initial folder restructure was done with `cp`/`rm` and had to be repaired.

**How to apply:**

1. Use `git mv <src> <dst>` for every move/rename.
2. If the destination folder is new, create it first (`mkdir -p`) then `git mv`. Run `git add "destination/"` after moving if git doesn't pick it up.
3. Run `git status` before finishing to confirm moves show as `R` or `RM`, not `D` + `??`.
4. If a D + A pair is found for the same file: undo the add, restore the delete (`git checkout -- <file>`), and redo using `git mv`.
5. After a `git mv`, re-apply any import/content changes using Edit on the moved file's new path.
6. **Never commit or check in when the user says "git management" or "git workflow"** unless they separately and explicitly ask. Stop after the move/rename is verified.
