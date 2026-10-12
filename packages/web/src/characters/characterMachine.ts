import type { ActorStatus } from '@agents-office/shared';
import type { PoiType } from '../world/roomLayout';

/** Pure visual state machine of a character (no Phaser, no clock: `now` is passed in). */

export const ACTIVITIES = [
  'thinking',
  'typing',
  'reading',
  'terminal',
  'web',
  'summoning',
  'waiting',
  'error',
  'sleeping',
] as const;
export type Activity = (typeof ACTIVITIES)[number];

export const PHASES = [
  'entering',
  'walking-to-desk',
  'at-desk',
  'walking-to-poi',
  'at-poi',
  'visiting',
  'delivering',
  'leaving',
  'gone',
] as const;
export type Phase = (typeof PHASES)[number];

/** Where an activity is performed besides the desk: a layout POI or the room's door. */
export type Target = Extract<PoiType, 'server-rack' | 'phone' | 'window' | 'whiteboard'> | 'door';

/** Minimum time an activity stays on screen before the next one replaces it. */
export const MIN_DWELL_MS = 600;
/** How long the Tech Lead keeps calling at the door after arriving there. */
export const SUMMON_HOLD_MS = 3000;
/** Celebration (report delivered from the desk) duration before the agent heads for the door. */
export const DELIVER_MS = 1400;

/** Safety net: a visitor goes back to its desk this long after the visit began, answered or not. */
export const VISIT_TIMEOUT_MS = 60_000;

export interface ToolRule {
  activity: Activity;
  target?: Target;
}

/** Tool name -> activity (and where it happens). Unknown tools (`mcp__*` too) type at the desk. */
export type ToolTable = Readonly<Record<string, ToolRule>>;

/**
 * Every tool is used at the workstation: agents and Tech Leads never leave their computer while
 * they work (the monitor shows the activity instead). A table with `target`s still sends the
 * character to a point of interest (see {@link ROAMING_TOOL_TABLE}).
 */
export const DEFAULT_TOOL_TABLE: ToolTable = {
  Edit: { activity: 'typing' },
  MultiEdit: { activity: 'typing' },
  Write: { activity: 'typing' },
  NotebookEdit: { activity: 'typing' },
  Read: { activity: 'reading' },
  Grep: { activity: 'reading' },
  Glob: { activity: 'reading' },
  Bash: { activity: 'terminal' },
  WebFetch: { activity: 'web' },
  WebSearch: { activity: 'web' },
  Agent: { activity: 'summoning' },
  Task: { activity: 'summoning' },
};

/** The older behaviour: Bash at the server rack, the web at the phone/window, Agent at the door. */
export const ROAMING_TOOL_TABLE: ToolTable = {
  ...DEFAULT_TOOL_TABLE,
  Bash: { activity: 'terminal', target: 'server-rack' },
  WebFetch: { activity: 'web', target: 'phone' },
  WebSearch: { activity: 'web', target: 'window' },
  Agent: { activity: 'summoning', target: 'door' },
  Task: { activity: 'summoning', target: 'door' },
};

const FALLBACK_RULE: ToolRule = { activity: 'typing' };

/** The agent-bus tools that draw on the shared whiteboard (`mcp__<server>__board_add_elements`...). */
const BOARD_DRAW_TOOL = /(?:^|__)board_(?:add_elements|add_mermaid|clear)$/;
const BOARD_RULE: ToolRule = { activity: 'typing', target: 'whiteboard' };

/**
 * The agent-bus tools that drive the embedded browser (`mcp__<server>__browser_navigate`...): the
 * character stays at its computer looking at the monitor (`web`), never walking to a POI (spec 085).
 */
const BROWSER_TOOL =
  /(?:^|__)browser_(?:navigate|click|type|press_key|eval|wait_for|snapshot|screenshot|console)$/;
const BROWSER_RULE: ToolRule = { activity: 'web' };

/** Drawing on the board always walks to it (spec 078), whatever the table says. */
export function ruleForTool(tool: string, table: ToolTable = DEFAULT_TOOL_TABLE): ToolRule {
  const known = table[tool];
  if (known) return known;
  if (BOARD_DRAW_TOOL.test(tool)) return BOARD_RULE;
  return BROWSER_TOOL.test(tool) ? BROWSER_RULE : FALLBACK_RULE;
}

export interface VisualState {
  phase: Phase;
  activity: Activity;
  /** Place of the current activity (undefined: at the desk). */
  target: Target | undefined;
  /** When the current activity/phase step started (ms). */
  since: number;
  /** The Tech Lead already called at the door for the running `Agent` tool. */
  summonDone: boolean;
  /** When the report was handed over (`delivering` only). */
  deliveredAt: number | undefined;
  /** Message being delivered in person (`visiting` only): the character is at the recipient's desk. */
  visitId: string | undefined;
  /** Last visit that ended by the safety timeout (ignored if the host still offers it). */
  visitTimedOut: string | undefined;
}

/** A visit the host wants this character to make: it lasts until the host stops offering it. */
export interface VisitRequest {
  id: string;
  /** When the visit began (ms, same clock as `now`): the safety timeout counts from here. */
  startedAt: number;
}

/** The part of the model the machine looks at. */
export interface MachineActor {
  role: 'lead' | 'agent';
  status: ActorStatus;
  currentTool?: string | undefined;
}

export interface MachineContext {
  now: number;
  /** The character reached the goal of its current phase. */
  arrived: boolean;
  /** The character is at the door or inside its room (ends `entering`). */
  insideRoom: boolean;
  /** The room has this point of interest (otherwise the activity happens at the desk). */
  hasTarget: (target: Target) => boolean;
  /** The session's Tech Lead is present, so there is somebody to deliver to. */
  hasLead: boolean;
  /** Somebody is still entering (keeps the Tech Lead calling at the door). */
  holdSummon?: boolean;
  /** The visit this character should be making now (undefined: none). */
  visit?: VisitRequest | undefined;
  tools?: ToolTable;
}

export type Goal =
  | { kind: 'stay' }
  | { kind: 'desk' }
  | { kind: 'poi'; target: Target }
  | { kind: 'visit'; visitId: string }
  | { kind: 'exit' };

export interface VisualIntent {
  state: VisualState;
  goal: Goal;
}

export function initialState(phase: 'entering' | 'at-desk', now: number): VisualState {
  return {
    phase,
    activity: 'thinking',
    target: undefined,
    since: now,
    summonDone: false,
    deliveredAt: undefined,
    visitId: undefined,
    visitTimedOut: undefined,
  };
}

export function goalFor(state: VisualState): Goal {
  switch (state.phase) {
    case 'entering':
    case 'walking-to-desk':
    case 'at-desk':
      return { kind: 'desk' };
    case 'walking-to-poi':
    case 'at-poi':
      return state.target ? { kind: 'poi', target: state.target } : { kind: 'desk' };
    case 'visiting':
      return state.visitId !== undefined
        ? { kind: 'visit', visitId: state.visitId }
        : { kind: 'desk' };
    case 'delivering':
      return { kind: 'stay' };
    case 'leaving':
      return { kind: 'exit' };
    case 'gone':
      return { kind: 'stay' };
  }
}

const intent = (state: VisualState): VisualIntent => ({ state, goal: goalFor(state) });

interface Want {
  activity: Activity;
  target: Target | undefined;
  /** The wanted activity is the (not yet answered) `Agent` summoning call. */
  summoning: boolean;
}

function wantFor(actor: MachineActor, current: VisualState, ctx: MachineContext): Want {
  const plain = (activity: Activity): Want => ({ activity, target: undefined, summoning: false });
  switch (actor.status) {
    case 'waiting':
      return plain('waiting');
    case 'error':
      return plain('error');
    case 'idle':
    case 'finished':
    case 'ended':
      return plain('sleeping');
    case 'spawning':
    case 'thinking':
      return plain('thinking');
    case 'working': {
      if (!actor.currentTool) return plain('thinking');
      const rule = ruleForTool(actor.currentTool, ctx.tools);
      const summoning = rule.activity === 'summoning';
      if (summoning && current.summonDone) return { ...plain('thinking'), summoning };
      const target = rule.target && ctx.hasTarget(rule.target) ? rule.target : undefined;
      return { activity: rule.activity, target, summoning };
    }
  }
}

/** `waiting` and `error` are shown at once, without waiting for the dwell time of the previous one. */
const isUrgent = (activity: Activity): boolean => activity === 'waiting' || activity === 'error';

const WORK_PHASES: readonly Phase[] = [
  'entering',
  'walking-to-desk',
  'at-desk',
  'walking-to-poi',
  'at-poi',
];

/**
 * One step of the visual state machine. `actor` is the model view of the character (undefined when
 * it left the model, e.g. its session ended). Pure: the same inputs always give the same intent.
 *
 *  - lifecycle: entering -> walking-to-desk -> at-desk (<-> walking-to-poi -> at-poi only with a
 *    roaming tool table), then delivering at the desk (finished agents) -> leaving -> gone;
 *  - an activity stays at least {@link MIN_DWELL_MS} (except `waiting`/`error`, shown at once, and
 *    while walking to a POI: a tool that ends on the way sends the character straight back);
 *  - a visit (`ctx.visit`) takes the character from its desk (or a point of interest) to the
 *    recipient's desk and keeps it there until the host stops offering the visit (the reply
 *    arrived) or {@link VISIT_TIMEOUT_MS} passes; then it walks back and resumes its activity;
 *  - `waiting` is never displaced by `thinking` before its dwell time.
 */
export function nextVisualState(
  current: VisualState,
  actor: MachineActor | undefined,
  ctx: MachineContext,
): VisualIntent {
  const { now } = ctx;
  if (current.phase === 'gone') return intent(current);
  if (current.phase === 'leaving') {
    return intent(ctx.arrived ? { ...current, phase: 'gone', since: now } : current);
  }
  if (!actor || actor.status === 'ended') {
    return intent({
      ...current,
      phase: 'leaving',
      since: now,
      deliveredAt: undefined,
      visitId: undefined,
    });
  }

  if (current.phase === 'delivering' || (actor.role === 'agent' && actor.status === 'finished')) {
    if (current.phase !== 'delivering') {
      if (!ctx.hasLead) return intent({ ...current, phase: 'leaving', since: now });
      // The report is handed over from the workstation: nobody walks to the Tech Lead's desk.
      return intent({ ...current, phase: 'delivering', since: now, deliveredAt: now });
    }
    if (current.deliveredAt === undefined || now - current.deliveredAt >= DELIVER_MS) {
      return intent({ ...current, phase: 'leaving', since: now });
    }
    return intent(current);
  }

  if (current.phase === 'visiting') {
    const visit = ctx.visit;
    const back = { ...current, phase: 'walking-to-desk' as const, since: now, visitId: undefined };
    if (!visit) return intent(back);
    if (now - visit.startedAt >= VISIT_TIMEOUT_MS) {
      return intent({ ...back, visitTimedOut: visit.id });
    }
    // The next recipient of a broadcast: go straight there, without passing by the desk.
    if (visit.id !== current.visitId) return intent({ ...current, since: now, visitId: visit.id });
    return intent(current);
  }
  if (!WORK_PHASES.includes(current.phase)) return intent(current);

  const visit = ctx.visit;
  if (
    visit &&
    current.phase !== 'entering' &&
    visit.id !== current.visitTimedOut &&
    now - visit.startedAt < VISIT_TIMEOUT_MS
  ) {
    return intent({ ...current, phase: 'visiting', since: now, visitId: visit.id });
  }

  let state = current;
  if (state.phase === 'entering' && (ctx.insideRoom || ctx.arrived)) {
    state = { ...state, phase: 'walking-to-desk' };
  }

  const want = wantFor(actor, state, ctx);
  const summonDone = want.summoning ? state.summonDone : false;
  if (summonDone !== state.summonDone) state = { ...state, summonDone };

  if (want.activity !== state.activity || want.target !== state.target) {
    if (
      isUrgent(want.activity) ||
      state.phase === 'walking-to-poi' ||
      now - state.since >= MIN_DWELL_MS
    ) {
      let phase = state.phase;
      if (want.target !== undefined) {
        if (phase === 'at-desk' || phase === 'at-poi' || phase === 'walking-to-poi') {
          phase = 'walking-to-poi';
        }
      } else if (phase === 'at-poi' || phase === 'walking-to-poi') {
        phase = 'walking-to-desk';
      }
      return intent({ ...state, phase, activity: want.activity, target: want.target, since: now });
    }
    return intent(state);
  }

  if (state.phase === 'walking-to-desk' && ctx.arrived) {
    const next = { ...state, since: now };
    return intent(
      next.target !== undefined
        ? { ...next, phase: 'walking-to-poi' }
        : { ...next, phase: 'at-desk' },
    );
  }
  if (state.phase === 'at-desk' && state.target !== undefined) {
    return intent({ ...state, phase: 'walking-to-poi' });
  }
  if (state.phase === 'walking-to-poi' && ctx.arrived) {
    return intent({ ...state, phase: 'at-poi', since: now });
  }
  if (
    state.phase === 'at-poi' &&
    state.activity === 'summoning' &&
    !state.summonDone &&
    !ctx.holdSummon &&
    now - state.since >= SUMMON_HOLD_MS
  ) {
    return intent({ ...state, summonDone: true });
  }
  return intent(state);
}
