import {
  AmbientLight,
  AudioSource,
  AudioUtils,
  BackSide,
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
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PlaybackMode,
  PokeInteractable,
  Pressed,
  RayInteractable,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  VisibilityState,
} from "@iwsdk/core";

/**
 * Serpent Grid XR — a holographic tabletop Snake game.
 *
 * A neon GRID x GRID board floats in front of the player. A glowing serpent
 * advances one tile per tick; eating an energy orb grows it and speeds the
 * game up; hitting a wall or itself ends the run. Steer with keyboard, a
 * controller thumbstick, the floating arrow buttons (controller ray / finger
 * poke), or — with hand tracking — by pointing and pinching.
 *
 * Like Strata, the whole game is self-contained: one system owning a single
 * `gameRoot` transform entity. Visual pieces are plain meshes parented under
 * it; only the orb, the buttons, and the audio sources need to be entities.
 * `cleanupFuncs` tears everything down when the launcher unregisters this
 * system, so it never touches Strata or the menu.
 */

const GRID = 13; // tiles per side
const TILE = 0.06; // metres per tile
const SPAN = GRID * TILE; // board side length
const HALF = SPAN / 2;
const SEG_Y = TILE * 0.5; // height of segment/orb centres above the board

const BOARD = { x: 0, y: 0.92, z: -0.55 }; // board centre, world space

const START_TICK = 0.34; // seconds per move at the start
const MIN_TICK = 0.12; // fastest tick
const TICK_STEP = 0.012; // tick shortened per orb eaten
const START_LEN = 3;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface Cell {
  x: number;
  z: number;
}

interface Arrow {
  e: Entity;
  dx: number;
  dz: number;
  prev: boolean;
}

export class SnakeGameSystem extends createSystem({}) {
  private gameRoot!: Group;
  private rootEntity!: Entity;
  private board!: Group;
  private boardEntity!: Entity;

  private segGeo!: BoxGeometry;
  private segMat!: MeshStandardMaterial;
  private headMat!: MeshStandardMaterial;
  private segMeshes: Mesh[] = [];

  private orbEntity!: Entity;
  private orbMesh!: Mesh;
  private gameOverAudio!: Entity;

  private hudCtx!: CanvasRenderingContext2D;
  private hudTex!: CanvasTexture;

  private arrows: Arrow[] = [];
  private hudEntity!: Entity;
  private restartEntity!: Entity;
  private restartPrev = false;
  private exitVrBtnEntity!: Entity;
  private exitVrPrev = false;
  private actionCtx!: CanvasRenderingContext2D;
  private actionTex!: CanvasTexture;
  private actionLabel = "";

  private body: Cell[] = [];
  private prevBody: Cell[] = [];
  private dir: Cell = { x: 0, z: -1 };
  private nextDir: Cell = { x: 0, z: -1 };
  private orb: Cell = { x: 0, z: 0 };

  private tickTimer = 0;
  private tickInterval = START_TICK;
  private score = 0;
  private gameOver = false;
  private started = false; // false = idle "ready" state; true once the round began
  private elapsed = 0;
  private tmpDir = new Vector3();

  init() {
    // Non-immersive (browser) view: look down onto the tabletop from in front.
    this.world.camera.position.set(0, 1.6, 0.2);
    this.world.camera.lookAt(BOARD.x, BOARD.y, BOARD.z);

    this.buildScene();
    this.startGame();

    this.cleanupFuncs.push(() => {
      this.gameRoot.traverse((obj) => {
        const mesh = obj as Mesh;
        mesh.geometry?.dispose?.();
        const mat = mesh.material as
          | MeshBasicMaterial
          | MeshStandardMaterial
          | LineBasicMaterial
          | Array<MeshBasicMaterial | MeshStandardMaterial>
          | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose?.();
      });
      this.hudTex.dispose();
      this.rootEntity.dispose();
    });

    console.log(
      "[Serpent Grid XR] Press NEW GAME (or steer) to begin. Steer — " +
        "Arrows/WASD, controller thumbstick, the floating arrow buttons " +
        "(ray or poke), or point-and-pinch with a tracked hand.",
    );
  }

  update(delta: number) {
    this.elapsed += delta;
    if (this.world.visibilityState.peek() === VisibilityState.VisibleBlurred) {
      return;
    }

    this.handleInput();

    // The serpent only advances once the round has begun.
    if (this.started && !this.gameOver) {
      this.tickTimer += delta;
      while (this.tickTimer >= this.tickInterval && !this.gameOver) {
        this.tickTimer -= this.tickInterval;
        this.tick();
      }
    }

    this.updateActionButton();
    this.renderSnake();
    // Energy orb pulse.
    this.orbMesh.scale.setScalar(1 + Math.sin(this.elapsed * 4) * 0.16);
  }

  // --- game loop ----------------------------------------------------------

  private startGame() {
    const c = Math.floor(GRID / 2);
    this.body = [];
    for (let i = 0; i < START_LEN; i++) this.body.push({ x: c, z: c + i });
    this.prevBody = this.body.map((cell) => ({ ...cell }));
    this.dir = { x: 0, z: -1 };
    this.nextDir = { x: 0, z: -1 };
    this.score = 0;
    this.tickInterval = START_TICK;
    this.tickTimer = 0;
    this.gameOver = false;
    this.started = false; // wait for the player to begin — snake stays idle
    this.spawnOrb();
    this.ensureSegmentMeshes();
    this.drawHud();
    this.renderSnake();
  }

  /** Advance the serpent one tile. */
  private tick() {
    this.dir = { ...this.nextDir };
    const head = this.body[0];
    const nx = head.x + this.dir.x;
    const nz = head.z + this.dir.z;

    // Wall.
    if (nx < 0 || nx >= GRID || nz < 0 || nz >= GRID) {
      this.endGame();
      return;
    }
    // Self — the tail vacates this tick unless we're about to grow.
    const willEat = nx === this.orb.x && nz === this.orb.z;
    const checkLen = willEat ? this.body.length : this.body.length - 1;
    for (let i = 0; i < checkLen; i++) {
      if (this.body[i].x === nx && this.body[i].z === nz) {
        this.endGame();
        return;
      }
    }

    this.prevBody = this.body.map((cell) => ({ ...cell }));
    this.body.unshift({ x: nx, z: nz });
    if (willEat) {
      this.score += 1;
      this.tickInterval = Math.max(MIN_TICK, this.tickInterval - TICK_STEP);
      this.spawnOrb();
      AudioUtils.play(this.orbEntity);
      this.ensureSegmentMeshes();
      this.drawHud();
    } else {
      this.body.pop();
    }
  }

  private endGame() {
    this.gameOver = true;
    AudioUtils.play(this.gameOverAudio);
    this.drawHud();
  }

  private setDir(dx: number, dz: number) {
    if (this.gameOver) return;
    // The first steering input begins the round — any direction is allowed.
    if (!this.started) {
      this.dir = { x: dx, z: dz };
      this.nextDir = { x: dx, z: dz };
      this.started = true;
      return;
    }
    // Reject a 180° reversal of the current heading.
    if (dx === -this.nextDir.x && dz === -this.nextDir.z) return;
    this.nextDir = { x: dx, z: dz };
  }

  private spawnOrb() {
    let x = 0;
    let z = 0;
    for (let tries = 0; tries < 300; tries++) {
      x = Math.floor(Math.random() * GRID);
      z = Math.floor(Math.random() * GRID);
      if (!this.onSnake(x, z)) break;
    }
    if (this.onSnake(x, z)) {
      // Board nearly full — take the first free tile.
      outer: for (let gx = 0; gx < GRID; gx++) {
        for (let gz = 0; gz < GRID; gz++) {
          if (!this.onSnake(gx, gz)) {
            x = gx;
            z = gz;
            break outer;
          }
        }
      }
    }
    this.orb = { x, z };
    this.orbMesh.position.set(this.lx(x), SEG_Y, this.lz(z));
  }

  private onSnake(x: number, z: number): boolean {
    return this.body.some((cell) => cell.x === x && cell.z === z);
  }

  // --- rendering ----------------------------------------------------------

  private renderSnake() {
    this.ensureSegmentMeshes();
    const t = this.gameOver
      ? 1
      : Math.min(this.tickTimer / this.tickInterval, 1);

    for (let i = 0; i < this.body.length; i++) {
      const to = this.body[i];
      const from = this.prevBody[i] ?? to;
      const m = this.segMeshes[i];
      m.visible = true;
      m.position.set(
        lerp(this.lx(from.x), this.lx(to.x), t),
        SEG_Y,
        lerp(this.lz(from.z), this.lz(to.z), t),
      );
    }
    for (let i = this.body.length; i < this.segMeshes.length; i++) {
      this.segMeshes[i].visible = false;
    }
    // Head pulse.
    const head = this.segMeshes[0];
    if (head) head.scale.setScalar(1.16 + Math.sin(this.elapsed * 6) * 0.08);
  }

  /** Grow the segment-mesh pool until it covers the whole body. */
  private ensureSegmentMeshes() {
    while (this.segMeshes.length < this.body.length) {
      const isHead = this.segMeshes.length === 0;
      const mesh = new Mesh(this.segGeo, isHead ? this.headMat : this.segMat);
      this.board.add(mesh);
      this.segMeshes.push(mesh);
    }
  }

  private lx(gx: number) {
    return (gx - (GRID - 1) / 2) * TILE;
  }
  private lz(gz: number) {
    return (gz - (GRID - 1) / 2) * TILE;
  }

  // --- input --------------------------------------------------------------

  private handleInput() {
    const kb = this.input.keyboard;
    if (kb.getKeyDown("ArrowUp") || kb.getKeyDown("KeyW")) this.setDir(0, -1);
    if (kb.getKeyDown("ArrowDown") || kb.getKeyDown("KeyS")) this.setDir(0, 1);
    if (kb.getKeyDown("ArrowLeft") || kb.getKeyDown("KeyA")) this.setDir(-1, 0);
    if (kb.getKeyDown("ArrowRight") || kb.getKeyDown("KeyD")) this.setDir(1, 0);
    if (kb.getKeyDown("KeyR") && this.gameOver) this.onActionButton();

    const pads = this.input.xr.gamepads;
    for (const hand of ["left", "right"] as const) {
      const g = pads[hand];
      if (!g) continue;
      const ts = InputComponent.Thumbstick;
      if (g.getAxesEnteringUp(ts)) this.setDir(0, -1);
      if (g.getAxesEnteringDown(ts)) this.setDir(0, 1);
      if (g.getAxesEnteringLeft(ts)) this.setDir(-1, 0);
      if (g.getAxesEnteringRight(ts)) this.setDir(1, 0);
      if (g.getButtonDown(InputComponent.Trigger) && this.gameOver) {
        this.onActionButton();
      }
      // Hand point-and-pinch steering.
      if (this.input.xr.isPrimary("hand", hand) && g.getSelectStart()) {
        this.pinchSteer(hand);
      }
    }

    // Floating arrow buttons (controller ray or finger poke).
    for (const a of this.arrows) {
      const now = a.e.hasComponent(Pressed);
      if (now && !a.prev) this.setDir(a.dx, a.dz);
      a.prev = now;
    }
    // New-game / restart + exit-VR buttons beside the HUD.
    const rNow = this.restartEntity.hasComponent(Pressed);
    if (rNow && !this.restartPrev) this.onActionButton();
    this.restartPrev = rNow;

    const exitNow = this.exitVrBtnEntity.hasComponent(Pressed);
    if (exitNow && !this.exitVrPrev) this.world.exitXR();
    this.exitVrPrev = exitNow;
  }

  /** Steer toward where a tracked hand is pointing when it pinches. */
  private pinchSteer(hand: "left" | "right") {
    this.world.player.raySpaces[hand].getWorldDirection(this.tmpDir);
    // getWorldDirection gives +Z; a ray/controller points along -Z.
    const px = -this.tmpDir.x;
    const pz = -this.tmpDir.z;
    if (Math.abs(px) >= Math.abs(pz)) this.setDir(Math.sign(px) || 1, 0);
    else this.setDir(0, Math.sign(pz) || -1);
  }

  // --- scene construction -------------------------------------------------

  private buildScene() {
    this.gameRoot = new Group();
    this.rootEntity = this.world.createTransformEntity(this.gameRoot);

    this.gameRoot.add(this.makeDome());
    this.gameRoot.add(new AmbientLight(0xffffff, 0.55));
    const dir = new DirectionalLight(0xffffff, 0.7);
    dir.position.set(0.5, 2.2, 0.6);
    this.gameRoot.add(dir);

    this.board = new Group();
    this.board.position.set(BOARD.x, BOARD.y, BOARD.z);
    this.boardEntity = this.world.createTransformEntity(
      this.board,
      this.rootEntity,
    );

    // Base plate.
    const plate = new Mesh(
      new PlaneGeometry(SPAN, SPAN),
      new MeshStandardMaterial({
        color: 0x0c1420,
        emissive: 0x07101a,
        emissiveIntensity: 0.6,
        roughness: 0.7,
        metalness: 0.2,
        transparent: true,
        opacity: 0.96,
        side: DoubleSide,
      }),
    );
    plate.rotation.x = -Math.PI / 2;
    this.board.add(plate);

    // Neon tile grid.
    const grid = new GridHelper(SPAN, GRID, 0x46e0c0, 0x1f5560);
    grid.position.y = 0.001;
    this.board.add(grid);

    // Glowing boundary frame (the walls).
    const frame = new LineSegments(
      new EdgesGeometry(new BoxGeometry(SPAN, TILE * 0.8, SPAN)),
      new LineBasicMaterial({ color: 0x46e0c0 }),
    );
    frame.position.y = TILE * 0.4;
    this.board.add(frame);

    // Serpent materials + pool geometry.
    this.segGeo = new BoxGeometry(TILE * 0.82, TILE * 0.82, TILE * 0.82);
    this.segMat = new MeshStandardMaterial({
      color: 0x1f7d4a,
      emissive: 0x32d06e,
      emissiveIntensity: 0.85,
      roughness: 0.3,
      metalness: 0.1,
    });
    this.headMat = new MeshStandardMaterial({
      color: 0x9affc0,
      emissive: 0x9affc0,
      emissiveIntensity: 1.1,
      roughness: 0.25,
    });

    // Energy orb (its AudioSource plays the pickup chime).
    this.orbMesh = new Mesh(
      new SphereGeometry(TILE * 0.36, 18, 14),
      new MeshStandardMaterial({
        color: 0xffb020,
        emissive: 0xffc24a,
        emissiveIntensity: 1.1,
        roughness: 0.2,
      }),
    );
    this.orbEntity = this.world.createTransformEntity(
      this.orbMesh,
      this.boardEntity,
    );
    this.orbEntity.addComponent(AudioSource, {
      src: "/audio/chime.mp3",
      positional: true,
      volume: 0.9,
      playbackMode: PlaybackMode.Restart,
    });

    // Non-positional game-over sound.
    this.gameOverAudio = this.world.createTransformEntity(
      new Group(),
      this.rootEntity,
    );
    this.gameOverAudio.addComponent(AudioSource, {
      src: "/audio/chime.mp3",
      positional: false,
      volume: 0.7,
      playbackMode: PlaybackMode.Restart,
    });

    this.buildHud();
    this.buildControls();
  }

  /** Large inward-facing gradient sphere — the neon arena backdrop. */
  private makeDome(): Mesh {
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, "#0c0c28");
    grad.addColorStop(0.55, "#10122e");
    grad.addColorStop(1, "#040409");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 16, 256);
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    const dome = new Mesh(
      new SphereGeometry(14, 32, 24),
      new MeshBasicMaterial({ map: tex, side: BackSide }),
    );
    dome.position.set(0, 1.0, -0.3);
    return dome;
  }

  private buildHud() {
    // The HUD panel and the restart / exit-VR buttons share one tilted group, so
    // the buttons always sit right next to the GAME OVER readout.
    const hudGroup = new Group();
    hudGroup.position.set(0, 0.34, -HALF - 0.03);
    hudGroup.rotation.x = -0.32; // tilt up toward the elevated viewer
    this.hudEntity = this.world.createTransformEntity(
      hudGroup,
      this.boardEntity,
    );

    const canvas = document.createElement("canvas");
    canvas.width = 620;
    canvas.height = 190;
    this.hudCtx = canvas.getContext("2d")!;
    this.hudTex = new CanvasTexture(canvas);
    this.hudTex.colorSpace = SRGBColorSpace;
    const hud = new Mesh(
      new PlaneGeometry(0.62, 0.19),
      new MeshBasicMaterial({ map: this.hudTex, transparent: true }),
    );
    hudGroup.add(hud);

    // New-game / restart button (its label tracks play state) plus
    // an exit-VR button, side by side just below the panel.
    this.restartEntity = this.buildActionButton(
      this.hudEntity,
      -0.155,
      -0.16,
      0.001,
    );
    this.actionLabel = "NEW GAME";
    this.drawActionButton("NEW GAME");
    this.exitVrBtnEntity = this.makeButton(
      this.hudEntity,
      0.29,
      0.08,
      360,
      100,
      0.155,
      -0.16,
      0.001,
      (c) => this.drawTextButton(c, "EXIT VR", "#46e0c0"),
    );
  }

  /** Shared draw routine for the EXIT VR and action (NEW GAME / RESTART) buttons. */
  private drawTextButton(
    c: CanvasRenderingContext2D,
    label: string,
    accent: string,
  ) {
    c.clearRect(0, 0, 360, 100);
    c.fillStyle = "rgba(16,22,30,0.97)";
    c.fillRect(0, 0, 360, 100);
    c.fillStyle = accent;
    c.fillRect(0, 0, 360, 5);
    c.textAlign = "center";
    c.fillStyle = "#f5f7ff";
    c.font = "bold 40px sans-serif";
    c.fillText(label, 180, 66);
  }

  /** Build the redrawable action button — label flips NEW GAME <-> RESTART. */
  private buildActionButton(
    parent: Entity,
    x: number,
    y: number,
    z: number,
  ): Entity {
    const canvas = document.createElement("canvas");
    canvas.width = 360;
    canvas.height = 100;
    this.actionCtx = canvas.getContext("2d")!;
    this.actionTex = new CanvasTexture(canvas);
    this.actionTex.colorSpace = SRGBColorSpace;
    const mesh = new Mesh(
      new PlaneGeometry(0.29, 0.08),
      new MeshBasicMaterial({ map: this.actionTex, transparent: true }),
    );
    mesh.position.set(x, y, z);
    const e = this.world.createTransformEntity(mesh, parent);
    e.addComponent(RayInteractable);
    e.addComponent(PokeInteractable);
    return e;
  }

  /** Repaint the action button with the given label. */
  private drawActionButton(label: string) {
    const accent = label === "RESTART" ? "#ffb020" : "#32d06e";
    this.drawTextButton(this.actionCtx, label, accent);
    this.actionTex.needsUpdate = true;
  }

  /**
   * Keep the action button in sync with play state: it reads "RESTART" only
   * while the serpent is moving, and "NEW GAME" otherwise (the idle "ready"
   * state on scene entry, and after a game over).
   */
  private updateActionButton() {
    const label = this.started && !this.gameOver ? "RESTART" : "NEW GAME";
    if (label === this.actionLabel) return;
    this.actionLabel = label;
    this.drawActionButton(label);
  }

  /** Handle a press of the action button (NEW GAME / RESTART). */
  private onActionButton() {
    // Re-place the serpent unless it is already sitting idle at the start.
    if (this.gameOver || this.started) this.startGame();
    this.started = true; // begin moving
  }

  private drawHud() {
    const c = this.hudCtx;
    c.clearRect(0, 0, 620, 190);
    c.fillStyle = "rgba(10,14,22,0.95)";
    c.fillRect(0, 0, 620, 190);
    c.fillStyle = "#46e0c0";
    c.fillRect(0, 0, 620, 5);

    c.textAlign = "center";
    c.fillStyle = "#46e0c0";
    c.font = "bold 26px sans-serif";
    c.fillText("SERPENT GRID XR", 310, 40);

    if (this.gameOver) {
      c.fillStyle = "#ff6b6b";
      c.font = "bold 46px sans-serif";
      c.fillText("GAME OVER", 310, 102);
      c.fillStyle = "#cfd6f5";
      c.font = "25px sans-serif";
      c.fillText(
        `score ${this.score}   ·   length ${this.body.length}`,
        310,
        140,
      );
      c.fillStyle = "#8b93c8";
      c.font = "20px sans-serif";
      c.fillText("press R, trigger, or RESTART", 310, 172);
    } else {
      c.fillStyle = "#f5f7ff";
      c.font = "bold 50px sans-serif";
      c.fillText(`SCORE  ${String(this.score).padStart(3, "0")}`, 310, 110);
      const speed = Math.round(
        ((START_TICK - this.tickInterval) / (START_TICK - MIN_TICK)) * 100,
      );
      c.fillStyle = "#8b93c8";
      c.font = "24px sans-serif";
      c.fillText(`LENGTH ${this.body.length}      SPEED ${speed}%`, 310, 156);
    }
    this.hudTex.needsUpdate = true;
  }

  private buildControls() {
    // Directional steering cluster, near the player's edge of the board.
    const cx = 0;
    const cy = 0.17;
    const cz = HALF + 0.13;
    const s = 0.082; // arrow spacing
    this.arrows = [
      this.makeArrow("up", cx, cy + s, cz, 0, -1),
      this.makeArrow("down", cx, cy - s, cz, 0, 1),
      this.makeArrow("left", cx - s, cy, cz, -1, 0),
      this.makeArrow("right", cx + s, cy, cz, 1, 0),
    ];
  }

  private makeArrow(
    code: "up" | "down" | "left" | "right",
    x: number,
    y: number,
    z: number,
    dx: number,
    dz: number,
  ): Arrow {
    const e = this.makeButton(
      this.boardEntity,
      0.076,
      0.076,
      128,
      128,
      x,
      y,
      z,
      (c) => {
      c.clearRect(0, 0, 128, 128);
      c.fillStyle = "rgba(16,22,30,0.96)";
      c.fillRect(0, 0, 128, 128);
      c.fillStyle = "#46e0c0";
      c.beginPath();
      if (code === "up") {
        c.moveTo(64, 26);
        c.lineTo(102, 96);
        c.lineTo(26, 96);
      } else if (code === "down") {
        c.moveTo(26, 32);
        c.lineTo(102, 32);
        c.lineTo(64, 102);
      } else if (code === "left") {
        c.moveTo(32, 64);
        c.lineTo(102, 26);
        c.lineTo(102, 102);
      } else {
        c.moveTo(96, 64);
        c.lineTo(26, 26);
        c.lineTo(26, 102);
      }
      c.closePath();
      c.fill();
    });
    return { e, dx, dz, prev: false };
  }

  /** Build a flat canvas-textured panel entity that reacts to ray + poke. */
  private makeButton(
    parent: Entity,
    w: number,
    h: number,
    cw: number,
    ch: number,
    x: number,
    y: number,
    z: number,
    draw: (ctx: CanvasRenderingContext2D) => void,
  ): Entity {
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d")!;
    draw(ctx);
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    const mesh = new Mesh(
      new PlaneGeometry(w, h),
      new MeshBasicMaterial({ map: tex, transparent: true }),
    );
    mesh.position.set(x, y, z);
    const e = this.world.createTransformEntity(mesh, parent);
    e.addComponent(RayInteractable);
    e.addComponent(PokeInteractable);
    return e;
  }
}
