import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  createSystem,
  DirectionalLight,
  DoubleSide,
  EdgesGeometry,
  Entity,
  GridHelper,
  Group,
  InputComponent,
  LineBasicMaterial,
  LineSegments,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  VisibilityState,
} from "@iwsdk/core";

/**
 * Strata game system.
 *
 * The pit is COLS x ROWS wide (X/Z) and FLOORS tall (Y). Pieces are flat
 * tetrominoes — all four cells share one Y layer — that fall straight down.
 * When a horizontal layer is completely filled it clears and everything
 * above drops by one.
 *
 * Cells: integer (cx, cy, cz) with cy = 0 at the bottom. Occupancy and the
 * settled cube meshes are stored in flat arrays indexed by `idx()`.
 *
 * Design note: the small visual cubes are plain Three.js meshes parented to
 * the pit Group rather than ECS entities. One system fully owns them, they
 * never need queries or level lifecycle, and shared geometry/materials make
 * create/remove cheap — so the entity overhead would buy nothing here. The
 * pit itself IS a transform entity, so the scene graph stays well-formed.
 */

const COLS = 4; // pit width  (X)
const ROWS = 4; // pit depth  (Z)
const FLOORS = 10; // pit height (Y)
const SIZE = COLS * ROWS * FLOORS;
const CELL = 0.1; // metres per cell

// World position of the pit's centre.
const PIT_X = 0;
const PIT_Y = 1.0;
const PIT_Z = -0.6;

// Origin cell a fresh piece spawns at (top layer).
const SPAWN_X = 1;
const SPAWN_Z = 1;

const FALL_INTERVAL = 0.85; // seconds between gravity steps
const SOFT_DROP_INTERVAL = 0.05; // ...while soft-drop is held

// One colour per shape (I, O, T, L, J, S, Z).
const COLORS = [
  0x39c5d6, 0xe6b800, 0x9b59d6, 0xe07b39, 0x4a73d6, 0x4caf6a, 0xd6504a,
];

// Flat tetromino shapes as [dx, dz] offsets around a local (0, 0) pivot.
const SHAPES: { id: string; noRotate: boolean; cells: number[][] }[] = [
  { id: "I", noRotate: false, cells: [[-1, 0], [0, 0], [1, 0], [2, 0]] },
  { id: "O", noRotate: true, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  { id: "T", noRotate: false, cells: [[-1, 0], [0, 0], [1, 0], [0, 1]] },
  { id: "L", noRotate: false, cells: [[-1, 0], [0, 0], [1, 0], [1, 1]] },
  { id: "J", noRotate: false, cells: [[-1, 0], [0, 0], [1, 0], [-1, 1]] },
  { id: "S", noRotate: false, cells: [[0, 0], [1, 0], [-1, 1], [0, 1]] },
  { id: "Z", noRotate: false, cells: [[-1, 0], [0, 0], [0, 1], [1, 1]] },
];

// Offsets tried when a rotation would collide ("wall kicks").
const KICKS = [
  [0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2],
];

interface Piece {
  shapeId: number;
  cells: number[][]; // current [dx, dz] offsets (mutated by rotation)
  ox: number;
  oy: number;
  oz: number;
  meshes: Mesh[]; // four active cube meshes, parallel to `cells`
}

export class BlockGameSystem extends createSystem({}) {
  private gameRoot!: Group;
  private rootEntity!: Entity;
  private pit!: Group;
  private cubeGeo!: BoxGeometry;
  private settledMats!: MeshStandardMaterial[];
  private activeMats!: MeshStandardMaterial[];
  private ghostMeshes!: Mesh[];
  private scoreCtx!: CanvasRenderingContext2D;
  private scoreTex!: CanvasTexture;

  private occupied: boolean[] = new Array<boolean>(SIZE).fill(false);
  private cubes: (Mesh | null)[] = new Array<Mesh | null>(SIZE).fill(null);
  private piece: Piece | null = null;

  private fallTimer = 0;
  private score = 0;
  private layers = 0;
  private gameOver = false;

  init() {
    // Non-immersive (browser) view: peer down into the pit. In an XR session
    // the headset drives the camera instead.
    this.world.camera.position.set(0, 1.72, 0.34);
    this.world.camera.lookAt(0, 1.02, -0.6);

    this.buildScene();
    this.startGame();

    // Tear down cleanly when the launcher unregisters this system.
    this.cleanupFuncs.push(() => {
      this.gameRoot.traverse((obj) => {
        const mesh = obj as Mesh;
        mesh.geometry?.dispose?.();
        const mat = mesh.material as Material | Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose?.();
      });
      this.scoreTex.dispose();
      this.rootEntity.dispose();
    });

    console.log(
      "[Strata] Controls — Arrows/WASD move, Q/E rotate, Space hard-drop, " +
        "Shift soft-drop, R restart. XR — thumbstick move, A/B or X/Y rotate, " +
        "trigger hard-drop, squeeze soft-drop.",
    );
  }

  update(delta: number) {
    // Pause while the headset is off the face / focus is lost.
    if (this.world.visibilityState.peek() === VisibilityState.VisibleBlurred) {
      return;
    }

    if (this.gameOver) {
      if (this.wantsRestart()) this.startGame();
      return;
    }

    let softDrop = this.handleKeyboard();
    if (this.handleXRInput()) softDrop = true;
    if (!this.piece) return;

    this.fallTimer += delta;
    const interval = softDrop ? SOFT_DROP_INTERVAL : FALL_INTERVAL;
    if (this.fallTimer >= interval) {
      this.fallTimer = 0;
      this.stepDown();
    }
  }

  // --- scene construction -------------------------------------------------

  private buildScene() {
    this.gameRoot = new Group();
    this.rootEntity = this.world.createTransformEntity(this.gameRoot);

    // Lighting (the materials also self-illuminate, so the pit reads even
    // before the SDK's default lights kick in).
    this.gameRoot.add(new AmbientLight(0xffffff, 0.7));
    const dir = new DirectionalLight(0xffffff, 0.9);
    dir.position.set(0.7, 2.2, 0.6);
    dir.target.position.set(PIT_X, PIT_Y, PIT_Z);
    this.gameRoot.add(dir, dir.target);

    // The pit: a Group at the pit centre; cell (0,0,0) sits at its corner.
    this.pit = new Group();
    this.pit.position.set(PIT_X, PIT_Y, PIT_Z);
    this.gameRoot.add(this.pit);

    const w = COLS * CELL;
    const h = FLOORS * CELL;
    const d = ROWS * CELL;

    const frame = new LineSegments(
      new EdgesGeometry(new BoxGeometry(w, h, d)),
      new LineBasicMaterial({ color: 0x6677bb }),
    );
    this.pit.add(frame);

    const floor = new Mesh(
      new PlaneGeometry(w, d),
      new MeshStandardMaterial({
        color: 0x141726,
        roughness: 0.9,
        transparent: true,
        opacity: 0.9,
        side: DoubleSide,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -h / 2;
    this.pit.add(floor);

    const grid = new GridHelper(w, COLS, 0x8899dd, 0x44486a);
    grid.position.y = -h / 2 + 0.002;
    this.pit.add(grid);

    // Shared cube geometry + per-colour materials (settled and active).
    this.cubeGeo = new BoxGeometry(CELL * 0.9, CELL * 0.9, CELL * 0.9);
    this.settledMats = COLORS.map(
      (c) =>
        new MeshStandardMaterial({
          color: c,
          emissive: c,
          emissiveIntensity: 0.18,
          roughness: 0.35,
          metalness: 0.15,
        }),
    );
    this.activeMats = COLORS.map(
      (c) =>
        new MeshStandardMaterial({
          color: c,
          emissive: c,
          emissiveIntensity: 0.6,
          roughness: 0.3,
          metalness: 0.1,
        }),
    );

    // Four reusable ghost cubes previewing where the piece will land.
    const ghostMat = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    });
    const ghostGeo = new BoxGeometry(CELL * 0.86, CELL * 0.86, CELL * 0.86);
    this.ghostMeshes = [];
    for (let i = 0; i < 4; i++) {
      const g = new Mesh(ghostGeo, ghostMat);
      g.visible = false;
      this.pit.add(g);
      this.ghostMeshes.push(g);
    }

    // Score readout: a canvas-textured plane above the pit (works in 2D and XR).
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    this.scoreCtx = canvas.getContext("2d")!;
    this.scoreTex = new CanvasTexture(canvas);
    this.scoreTex.colorSpace = SRGBColorSpace;
    const panel = new Mesh(
      new PlaneGeometry(0.5, 0.25),
      new MeshBasicMaterial({ map: this.scoreTex, transparent: true }),
    );
    panel.position.set(PIT_X, PIT_Y + h / 2 + 0.2, PIT_Z);
    this.gameRoot.add(panel);
  }

  // --- game lifecycle -----------------------------------------------------

  private startGame() {
    for (let i = 0; i < SIZE; i++) {
      const m = this.cubes[i];
      if (m) this.pit.remove(m);
      this.cubes[i] = null;
      this.occupied[i] = false;
    }
    if (this.piece) {
      for (const m of this.piece.meshes) this.pit.remove(m);
      this.piece = null;
    }
    this.score = 0;
    this.layers = 0;
    this.gameOver = false;
    this.fallTimer = 0;
    this.drawScorePanel();
    this.spawnPiece();
  }

  private spawnPiece() {
    const shapeId = Math.floor(Math.random() * SHAPES.length);
    const cells = SHAPES[shapeId].cells.map((c) => [c[0], c[1]]);
    const meshes: Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const m = new Mesh(this.cubeGeo, this.activeMats[shapeId]);
      this.pit.add(m);
      meshes.push(m);
    }
    this.piece = { shapeId, cells, ox: SPAWN_X, oy: FLOORS - 1, oz: SPAWN_Z, meshes };
    this.fallTimer = 0;
    this.refreshActive();

    // No room for the new piece — the stack has reached the top.
    if (!this.fits(cells, SPAWN_X, FLOORS - 1, SPAWN_Z)) {
      this.gameOver = true;
      for (const g of this.ghostMeshes) g.visible = false;
      this.drawScorePanel();
    }
  }

  // --- piece movement -----------------------------------------------------

  private tryMove(dx: number, dz: number) {
    const p = this.piece;
    if (!p || this.gameOver) return;
    if (this.fits(p.cells, p.ox + dx, p.oy, p.oz + dz)) {
      p.ox += dx;
      p.oz += dz;
      this.refreshActive();
    }
  }

  private rotatePiece(dir: number) {
    const p = this.piece;
    if (!p || this.gameOver || SHAPES[p.shapeId].noRotate) return;
    // 90° yaw in the X-Z plane.
    const rotated = p.cells.map(([x, z]) =>
      dir > 0 ? [z, -x] : [-z, x],
    );
    for (const [kx, kz] of KICKS) {
      if (this.fits(rotated, p.ox + kx, p.oy, p.oz + kz)) {
        p.cells = rotated;
        p.ox += kx;
        p.oz += kz;
        this.refreshActive();
        return;
      }
    }
  }

  private stepDown() {
    const p = this.piece;
    if (!p) return;
    if (this.fits(p.cells, p.ox, p.oy - 1, p.oz)) {
      p.oy -= 1;
      this.refreshActive();
    } else {
      this.lock();
    }
  }

  private hardDrop() {
    const p = this.piece;
    if (!p || this.gameOver) return;
    while (this.fits(p.cells, p.ox, p.oy - 1, p.oz)) p.oy -= 1;
    this.refreshActive();
    this.lock();
  }

  /** Settle the active piece into the grid, clear layers, spawn the next. */
  private lock() {
    const p = this.piece;
    if (!p) return;
    for (let i = 0; i < 4; i++) {
      const cx = p.ox + p.cells[i][0];
      const cz = p.oz + p.cells[i][1];
      const id = this.idx(cx, p.oy, cz);
      this.occupied[id] = true;
      const m = p.meshes[i];
      m.material = this.settledMats[p.shapeId];
      this.cubes[id] = m;
    }
    this.piece = null;
    this.clearFullFloors();
    this.spawnPiece();
  }

  private clearFullFloors() {
    let cleared = 0;
    let cy = 0;
    while (cy < FLOORS) {
      if (!this.floorFull(cy)) {
        cy += 1;
        continue;
      }
      // Remove the full layer.
      for (let cx = 0; cx < COLS; cx++) {
        for (let cz = 0; cz < ROWS; cz++) {
          const id = this.idx(cx, cy, cz);
          const m = this.cubes[id];
          if (m) this.pit.remove(m);
          this.cubes[id] = null;
          this.occupied[id] = false;
        }
      }
      // Drop every layer above it down by one.
      for (let y = cy + 1; y < FLOORS; y++) {
        for (let cx = 0; cx < COLS; cx++) {
          for (let cz = 0; cz < ROWS; cz++) {
            const from = this.idx(cx, y, cz);
            const to = this.idx(cx, y - 1, cz);
            const m = this.cubes[from];
            this.occupied[to] = this.occupied[from];
            this.cubes[to] = m;
            if (m) m.position.y = this.ly(y - 1);
            this.cubes[from] = null;
            this.occupied[from] = false;
          }
        }
      }
      cleared += 1;
      // Re-check this same index — it now holds the shifted-down content.
    }
    if (cleared > 0) {
      this.score += cleared * 100;
      this.layers += cleared;
      this.drawScorePanel();
    }
  }

  // --- helpers ------------------------------------------------------------

  private idx(cx: number, cy: number, cz: number) {
    return cx + cz * COLS + cy * COLS * ROWS;
  }

  /** Local X/Y/Z of a cell centre, relative to the pit Group. */
  private lx(cx: number) {
    return (cx - (COLS - 1) / 2) * CELL;
  }
  private ly(cy: number) {
    return (cy - (FLOORS - 1) / 2) * CELL;
  }
  private lz(cz: number) {
    return (cz - (ROWS - 1) / 2) * CELL;
  }

  /** True if every cell of `cells` placed at the origin is in-bounds and empty. */
  private fits(cells: number[][], ox: number, oy: number, oz: number): boolean {
    if (oy < 0 || oy >= FLOORS) return false;
    for (const [dx, dz] of cells) {
      const cx = ox + dx;
      const cz = oz + dz;
      if (cx < 0 || cx >= COLS || cz < 0 || cz >= ROWS) return false;
      if (this.occupied[this.idx(cx, oy, cz)]) return false;
    }
    return true;
  }

  private floorFull(cy: number): boolean {
    for (let cx = 0; cx < COLS; cx++) {
      for (let cz = 0; cz < ROWS; cz++) {
        if (!this.occupied[this.idx(cx, cy, cz)]) return false;
      }
    }
    return true;
  }

  /** Reposition the active piece's cubes (and the ghost) to the grid. */
  private refreshActive() {
    const p = this.piece;
    if (!p) return;
    for (let i = 0; i < 4; i++) {
      const [dx, dz] = p.cells[i];
      p.meshes[i].position.set(
        this.lx(p.ox + dx),
        this.ly(p.oy),
        this.lz(p.oz + dz),
      );
    }
    this.updateGhost();
  }

  private updateGhost() {
    const p = this.piece;
    if (!p || this.gameOver) {
      for (const g of this.ghostMeshes) g.visible = false;
      return;
    }
    let gy = p.oy;
    while (this.fits(p.cells, p.ox, gy - 1, p.oz)) gy -= 1;
    for (let i = 0; i < 4; i++) {
      const [dx, dz] = p.cells[i];
      const g = this.ghostMeshes[i];
      g.position.set(this.lx(p.ox + dx), this.ly(gy), this.lz(p.oz + dz));
      g.visible = gy !== p.oy; // hide when it would overlap the piece
    }
  }

  // --- input --------------------------------------------------------------

  /** Keyboard input. Returns whether soft-drop is held. */
  private handleKeyboard(): boolean {
    const k = this.input.keyboard;
    const down = (code: string) => k.getKeyDown(code);
    if (down("ArrowLeft") || down("KeyA")) this.tryMove(-1, 0);
    if (down("ArrowRight") || down("KeyD")) this.tryMove(1, 0);
    if (down("ArrowUp") || down("KeyW")) this.tryMove(0, -1);
    if (down("ArrowDown") || down("KeyS")) this.tryMove(0, 1);
    if (down("KeyQ")) this.rotatePiece(-1);
    if (down("KeyE")) this.rotatePiece(1);
    if (down("Space")) this.hardDrop();
    return k.getKeyPressed("ShiftLeft") || k.getKeyPressed("ShiftRight");
  }

  /** XR controller input. Returns whether soft-drop is held. */
  private handleXRInput(): boolean {
    let softDrop = false;
    const pads = this.input.xr.gamepads;
    for (const g of [pads.left, pads.right]) {
      if (!g) continue;
      const ts = InputComponent.Thumbstick;
      if (g.getAxesEnteringLeft(ts)) this.tryMove(-1, 0);
      if (g.getAxesEnteringRight(ts)) this.tryMove(1, 0);
      if (g.getAxesEnteringUp(ts)) this.tryMove(0, -1);
      if (g.getAxesEnteringDown(ts)) this.tryMove(0, 1);
      if (
        g.getButtonDown(InputComponent.A_Button) ||
        g.getButtonDown(InputComponent.X_Button)
      ) {
        this.rotatePiece(1);
      }
      if (
        g.getButtonDown(InputComponent.B_Button) ||
        g.getButtonDown(InputComponent.Y_Button)
      ) {
        this.rotatePiece(-1);
      }
      if (g.getButtonDown(InputComponent.Trigger)) this.hardDrop();
      if (g.getButtonPressed(InputComponent.Squeeze)) softDrop = true;
    }
    return softDrop;
  }

  private wantsRestart(): boolean {
    if (this.input.keyboard.getKeyDown("KeyR")) return true;
    const pads = this.input.xr.gamepads;
    for (const g of [pads.left, pads.right]) {
      if (
        g &&
        (g.getButtonDown(InputComponent.Trigger) ||
          g.getButtonDown(InputComponent.A_Button))
      ) {
        return true;
      }
    }
    return false;
  }

  // --- score panel --------------------------------------------------------

  private drawScorePanel() {
    const ctx = this.scoreCtx;
    ctx.clearRect(0, 0, 512, 256);
    ctx.fillStyle = "rgba(12,14,26,0.94)";
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = "#39c5d6";
    ctx.fillRect(0, 0, 512, 6);

    ctx.textAlign = "center";
    ctx.fillStyle = "#39c5d6";
    ctx.font = "bold 52px sans-serif";
    ctx.fillText("STRATA", 256, 66);

    ctx.fillStyle = "#f5f5f0";
    ctx.font = "32px sans-serif";
    ctx.fillText("SCORE   " + String(this.score).padStart(6, "0"), 256, 124);
    ctx.fillText("LAYERS   " + this.layers, 256, 166);

    if (this.gameOver) {
      ctx.fillStyle = "#ff6b6b";
      ctx.font = "bold 40px sans-serif";
      ctx.fillText("GAME OVER", 256, 214);
      ctx.fillStyle = "#9aa4d4";
      ctx.font = "20px sans-serif";
      ctx.fillText("press  R  or  trigger  to restart", 256, 244);
    } else {
      ctx.fillStyle = "#6b74a0";
      ctx.font = "20px sans-serif";
      ctx.fillText("move • Q/E rotate • Space drop", 256, 230);
    }
    this.scoreTex.needsUpdate = true;
  }
}
