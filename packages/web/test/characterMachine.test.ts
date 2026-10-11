import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TOOL_TABLE,
  DELIVER_MS,
  initialState,
  type MachineActor,
  type MachineContext,
  MIN_DWELL_MS,
  nextVisualState,
  ROAMING_TOOL_TABLE,
  ruleForTool,
  SUMMON_HOLD_MS,
  type VisualState,
} from '../src/characters/characterMachine';

const ctx = (now: number, extra: Partial<MachineContext> = {}): MachineContext => ({
  now,
  arrived: false,
  insideRoom: true,
  hasTarget: () => true,
  hasLead: true,
  ...extra,
});

const agent = (status: MachineActor['status'], currentTool?: string): MachineActor => ({
  role: 'agent',
  status,
  currentTool,
});
const lead = (status: MachineActor['status'], currentTool?: string): MachineActor => ({
  role: 'lead',
  status,
  currentTool,
});

/** Runs one step and returns the new state. */
const step = (
  state: VisualState,
  actor: MachineActor | undefined,
  now: number,
  extra: Partial<MachineContext> = {},
) => nextVisualState(state, actor, ctx(now, extra));
/** Same, with the roaming tool table (tools used at points of interest). */
const roam = (
  state: VisualState,
  actor: MachineActor | undefined,
  now: number,
  extra: Partial<MachineContext> = {},
) => step(state, actor, now, { tools: ROAMING_TOOL_TABLE, ...extra });

describe('tool table', () => {
  it.each([
    ['Edit', 'typing', undefined],
    ['Write', 'typing', undefined],
    ['NotebookEdit', 'typing', undefined],
    ['Read', 'reading', undefined],
    ['Grep', 'reading', undefined],
    ['Glob', 'reading', undefined],
    ['Bash', 'terminal', undefined],
    ['WebFetch', 'web', undefined],
    ['WebSearch', 'web', undefined],
    ['Agent', 'summoning', undefined],
    ['mcp__github__create_issue', 'typing', undefined],
    ['SomethingNew', 'typing', undefined],
  ])('%s -> %s (%s)', (tool, activity, target) => {
    const rule = ruleForTool(tool);
    expect(rule.activity).toBe(activity);
    expect(rule.target).toBe(target);
  });

  it('the roaming table sends Bash, the web and Agent to points of interest', () => {
    expect(ruleForTool('Bash', ROAMING_TOOL_TABLE).target).toBe('server-rack');
    expect(ruleForTool('WebFetch', ROAMING_TOOL_TABLE).target).toBe('phone');
    expect(ruleForTool('WebSearch', ROAMING_TOOL_TABLE).target).toBe('window');
    expect(ruleForTool('Agent', ROAMING_TOOL_TABLE).target).toBe('door');
  });

  it('is configurable', () => {
    const table = {
      ...DEFAULT_TOOL_TABLE,
      Read: { activity: 'terminal', target: 'phone' },
    } as const;
    expect(ruleForTool('Read', table)).toEqual({ activity: 'terminal', target: 'phone' });
  });
});

describe('lifecycle', () => {
  it('spawn -> work -> finish -> leaving -> gone', () => {
    let s = initialState('entering', 0);
    expect(s.phase).toBe('entering');

    // Enters: stays 'entering' until inside the room.
    let out = step(s, agent('spawning'), 100, { insideRoom: false });
    expect(out.state.phase).toBe('entering');
    expect(out.goal).toEqual({ kind: 'desk' });
    out = step(out.state, agent('spawning'), 600, { insideRoom: true });
    expect(out.state.phase).toBe('walking-to-desk');

    // Arrives at the desk and starts typing.
    out = step(out.state, agent('working', 'Edit'), 1000, { arrived: true });
    expect(out.state.activity).toBe('typing');
    out = step(out.state, agent('working', 'Edit'), 1100, { arrived: true });
    expect(out.state.phase).toBe('at-desk');
    expect(out.state.activity).toBe('typing');

    // Finishes: hands over the report from the desk (nobody walks to the Tech Lead)...
    out = step(out.state, agent('finished'), 3000);
    expect(out.state.phase).toBe('delivering');
    expect(out.state.deliveredAt).toBe(3000);
    expect(out.goal).toEqual({ kind: 'stay' });
    out = step(out.state, agent('finished'), 3000 + DELIVER_MS - 1);
    expect(out.state.phase).toBe('delivering');
    // ...then leaves through the door and is gone on arrival.
    out = step(out.state, agent('finished'), 3000 + DELIVER_MS);
    expect(out.state.phase).toBe('leaving');
    expect(out.goal).toEqual({ kind: 'exit' });
    out = step(out.state, agent('finished'), 5000);
    expect(out.state.phase).toBe('leaving');
    out = step(out.state, agent('finished'), 6000, { arrived: true });
    expect(out.state.phase).toBe('gone');
    s = out.state;
    expect(step(s, agent('finished'), 7000).state.phase).toBe('gone');
  });

  it('an agent finishing without a Tech Lead leaves directly', () => {
    const out = step(initialState('at-desk', 0), agent('finished'), 10, { hasLead: false });
    expect(out.state.phase).toBe('leaving');
  });

  it('leaves when the actor vanished from the model (session ended), from any phase', () => {
    for (const phase of ['entering', 'at-desk'] as const) {
      const out = step(initialState(phase, 0), undefined, 10);
      expect(out.state.phase).toBe('leaving');
      expect(out.goal).toEqual({ kind: 'exit' });
    }
    expect(step(initialState('at-desk', 0), lead('ended'), 10).state.phase).toBe('leaving');
    // Also while delivering.
    const delivering = step(initialState('at-desk', 0), agent('finished'), 10).state;
    expect(step(delivering, undefined, 20).state.phase).toBe('leaving');
  });

  it('the Tech Lead never delivers', () => {
    const out = step(initialState('at-desk', 0), lead('idle'), 1000);
    expect(out.state.phase).toBe('at-desk');
    expect(out.state.activity).toBe('sleeping');
  });
});

describe('activities', () => {
  const atDesk = (): VisualState => initialState('at-desk', 0);

  it('maps statuses to activities', () => {
    expect(step(atDesk(), lead('thinking'), 1000).state.activity).toBe('thinking');
    expect(step(atDesk(), lead('idle'), 1000).state.activity).toBe('sleeping');
    expect(step(atDesk(), lead('waiting'), 1000).state.activity).toBe('waiting');
    expect(step(atDesk(), lead('error'), 1000).state.activity).toBe('error');
    expect(step(atDesk(), lead('working', 'Read'), 1000).state.activity).toBe('reading');
  });

  it('by default every tool is used seated at the desk, the Tech Lead included', () => {
    for (const tool of ['Bash', 'WebFetch', 'WebSearch', 'Edit', 'Read', 'mcp__x__y']) {
      const out = step(atDesk(), agent('working', tool), 1000);
      expect(out.state.phase).toBe('at-desk');
      expect(out.goal).toEqual({ kind: 'desk' });
    }
    const summon = step(atDesk(), lead('working', 'Agent'), 1000);
    expect(summon.state.activity).toBe('summoning');
    expect(summon.state.phase).toBe('at-desk');
    expect(summon.goal).toEqual({ kind: 'desk' });
  });

  it('walks to the point of interest for Bash, WebFetch and WebSearch (roaming table)', () => {
    const bash = roam(atDesk(), agent('working', 'Bash'), 1000);
    expect(bash.state.phase).toBe('walking-to-poi');
    expect(bash.goal).toEqual({ kind: 'poi', target: 'server-rack' });
    const arrived = roam(bash.state, agent('working', 'Bash'), 1500, { arrived: true });
    expect(arrived.state.phase).toBe('at-poi');
    expect(roam(atDesk(), agent('working', 'WebFetch'), 1000).goal).toEqual({
      kind: 'poi',
      target: 'phone',
    });
    expect(roam(atDesk(), agent('working', 'WebSearch'), 1000).goal).toEqual({
      kind: 'poi',
      target: 'window',
    });
  });

  it('does the activity at the desk when the room lacks the point of interest', () => {
    const out = roam(atDesk(), agent('working', 'Bash'), 1000, { hasTarget: () => false });
    expect(out.state.phase).toBe('at-desk');
    expect(out.state.activity).toBe('terminal');
    expect(out.goal).toEqual({ kind: 'desk' });
  });

  it('keeps an activity for the minimum dwell time before replacing it', () => {
    let out = step(atDesk(), agent('working', 'Edit'), 1000);
    expect(out.state.activity).toBe('typing');
    // The tool ends at once: thinking must wait.
    out = step(out.state, agent('thinking'), 1000 + MIN_DWELL_MS - 1);
    expect(out.state.activity).toBe('typing');
    out = step(out.state, agent('thinking'), 1000 + MIN_DWELL_MS);
    expect(out.state.activity).toBe('thinking');
  });

  it('shows waiting at once and keeps it over thinking until the dwell time passed', () => {
    let out = step(atDesk(), agent('working', 'Edit'), 1000);
    out = step(out.state, agent('waiting'), 1100);
    expect(out.state.activity).toBe('waiting');
    // A thinking status right after does not displace waiting before its dwell time.
    out = step(out.state, agent('thinking'), 1100 + MIN_DWELL_MS - 1);
    expect(out.state.activity).toBe('waiting');
    out = step(out.state, agent('thinking'), 1100 + MIN_DWELL_MS);
    expect(out.state.activity).toBe('thinking');
  });

  it('a tool that ends while the character is still walking sends it straight back to the desk', () => {
    let out = roam(atDesk(), agent('working', 'Bash'), 1000);
    expect(out.state.phase).toBe('walking-to-poi');
    out = roam(out.state, agent('thinking'), 1050);
    expect(out.state.phase).toBe('walking-to-desk');
    expect(out.state.activity).toBe('thinking');
    expect(out.goal).toEqual({ kind: 'desk' });
  });

  it('switches the target when another point-of-interest tool starts on the way', () => {
    let out = roam(atDesk(), agent('working', 'Bash'), 1000);
    out = roam(out.state, agent('working', 'WebFetch'), 1100);
    expect(out.state.phase).toBe('walking-to-poi');
    expect(out.goal).toEqual({ kind: 'poi', target: 'phone' });
  });

  it('goes back to the desk after the dwell time once the tool at the poi ended', () => {
    let out = roam(atDesk(), agent('working', 'Bash'), 1000);
    out = roam(out.state, agent('working', 'Bash'), 1500, { arrived: true });
    expect(out.state.phase).toBe('at-poi');
    out = roam(out.state, agent('thinking'), 1500 + MIN_DWELL_MS - 1);
    expect(out.state.phase).toBe('at-poi');
    out = roam(out.state, agent('thinking'), 1500 + MIN_DWELL_MS);
    expect(out.state.phase).toBe('walking-to-desk');
  });

  it('the Tech Lead calls at the door for a while when it summons, then returns to the desk', () => {
    let out = roam(atDesk(), lead('working', 'Agent'), 1000);
    expect(out.state.activity).toBe('summoning');
    expect(out.goal).toEqual({ kind: 'poi', target: 'door' });
    out = roam(out.state, lead('working', 'Agent'), 2000, { arrived: true });
    expect(out.state.phase).toBe('at-poi');
    const arrivedAt = out.state.since;
    // Keeps calling while somebody is still entering.
    out = roam(out.state, lead('working', 'Agent'), arrivedAt + SUMMON_HOLD_MS + 500, {
      holdSummon: true,
    });
    expect(out.state.summonDone).toBe(false);
    out = roam(out.state, lead('working', 'Agent'), arrivedAt + SUMMON_HOLD_MS + 600);
    expect(out.state.summonDone).toBe(true);
    out = roam(out.state, lead('working', 'Agent'), arrivedAt + SUMMON_HOLD_MS + 700);
    expect(out.state.activity).toBe('thinking');
    expect(out.state.phase).toBe('walking-to-desk');
    // The same running Agent tool does not send it back to the door.
    out = roam(out.state, lead('working', 'Agent'), arrivedAt + SUMMON_HOLD_MS + 5000, {
      arrived: true,
    });
    expect(out.state.phase).toBe('at-desk');
    expect(out.state.activity).toBe('thinking');
  });
});
