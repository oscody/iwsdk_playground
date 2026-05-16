import {
  CanvasTexture,
  createSystem,
  Entity,
  Group,
  Hovered,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PokeInteractable,
  Pressed,
  RayInteractable,
  SRGBColorSpace,
} from "@iwsdk/core";

import { BlockGameSystem } from "./blockGame.js";
import { gameHub, type GameId } from "./gameHub.js";
import { SnakeGameSystem } from "./snakeGame.js";

/**
 * GameMenuSystem — the launcher.
 *
 * This is the only system registered at boot. It builds a floating holographic
 * menu (two game cards) plus a persistent corner MENU button, and owns every
 * transition between games:
 *
 *   - A card / key sets `gameHub.requested`.
 *   - `update()` notices the change and schedules `applyTransition()` as a
 *     microtask — so the actual `registerSystem` / `unregisterSystem` happens
 *     after the current frame's system loop finishes, never mid-update.
 *   - The outgoing game's system is unregistered (its `cleanupFuncs` tear down
 *     its scene); the incoming game's system is registered (its `init()` runs).
 *
 * The menu's own meshes live for the whole app lifetime, so it needs no cleanup.
 */

const MENU_POS = { x: 0, y: 1.35, z: -1.0 }; // world position of the menu
const MENU_BTN_POS = { x: 0, y: 0.55, z: -0.4 }; // corner "return" button

export class GameMenuSystem extends createSystem({}) {
  private menuRoot!: Group;
  private strataBtn!: Entity;
  private snakeBtn!: Entity;
  private menuBtnEntity!: Entity;

  private current: GameId = "menu";
  private transitioning = false;
  private pressedPrev = { strata: false, snake: false, menu: false };

  init() {
    this.buildMenu();
    this.buildMenuButton();

    // Initial state: launcher visible, no game running.
    this.menuRoot.visible = true;
    this.setInteractable(this.strataBtn, true);
    this.setInteractable(this.snakeBtn, true);
    this.menuBtnEntity.object3D!.visible = false;
    this.setInteractable(this.menuBtnEntity, false);
    this.frameMenuCamera();

    console.log(
      "[Immersive Arcade] Launcher ready — click a card or press 1 / 2 to " +
        "pick a game. Press Esc inside a game to return here.",
    );
  }

  update() {
    this.pollButtons();
    this.pollKeyboard();

    // Schedule game transitions outside the system loop (see class doc).
    if (gameHub.requested !== this.current && !this.transitioning) {
      this.transitioning = true;
      Promise.resolve().then(() => {
        this.applyTransition();
        this.transitioning = false;
      });
    }

    // Hover feedback — gently scale up whatever the pointer is over.
    for (const e of [this.strataBtn, this.snakeBtn, this.menuBtnEntity]) {
      e.object3D?.scale.setScalar(e.hasComponent(Hovered) ? 1.05 : 1);
    }
  }

  // --- transitions --------------------------------------------------------

  private applyTransition() {
    const next = gameHub.requested;
    if (next === this.current) return;

    if (this.current === "strata") this.world.unregisterSystem(BlockGameSystem);
    else if (this.current === "snake")
      this.world.unregisterSystem(SnakeGameSystem);

    if (next === "strata") this.world.registerSystem(BlockGameSystem);
    else if (next === "snake") this.world.registerSystem(SnakeGameSystem);

    const inMenu = next === "menu";
    this.menuRoot.visible = inMenu;
    this.setInteractable(this.strataBtn, inMenu);
    this.setInteractable(this.snakeBtn, inMenu);
    // Strata has no built-in return button, so the launcher provides the
    // corner MENU button for it. Serpent Grid XR draws its own MENU button
    // beside its HUD, so the corner button stays hidden there.
    const showCornerMenu = next === "strata";
    this.menuBtnEntity.object3D!.visible = showCornerMenu;
    this.setInteractable(this.menuBtnEntity, showCornerMenu);
    if (inMenu) this.frameMenuCamera();

    for (const e of [this.strataBtn, this.snakeBtn, this.menuBtnEntity]) {
      e.object3D?.scale.setScalar(1);
    }
    this.current = next;
  }

  private frameMenuCamera() {
    this.world.camera.position.set(0, 1.5, 0.3);
    this.world.camera.lookAt(MENU_POS.x, MENU_POS.y, MENU_POS.z);
  }

  // --- input --------------------------------------------------------------

  private pollButtons() {
    const fire = (
      e: Entity,
      key: "strata" | "snake" | "menu",
      requested: GameId,
    ) => {
      const now = e.hasComponent(Pressed);
      if (now && !this.pressedPrev[key]) gameHub.requested = requested;
      this.pressedPrev[key] = now;
    };
    fire(this.strataBtn, "strata", "strata");
    fire(this.snakeBtn, "snake", "snake");
    fire(this.menuBtnEntity, "menu", "menu");
  }

  private pollKeyboard() {
    const kb = this.input.keyboard;
    if (this.current === "menu") {
      if (kb.getKeyDown("Digit1")) gameHub.requested = "strata";
      if (kb.getKeyDown("Digit2")) gameHub.requested = "snake";
    } else if (kb.getKeyDown("Escape")) {
      gameHub.requested = "menu";
    }
  }

  private setInteractable(e: Entity, on: boolean) {
    if (on) {
      if (!e.hasComponent(RayInteractable)) e.addComponent(RayInteractable);
      if (!e.hasComponent(PokeInteractable)) e.addComponent(PokeInteractable);
    } else {
      if (e.hasComponent(RayInteractable)) e.removeComponent(RayInteractable);
      if (e.hasComponent(PokeInteractable)) e.removeComponent(PokeInteractable);
    }
  }

  // --- scene construction -------------------------------------------------

  private buildMenu() {
    this.menuRoot = new Group();
    this.menuRoot.position.set(MENU_POS.x, MENU_POS.y, MENU_POS.z);
    const menuEntity = this.world.createTransformEntity(this.menuRoot);

    // Backboard.
    const backboard = new Mesh(
      new PlaneGeometry(1.06, 0.92),
      new MeshBasicMaterial({
        color: 0x0a0c18,
        transparent: true,
        opacity: 0.82,
      }),
    );
    backboard.position.set(0, 0, -0.02);
    this.menuRoot.add(backboard);

    // Title (decorative, no interaction).
    const title = this.panel(0.95, 0.275, 760, 220, (c) => {
      c.textAlign = "center";
      c.fillStyle = "#5fe0d0";
      c.font = "bold 60px sans-serif";
      c.fillText("IMMERSIVE ARCADE", 380, 96);
      c.fillStyle = "#8b93c8";
      c.font = "28px sans-serif";
      c.fillText("select a game", 380, 150);
    });
    title.position.set(0, 0.3, 0);
    this.menuRoot.add(title);

    // Game cards (interactive).
    this.strataBtn = this.makeCard(
      0.04,
      "STRATA",
      "3D falling-blocks puzzle",
      "#39c5d6",
      menuEntity,
    );
    this.snakeBtn = this.makeCard(
      -0.23,
      "SERPENT GRID XR",
      "holographic snake arena",
      "#4caf6a",
      menuEntity,
    );
  }

  private makeCard(
    localY: number,
    titleText: string,
    subtitle: string,
    accent: string,
    parent: Entity,
  ): Entity {
    const mesh = this.panel(0.82, 0.224, 660, 180, (c) => {
      c.fillStyle = "rgba(16,18,34,0.97)";
      c.fillRect(0, 0, 660, 180);
      c.fillStyle = accent;
      c.fillRect(0, 0, 14, 180);
      c.textAlign = "left";
      c.fillStyle = "#f5f7ff";
      c.font = "bold 48px sans-serif";
      c.fillText(titleText, 46, 86);
      c.fillStyle = "#8b93c8";
      c.font = "26px sans-serif";
      c.fillText(subtitle, 46, 132);
    });
    mesh.position.set(0, localY, 0.01);
    const entity = this.world.createTransformEntity(mesh, parent);
    return entity;
  }

  private buildMenuButton() {
    const mesh = this.panel(0.22, 0.0856, 360, 140, (c) => {
      c.fillStyle = "rgba(16,18,34,0.97)";
      c.fillRect(0, 0, 360, 140);
      c.fillStyle = "#5fe0d0";
      // hamburger icon
      for (let i = 0; i < 3; i++) c.fillRect(34, 44 + i * 22, 56, 10);
      c.textAlign = "left";
      c.fillStyle = "#f5f7ff";
      c.font = "bold 44px sans-serif";
      c.fillText("MENU", 118, 88);
    });
    mesh.position.set(MENU_BTN_POS.x, MENU_BTN_POS.y, MENU_BTN_POS.z);
    this.menuBtnEntity = this.world.createTransformEntity(mesh);
  }

  /** Build a flat panel mesh with a 2D-canvas texture. */
  private panel(
    w: number,
    h: number,
    cw: number,
    ch: number,
    draw: (ctx: CanvasRenderingContext2D) => void,
  ): Mesh {
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d")!;
    draw(ctx);
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    return new Mesh(
      new PlaneGeometry(w, h),
      new MeshBasicMaterial({ map: tex, transparent: true }),
    );
  }
}
