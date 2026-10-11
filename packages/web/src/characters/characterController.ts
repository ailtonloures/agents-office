import type { Agent, OfficeEvent, OfficeModel, Profession, Session } from '@agents-office/shared';
import type Phaser from 'phaser';
import type { DebugCharacter } from '../debug/debugState';
import type { Direction } from '../skin';
import { SKIN_KEYS } from '../skin';
import { actionLine, agentDisplayNames, prettyAgentType } from '../ui/identity';
import { NameTag, STATUS_COLOR } from '../ui/nameTag';
import type { SeatedWorker } from '../world/deskScreens';
import { DOT_KEY, ensureParticleTextures, Z_KEY } from '../world/lighting';
import { findPath } from '../world/pathfinding';
import type { BuildingLayout, Desk, Tile } from '../world/roomLayout';
import { ensureRing, ensureShadow, RING_KEY, SHADOW_KEY } from '../world/rugs';
import { type BalloonId, balloonTextureKey, createBalloonTextures } from './balloons';
import {
  animationKeyFor,
  type CharacterAnimation,
  type CharacterFactory,
  SEATED_ANIMATIONS,
} from './characterFactory';
import {
  type Goal,
  initialState,
  type MachineActor,
  nextVisualState,
  type Target,
  type VisualState,
} from './characterMachine';
import { DeskAssignments } from './deskAssignment';

const TILE = 16;
/** Movement speed: 4 tiles per second, like the Pokemon games. */
export const STEP_MS = 250;
const FADE_MS = 400;
/** A blocked character looks for another route after this long... */
const REPLAN_AFTER_MS = 500;
/** ...and walks through whoever is in the way after this long (never deadlock). */
const FORCE_AFTER_MS = 3000;
/** Longest frame step the simulation accepts (a throttled background tab resumes with a big one). */
const MAX_DELTA_MS = 250;
const SPRITE_DEPTH = 4;
const BALLOON_DEPTH = 6;
const TAG_DEPTH = 7;
/** Occupancy holder id of the player avatar (see `setExternalBlockers`). */
const PLAYER_HOLDER = '\u0000player';

const keyOf = (tile: Tile): string => `${tile.x},${tile.y}`;
const sameTile = (a: Tile, b: Tile): boolean => a.x === b.x && a.y === b.y;

interface ResolvedGoal {
  tile: Tile;
  facing: Direction | undefined;
}

interface Character {
  id: string;
  role: 'lead' | 'agent';
  sessionId: string;
  roomId: string;
  profession: Profession;
  parentAgentId: string | undefined;
  spawnDepth: number;
  sprite: Phaser.GameObjects.Sprite;
  balloon: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  /** Status ring under the feet (working, thinking, waiting, error). */
  ring: Phaser.GameObjects.Image;
  tag: NameTag;
  spawned: boolean;
  spawnWaitMs: number;
  tile: Tile;
  /** Tile being walked to (the step is `stepMs / STEP_MS` done). */
  to: Tile | undefined;
  stepMs: number;
  path: Tile[];
  needsPlan: boolean;
  blockedMs: number;
  replanned: boolean;
  goalKey: string;
  goal: ResolvedGoal | undefined;
  facing: Direction;
  visual: VisualState;
  fadeMs: number;
  anim: string;
  balloonId: BalloonId | undefined;
  status: MachineActor['status'] | undefined;
  /** Turned towards the player during a dialog: keeps `facing` and the idle pose until it walks. */
  faceLock: boolean;
}

const DIRECTION_OF: Record<string, Direction> = {
  '0,-1': 'up',
  '0,1': 'down',
  '-1,0': 'left',
  '1,0': 'right',
};

function directionTo(from: Tile, to: Tile): Direction | undefined {
  return DIRECTION_OF[`${Math.sign(to.x - from.x)},${Math.sign(to.y - from.y)}`];
}

/**
 * Brings the model to life: one sprite per Tech Lead / subagent, walking between the door, its
 * desk, points of interest and the Tech Lead as the pure state machine dictates. Tracks tile
 * occupancy so characters queue instead of overlapping (notably at the door).
 */
export class CharacterController {
  private readonly chars = new Map<string, Character>();
  private readonly desks = new DeskAssignments();
  /** Actors seen through the live event stream (not just a snapshot): they walk in. */
  private readonly live = new Set<string>();
  private layout: BuildingLayout | undefined;
  private now = 0;
  private occupied = new Map<string, string>();
  /** Tiles taken by something that is not a character (the player avatar). */
  private externalBlockers: Tile[] = [];
  private readonly smallFont: boolean;
  private tagsVisible = true;
  /** `?tags=full`: every tag shows its detail line. */
  private readonly tagsFull =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('tags') === 'full';
  private focusTile: Tile | undefined;
  private pointer: { x: number; y: number } | undefined;
  private highlightId: string | undefined;
  private askingIds: ReadonlySet<string> = new Set();
  /** Four white silhouettes offset by 1px around the highlighted character: its outline. */
  private readonly highlight: Phaser.GameObjects.Sprite[] = [];
  /** Confetti burst when a report is delivered. */
  private confetti: Phaser.GameObjects.Particles.ParticleEmitter | undefined;
  private names = new Map<string, string>();
  private namesModel: OfficeModel | undefined;
  /** Next time (ms) each sleeping character lets out a "z". */
  private readonly nextZ = new Map<string, number>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly factory: CharacterFactory,
    /** Called when a character is gone for good (the scene may drop a retained room). */
    private readonly onGone: () => void = () => {},
  ) {
    createBalloonTextures(scene.textures);
    ensureShadow(scene.textures);
    ensureRing(scene.textures);
    ensureParticleTextures(scene.textures);
    this.smallFont = scene.cache.bitmapFont.exists(SKIN_KEYS.fontSmall);
  }

  /**
   * The player's tile and the mouse (world pixels): characters near the player or under the
   * mouse show the detail line of their tag.
   */
  setFocus(tile: Tile | undefined, pointer: { x: number; y: number } | undefined): void {
    this.focusTile = tile;
    this.pointer = pointer;
  }

  /** Characters with a permission request pending: they show the `!` balloon until it is answered. */
  setAsking(ids: ReadonlySet<string>): void {
    this.askingIds = ids;
  }

  /** Outlines one character (the one the player faces or the mouse hovers), or none. */
  setHighlight(id: string | undefined): void {
    this.highlightId = id;
    if (this.highlight.length === 0 && id !== undefined) {
      for (let i = 0; i < 4; i += 1) {
        this.highlight.push(
          this.scene.add.sprite(0, 0, '__WHITE').setOrigin(0.5, 1).setVisible(false),
        );
      }
    }
    if (id === undefined || !this.chars.has(id)) {
      for (const s of this.highlight) s.setVisible(false);
    }
  }

  /** Name tags are hidden while the camera is zoomed out to the whole building. */
  setTagsVisible(visible: boolean): void {
    this.tagsVisible = visible;
  }

  noteEvent(event: OfficeEvent): void {
    const ids = event as { agentId?: string; actorId?: string };
    const id = ids.agentId ?? ids.actorId;
    if (id !== undefined) this.live.add(id);
  }

  /** Characters sitting at their workstation and what they do there (their monitors show it). */
  seatedWorkers(): SeatedWorker[] {
    return [...this.chars.values()]
      .filter((c) => c.spawned && !c.to && c.visual.phase === 'at-desk')
      .map((c) => ({ tile: { ...c.tile }, activity: c.visual.activity }));
  }

  /** Sessions that still have a character on screen: their room must not disappear yet. */
  sessionsInUse(): Set<string> {
    return new Set([...this.chars.values()].map((c) => c.sessionId));
  }

  debugCharacters(model: OfficeModel): DebugCharacter[] {
    return [...this.chars.values()]
      .filter((c) => c.spawned)
      .map((c) => {
        const actor = this.actorOf(c, model);
        const from = c.tile;
        const t = c.to ? c.stepMs / STEP_MS : 0;
        const x = from.x + ((c.to?.x ?? from.x) - from.x) * t;
        const y = from.y + ((c.to?.y ?? from.y) - from.y) * t;
        return {
          id: c.id,
          role: c.role,
          profession: c.profession,
          status: actor?.status ?? c.status,
          roomId: c.roomId,
          x: Math.round(x * 100) / 100,
          y: Math.round(y * 100) / 100,
          phase: c.visual.phase,
          activity: c.visual.activity,
        };
      });
  }

  update(model: OfficeModel, layout: BuildingLayout, delta: number): void {
    const dt = Math.min(delta, MAX_DELTA_MS);
    this.now += dt;
    if (layout !== this.layout) this.setLayout(layout);
    this.syncModel(model);

    this.occupied = new Map();
    for (const tile of this.externalBlockers) this.occupied.set(keyOf(tile), PLAYER_HOLDER);
    for (const c of this.chars.values()) {
      if (!c.spawned) continue;
      this.occupied.set(keyOf(c.tile), c.id);
      if (c.to) this.occupied.set(keyOf(c.to), c.id);
    }

    for (const c of [...this.chars.values()]) {
      this.tick(c, model, layout, dt);
    }
  }

  // --- player interaction ------------------------------------------------------------------

  /** Tiles the player avatar takes up: characters queue around them like around each other. */
  setExternalBlockers(tiles: Tile[]): void {
    this.externalBlockers = tiles;
  }

  /** Id of the spawned character standing on (or walking to) `tile`. */
  characterAtTile(tile: Tile): string | undefined {
    for (const c of this.chars.values()) {
      if (!c.spawned || c.visual.phase === 'gone') continue;
      if (sameTile(c.tile, tile) || (c.to && sameTile(c.to, tile))) return c.id;
    }
    return undefined;
  }

  /** Id of the character whose sprite is under the world point (topmost first). */
  characterAtPoint(worldX: number, worldY: number): string | undefined {
    const hits = [...this.chars.values()]
      .filter(
        (c) =>
          c.spawned && c.visual.phase !== 'gone' && c.sprite.getBounds().contains(worldX, worldY),
      )
      .sort((a, b) => b.sprite.depth - a.sprite.depth);
    return hits[0]?.id;
  }

  /** Tile of a spawned character (where it stands, or leaves when walking). */
  tileOf(id: string): Tile | undefined {
    const c = this.chars.get(id);
    return c?.spawned ? { ...c.tile } : undefined;
  }

  /** Turns the character towards `tile` (the player talking to it) until it moves again. */
  faceToward(id: string, tile: Tile): void {
    const c = this.chars.get(id);
    if (!c || c.to) return;
    const dir = directionTo(c.tile, tile);
    if (!dir) return;
    c.facing = dir;
    c.faceLock = true;
  }

  releaseFacing(id: string): void {
    const c = this.chars.get(id);
    if (c) c.faceLock = false;
  }

  destroy(): void {
    for (const c of this.chars.values()) this.dispose(c);
    this.chars.clear();
    for (const s of this.highlight) s.destroy();
    this.highlight.length = 0;
    this.confetti?.destroy();
  }

  // --- model sync ------------------------------------------------------------------------

  private setLayout(layout: BuildingLayout): void {
    this.layout = layout;
    this.desks.reconcile(layout.desks);
    // A regenerated layout can turn a tile under a character into furniture: step aside.
    for (const c of this.chars.values()) {
      if (!c.spawned || c.to || !layout.collision[c.tile.y]?.[c.tile.x]) continue;
      c.tile = this.nearestWalkable(layout, c.tile);
      c.needsPlan = true;
    }
  }

  private nearestWalkable(layout: BuildingLayout, from: Tile): Tile {
    let best = from;
    let bestDistance = Number.POSITIVE_INFINITY;
    layout.collision.forEach((row, y) => {
      row.forEach((blocked, x) => {
        if (blocked) return;
        const d = Math.abs(x - from.x) + Math.abs(y - from.y);
        if (d < bestDistance) {
          bestDistance = d;
          best = { x, y };
        }
      });
    });
    return best;
  }

  private syncModel(model: OfficeModel): void {
    const layout = this.layout;
    if (!layout) return;
    for (const session of Object.values(model.sessions)) {
      if (!this.chars.has(session.id)) this.createLead(session, layout);
    }
    for (const agent of Object.values(model.agents)) {
      const existing = this.chars.get(agent.id);
      if (existing) {
        existing.parentAgentId = agent.parentAgentId;
        existing.spawnDepth = agent.spawnDepth;
        continue;
      }
      // A finished agent that shows up in a snapshot is history (Hall of Fame), not a visitor.
      if (agent.status === 'finished' && !this.live.has(agent.id)) continue;
      this.createAgent(agent, model, layout);
    }
  }

  private createLead(session: Session, layout: BuildingLayout): void {
    const desk = layout.desks.find((d) => d.sessionId === session.id);
    if (!desk) return;
    const c = this.makeCharacter({
      id: session.id,
      role: 'lead',
      sessionId: session.id,
      roomId: session.projectId,
      profession: session.profession,
      parentAgentId: undefined,
      spawnDepth: 0,
      tile: desk.tile,
      entering: false,
    });
    c.facing = desk.facing;
  }

  private createAgent(agent: Agent, model: OfficeModel, layout: BuildingLayout): void {
    const roomId = model.sessions[agent.sessionId]?.projectId;
    if (roomId === undefined) return;
    const door = layout.doors.find((d) => d.roomId === roomId);
    const animate = this.live.has(agent.id) && door !== undefined;
    const c = this.makeCharacter({
      id: agent.id,
      role: 'agent',
      sessionId: agent.sessionId,
      roomId,
      profession: agent.profession,
      parentAgentId: agent.parentAgentId,
      spawnDepth: agent.spawnDepth,
      tile: door?.outside ?? layout.spawn,
      entering: animate,
    });
    if (!animate) {
      // Known from a snapshot: already at its desk.
      const desk = this.resolveDesk(agent.id, roomId, layout);
      c.tile = desk?.tile ?? layout.spawn;
      c.facing = desk?.facing ?? 'down';
    }
  }

  private makeCharacter(init: {
    id: string;
    role: 'lead' | 'agent';
    sessionId: string;
    roomId: string;
    profession: Profession;
    parentAgentId: string | undefined;
    spawnDepth: number;
    tile: Tile;
    entering: boolean;
  }): Character {
    const { textureKey } = this.factory.get(init.id, init.profession);
    const sprite = this.scene.add
      .sprite(0, 0, textureKey, 0)
      .setOrigin(0.5, 1)
      .setDepth(SPRITE_DEPTH)
      .setVisible(!init.entering);
    const shadow = this.scene.add
      .image(0, 0, SHADOW_KEY)
      .setOrigin(0.5, 0.5)
      .setDepth(SPRITE_DEPTH - 0.5)
      .setVisible(!init.entering);
    const ring = this.scene.add
      .image(0, 0, RING_KEY)
      .setOrigin(0.5, 0.5)
      .setDepth(SPRITE_DEPTH - 0.45)
      .setVisible(false);
    const tag = new NameTag(this.scene, this.smallFont);
    tag.setVisible(false);
    const balloon = this.scene.add
      .image(0, 0, balloonTextureKey('think'))
      .setOrigin(0.5, 1)
      .setDepth(BALLOON_DEPTH)
      .setVisible(false);
    const c: Character = {
      id: init.id,
      role: init.role,
      sessionId: init.sessionId,
      roomId: init.roomId,
      profession: init.profession,
      parentAgentId: init.parentAgentId,
      spawnDepth: init.spawnDepth,
      sprite,
      balloon,
      shadow,
      ring,
      tag,
      spawned: !init.entering,
      spawnWaitMs: 0,
      tile: init.tile,
      to: undefined,
      stepMs: 0,
      path: [],
      needsPlan: true,
      blockedMs: 0,
      replanned: false,
      goalKey: '',
      goal: undefined,
      facing: 'down',
      visual: initialState(init.entering ? 'entering' : 'at-desk', this.now),
      fadeMs: 0,
      anim: '',
      balloonId: undefined,
      status: undefined,
      faceLock: false,
    };
    this.chars.set(c.id, c);
    return c;
  }

  private dispose(c: Character): void {
    c.sprite.destroy();
    c.balloon.destroy();
    c.shadow.destroy();
    c.ring.destroy();
    this.nextZ.delete(c.id);
    c.tag.destroy();
    this.factory.release(c.id);
    this.desks.release(c.id);
  }

  private remove(c: Character): void {
    this.dispose(c);
    this.chars.delete(c.id);
    this.live.delete(c.id);
    this.onGone();
  }

  /** The name shown on a character's tag (the Tech Lead, or the subagent's numbered type). */
  displayName(id: string, model: OfficeModel): string {
    if (model.sessions[id]) return 'Tech Lead';
    const agent = model.agents[id];
    if (!agent) return 'alguém';
    return this.namesOf(model).get(id) ?? prettyAgentType(agent.agentType);
  }

  /** Display names of the subagents, recomputed when the model object changes. */
  private namesOf(model: OfficeModel): Map<string, string> {
    if (this.namesModel !== model) {
      this.namesModel = model;
      this.names = agentDisplayNames(model);
    }
    return this.names;
  }

  private updateTag(c: Character, model: OfficeModel): void {
    if (c.role === 'lead') {
      const session = model.sessions[c.id];
      if (!session) return;
      const project = model.projects[session.projectId];
      c.tag.set({
        profession: session.profession,
        name: 'Tech Lead',
        role: 'LIDER',
        detail: actionLine(
          session.status,
          session.currentTool,
          session.recentSteps,
          session.lastPromptSummary ?? project?.name ?? '',
        ),
        status: session.status,
      });
    } else {
      const agent = model.agents[c.id];
      if (!agent) return;
      c.tag.set({
        profession: agent.profession,
        name: this.namesOf(model).get(agent.id) ?? prettyAgentType(agent.agentType),
        detail: actionLine(
          agent.status,
          agent.currentTool,
          agent.recentSteps,
          agent.description || agent.agentType,
        ),
        status: agent.status,
      });
    }
  }

  private actorOf(c: Character, model: OfficeModel): MachineActor | undefined {
    const source = c.role === 'lead' ? model.sessions[c.id] : model.agents[c.id];
    if (!source) return undefined;
    return { role: c.role, status: source.status, currentTool: source.currentTool };
  }

  // --- goals -------------------------------------------------------------------------------

  private leadDeskId(c: Character, layout: BuildingLayout): string | undefined {
    return layout.desks.find((d) => d.sessionId === c.sessionId)?.id;
  }

  private resolveDesk(id: string, roomId: string, layout: BuildingLayout): Desk | undefined {
    const c = this.chars.get(id);
    if (c?.role === 'lead') return layout.desks.find((d) => d.sessionId === c.sessionId);
    const parentDesk =
      c && c.spawnDepth > 1 && c.parentAgentId ? this.desks.deskIdOf(c.parentAgentId) : undefined;
    const anchor = parentDesk ?? (c ? this.leadDeskId(c, layout) : undefined);
    return this.desks.assign(id, roomId, layout.desks, anchor);
  }

  private doorOf(c: Character, layout: BuildingLayout) {
    return layout.doors.find((d) => d.roomId === c.roomId);
  }

  private walkable(layout: BuildingLayout, tile: Tile): boolean {
    return layout.collision[tile.y]?.[tile.x] === false;
  }

  private resolveGoal(c: Character, goal: Goal, layout: BuildingLayout): ResolvedGoal | undefined {
    const door = this.doorOf(c, layout);
    switch (goal.kind) {
      case 'stay':
        return undefined;
      case 'desk': {
        const desk = this.resolveDesk(c.id, c.roomId, layout);
        if (desk) return { tile: desk.tile, facing: desk.facing };
        // No free desk: wait just inside the door.
        return door ? { tile: { x: door.tile.x, y: door.tile.y + 2 }, facing: 'down' } : undefined;
      }
      case 'poi': {
        if (goal.target === 'door') {
          if (!door) return undefined;
          const { x, y } = door.tile;
          const spot = [
            { x: x + 1, y: y + 1 },
            { x: x - 1, y: y + 1 },
            { x, y: y + 1 },
          ].find((t) => this.walkable(layout, t));
          return spot ? { tile: spot, facing: 'up' } : undefined;
        }
        const poi = layout.pois.find((p) => p.type === goal.target && p.roomId === c.roomId);
        return poi ? { tile: poi.tile, facing: 'up' } : undefined;
      }
      case 'exit':
        return door ? { tile: door.tile, facing: 'up' } : undefined;
    }
  }

  // --- simulation --------------------------------------------------------------------------

  private tick(c: Character, model: OfficeModel, layout: BuildingLayout, dt: number): void {
    const actor = this.actorOf(c, model);
    if (actor) c.status = actor.status;
    this.updateTag(c, model);

    if (!c.spawned) {
      if (!actor || actor.status === 'ended') {
        this.remove(c);
        return;
      }
      this.trySpawn(c, dt);
      if (!c.spawned) return;
    }

    if (c.visual.phase === 'gone') {
      c.fadeMs += dt;
      if (c.fadeMs >= FADE_MS) {
        this.remove(c);
        return;
      }
      this.render(c);
      return;
    }

    const profession = (c.role === 'lead' ? model.sessions[c.id] : model.agents[c.id])?.profession;
    if (profession && profession !== c.profession) {
      c.profession = profession;
      c.sprite.setTexture(this.factory.get(c.id, profession).textureKey);
      c.anim = '';
    }

    const door = this.doorOf(c, layout);
    const room = layout.roomBounds[c.roomId];
    const lead = this.chars.get(c.sessionId);
    const ctx = {
      now: this.now,
      arrived:
        c.goal !== undefined && !c.to && c.path.length === 0 && sameTile(c.tile, c.goal.tile),
      insideRoom:
        room !== undefined &&
        c.tile.x >= room.x &&
        c.tile.x < room.x + room.w &&
        c.tile.y >= room.y &&
        c.tile.y < room.y + room.h,
      hasTarget: (target: Target) =>
        target === 'door'
          ? door !== undefined
          : layout.pois.some((p) => p.type === target && p.roomId === c.roomId),
      hasLead:
        c.role === 'agent' &&
        lead?.role === 'lead' &&
        lead.spawned &&
        lead.visual.phase !== 'leaving' &&
        lead.visual.phase !== 'gone',
      holdSummon: [...this.chars.values()].some(
        (o) => o.sessionId === c.sessionId && o.role === 'agent' && o.visual.phase === 'entering',
      ),
    };
    const { state, goal } = nextVisualState(c.visual, actor, ctx);
    c.visual = state;
    if (state.phase === 'delivering' || state.phase === 'leaving') this.desks.release(c.id);

    const resolved = this.resolveGoal(c, goal, layout);
    const key = resolved ? `${goal.kind}:${keyOf(resolved.tile)}` : goal.kind;
    if (key !== c.goalKey) {
      c.goalKey = key;
      c.goal = resolved;
      c.path = [];
      c.needsPlan = true;
    } else {
      c.goal = resolved;
    }

    this.move(c, layout, dt);
    if (!c.to && c.path.length === 0 && resolved && sameTile(c.tile, resolved.tile)) {
      if (resolved.facing && !c.faceLock) c.facing = resolved.facing;
    }
    this.render(c);
  }

  private trySpawn(c: Character, dt: number): void {
    const layout = this.layout;
    const door = layout ? this.doorOf(c, layout) : undefined;
    if (!layout || !door) {
      c.spawned = true;
      c.tile = layout?.spawn ?? c.tile;
      return;
    }
    c.spawnWaitMs += dt;
    const holder = this.occupied.get(keyOf(door.outside));
    // One character at a time on the tile outside the door; a stuck queue is forced after a while.
    if (holder !== undefined && c.spawnWaitMs < FORCE_AFTER_MS) return;
    c.tile = door.outside;
    c.facing = 'down';
    c.spawned = true;
    c.sprite.setVisible(true);
    c.shadow.setVisible(true);
    this.occupied.set(keyOf(c.tile), c.id);
  }

  private blockedBy(c: Character, tile: Tile): boolean {
    const holder = this.occupied.get(keyOf(tile));
    return holder !== undefined && holder !== c.id;
  }

  private plan(c: Character, layout: BuildingLayout, avoidOthers: boolean): void {
    c.needsPlan = false;
    const goal = c.goal;
    if (!goal || sameTile(c.tile, goal.tile)) {
      c.path = [];
      return;
    }
    const blocked = avoidOthers ? (x: number, y: number) => this.blockedBy(c, { x, y }) : undefined;
    const path = findPath(layout.collision, c.tile, goal.tile, blocked ? { blocked } : {});
    if (path) {
      c.path = path;
    } else if (!avoidOthers) {
      // Unreachable on the static grid (should not happen): do not hang forever.
      c.tile = goal.tile;
      c.path = [];
    }
  }

  private move(c: Character, layout: BuildingLayout, dt: number): void {
    if (c.to) c.stepMs += dt;
    for (let guard = 0; guard < 4; guard += 1) {
      if (c.to) {
        if (c.stepMs < STEP_MS) return;
        if (this.occupied.get(keyOf(c.tile)) === c.id) this.occupied.delete(keyOf(c.tile));
        c.tile = c.to;
        c.to = undefined;
        c.stepMs -= STEP_MS;
        if (c.path.length === 0) c.stepMs = 0;
      }
      if (c.needsPlan) this.plan(c, layout, false);
      const next = c.path[0];
      if (!next) {
        c.stepMs = 0;
        return;
      }
      if (this.blockedBy(c, next)) {
        c.blockedMs += dt;
        c.stepMs = 0;
        if (c.blockedMs >= FORCE_AFTER_MS) {
          // Give up waiting: walk through.
        } else {
          if (c.blockedMs >= REPLAN_AFTER_MS && !c.replanned) {
            c.replanned = true;
            this.plan(c, layout, true);
          }
          return;
        }
      }
      c.blockedMs = 0;
      c.replanned = false;
      c.path.shift();
      c.to = next;
      c.faceLock = false;
      c.facing = directionTo(c.tile, next) ?? c.facing;
      this.occupied.set(keyOf(next), c.id);
    }
  }

  // --- presentation ------------------------------------------------------------------------

  private animationFor(c: Character): CharacterAnimation {
    const { phase, activity } = c.visual;
    if (c.to) return `walk-${c.facing}`;
    if (c.faceLock) return `idle-${c.facing}`;
    if (phase === 'delivering' && c.visual.deliveredAt !== undefined) return 'celebrate';
    if (phase === 'at-desk') {
      // Always seated at the workstation: the monitor tells what the character is doing.
      switch (activity) {
        case 'typing':
        case 'terminal':
        case 'summoning':
          return 'sit-type';
        case 'reading':
        case 'web':
          return 'read';
        case 'sleeping':
          return 'sleep';
        default:
          return 'sit';
      }
    }
    if (phase === 'at-poi' && activity === 'web') return 'phone';
    return `idle-${c.facing}`;
  }

  private balloonFor(c: Character): BalloonId | undefined {
    const { phase, activity } = c.visual;
    if (this.askingIds.has(c.id) && phase !== 'leaving' && phase !== 'gone') return 'wait';
    if (phase === 'delivering') return c.visual.deliveredAt !== undefined ? 'doc' : undefined;
    if (phase === 'leaving' || phase === 'gone') return undefined;
    // Seated, the monitor already shows thinking (Claude's spinner) and sleep (the screensaver).
    const seated = phase === 'at-desk' && !c.to;
    if (seated && (activity === 'thinking' || activity === 'sleeping')) return undefined;
    switch (activity) {
      case 'waiting':
        return 'wait';
      case 'error':
        return 'error';
      case 'sleeping':
        return 'sleep';
      case 'thinking':
        return 'think';
      default:
        return undefined;
    }
  }

  private render(c: Character): void {
    const t = c.to ? Math.min(1, c.stepMs / STEP_MS) : 0;
    const tx = c.tile.x + ((c.to?.x ?? c.tile.x) - c.tile.x) * t;
    const ty = c.tile.y + ((c.to?.y ?? c.tile.y) - c.tile.y) * t;
    const px = Math.round(tx * TILE + TILE / 2);
    const py = Math.round(ty * TILE + TILE);
    c.sprite.setPosition(px, py).setDepth(SPRITE_DEPTH + py / 10_000);
    const alpha = c.visual.phase === 'gone' ? Math.max(0, 1 - c.fadeMs / FADE_MS) : 1;
    c.sprite.setAlpha(alpha);
    c.shadow
      .setPosition(px, py - 1)
      .setDepth(SPRITE_DEPTH - 0.5 + py / 10_000)
      .setAlpha(alpha);
    this.renderRing(c, px, py, alpha);
    // The tag sits under the feet so it never hides the head, the monitor or the balloon.
    const focus = this.focusTile;
    const near =
      focus !== undefined && Math.abs(c.tile.x - focus.x) + Math.abs(c.tile.y - focus.y) <= 2;
    const hovered =
      this.pointer !== undefined && c.sprite.getBounds().contains(this.pointer.x, this.pointer.y);
    const expanded = this.tagsFull || near || hovered || c.id === this.highlightId;
    c.tag.setExpanded(expanded);
    c.tag.setVisible(this.tagsVisible);
    // Seated, the feet are behind the chair: the tag rides on its base, clear of the next desk row.
    const seatedTag = !c.to && c.visual.phase === 'at-desk';
    // An expanded card is drawn over the compact tags of the neighbours.
    const tagDepth = TAG_DEPTH + (expanded ? 0.5 : 0) + py / 10_000;
    c.tag.place(px, py + (seatedTag ? -2 : 3) + c.tag.tagHeight, tagDepth, alpha);
    if (c.id === this.highlightId) this.renderHighlight(c, alpha);

    const animation = this.animationFor(c);
    if (animation !== c.anim) {
      if (animation === 'celebrate') this.burst(px, py - 20);
      c.anim = animation;
      c.sprite.play(animationKeyFor(c.id, animation));
      // Idle loops start at a random point so a room never breathes or blinks in sync.
      if (animation.startsWith('idle-')) {
        const total = c.sprite.anims.getTotalFrames();
        if (total > 1) c.sprite.anims.setProgress(Math.random());
      }
    }

    const balloonId = this.balloonFor(c);
    if (balloonId !== c.balloonId) {
      c.balloonId = balloonId;
      if (balloonId) c.balloon.setTexture(balloonTextureKey(balloonId));
      c.balloon.setVisible(balloonId !== undefined);
    }
    if (animation === 'sleep' && alpha > 0) this.snore(c, px, py);
    if (balloonId) {
      const bounce = balloonId === 'wait' ? Math.round(Math.abs(Math.sin(this.now / 130)) * 3) : 0;
      c.balloon
        .setPosition(
          px,
          py - this.factory.headHeight(SEATED_ANIMATIONS.has(animation)) - 1 - bounce,
        )
        .setDepth(BALLOON_DEPTH + py / 10_000)
        .setAlpha(c.visual.phase === 'gone' ? 0 : 1);
    }
  }

  /** Status ring: steady for working/thinking, pulsing for waiting/error, none otherwise. */
  private renderRing(c: Character, px: number, py: number, alpha: number): void {
    const status = c.status;
    const shown =
      c.spawned &&
      c.visual.phase !== 'gone' &&
      (status === 'working' || status === 'thinking' || status === 'waiting' || status === 'error');
    c.ring.setVisible(shown);
    if (!shown || status === undefined) return;
    const urgent = status === 'waiting' || status === 'error';
    const pulse = urgent ? 0.55 + 0.45 * Math.abs(Math.sin(this.now / 260)) : 0.7;
    c.ring
      .setTint(STATUS_COLOR[status])
      .setPosition(px, py - 1)
      .setDepth(SPRITE_DEPTH - 0.45 + py / 10_000)
      .setAlpha(alpha * pulse);
  }

  private renderHighlight(c: Character, alpha: number): void {
    const frame = c.sprite.frame;
    const offsets = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const;
    this.highlight.forEach((s, i) => {
      const [dx, dy] = offsets[i] ?? [0, 0];
      s.setTexture(frame.texture.key, frame.name)
        .setPosition(c.sprite.x + dx, c.sprite.y + dy)
        .setDepth(c.sprite.depth - 0.00002)
        .setTintFill(0xffffff)
        .setAlpha(alpha * 0.85)
        .setVisible(c.sprite.visible);
    });
  }

  private burst(x: number, y: number): void {
    if (!this.confetti) {
      this.confetti = this.scene.add
        .particles(0, 0, DOT_KEY, {
          emitting: false,
          speed: { min: 30, max: 70 },
          angle: { min: 220, max: 320 },
          gravityY: 140,
          lifespan: 900,
          alpha: { start: 1, end: 0 },
          scale: { min: 1, max: 2 },
          tint: [0xf2c94c, 0x58d36b, 0x4f8fe8, 0xe5544b, 0xa98bff],
        })
        .setDepth(BALLOON_DEPTH + 1);
    }
    this.confetti.explode(14, x, y);
  }

  /** A small "z" drifts up from a sleeping character every couple of seconds. */
  private snore(c: Character, px: number, py: number): void {
    const due = this.nextZ.get(c.id) ?? this.now + Math.random() * 1500;
    if (this.now < due) {
      this.nextZ.set(c.id, due);
      return;
    }
    this.nextZ.set(c.id, this.now + 1800 + Math.random() * 900);
    const top = py - this.factory.headHeight(true);
    const z = this.scene.add
      .image(px + 5, top - 2, Z_KEY)
      .setOrigin(0.5, 1)
      .setDepth(BALLOON_DEPTH);
    this.scene.tweens.add({
      targets: z,
      x: px + 9,
      y: top - 14,
      alpha: { from: 1, to: 0 },
      duration: 1600,
      ease: 'Sine.easeOut',
      onComplete: () => z.destroy(),
    });
  }
}
