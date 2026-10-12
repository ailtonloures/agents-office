import {
  AGENT_NOTES_MAX,
  type AgentProfile,
  type CatalogProject,
  type CommMessage,
  type CommsBridge,
  type CommsStatus,
  commPreview,
  type ManagedChange,
  PROFILE_INSTRUCTIONS_MAX,
  PROFILE_NAME_MAX,
  type ProjectRoster,
  type ProjectsBridge,
  type SpawnAuditEvent,
  type TerminalPermissionMode,
} from '@agents-office/shared';
import {
  APPEARANCE_RANGES,
  explicitAppearance,
  type Appearance as LookState,
} from '../characters/appearance';
import { BUTTON_CSS } from './buttonStyles';
import {
  auditLine,
  auditNewestFirst,
  availableProfiles,
  BASE_OPTIONS,
  buildCastRows,
  type CastBridges,
  type CastRow,
  canDeleteProfile,
  deleteProfileWarning,
  emptyForm,
  type FormErrors,
  formFromProfile,
  formToDraft,
  HAIR_COLORS,
  hasErrors,
  linkOptions,
  linksLabel,
  notesCounter,
  OUTFIT_COLORS,
  otherProfileNames,
  type ProfileForm,
  randomAppearance,
  SKIN_COLORS,
  STATE_LABELS,
  startFailureMessage,
  validateForm,
} from './castLogic';
import { commsBridgeOf } from './commsBinding';
import { getCornerBar } from './cornerBar';
import { PERMISSION_MODES, permissionModeInfo } from './projectPicker';

const CSS = `
.ao-cast-btn{padding:4px 8px}
.ao-cast{position:fixed;inset:0;z-index:30;background:rgba(5,6,12,.8);display:flex;
  align-items:center;justify-content:center;font:13px monospace;color:#f0e6b8}
.ao-cast-box{background:#1b1d2a;border:3px solid #f0c040;width:min(820px,94vw);max-height:90vh;
  overflow-x:hidden;overflow-y:auto;box-sizing:border-box;padding:20px 24px;display:flex;
  flex-direction:column;gap:12px}
.ao-cast-box>*{min-width:0;max-width:100%}
.ao-cast-box h2{margin:0;font-size:16px}.ao-cast-box h3{margin:4px 0 0;font-size:13px;color:#f0c040}
.ao-cast-box input[type=text],.ao-cast-box select,.ao-cast-box textarea{font:13px monospace;
  background:#0d1020;color:#f0e6b8;border:2px solid #4a4f70;padding:4px 6px;box-sizing:border-box;
  max-width:100%}
.ao-cast-box textarea{width:100%;resize:vertical}
.ao-cast-box button{padding:4px 10px}
.ao-cast-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.ao-cast-row{background:#0d1020;padding:8px 10px;display:flex;flex-direction:column;gap:6px;
  border-left:3px solid #4a4f70}
.ao-cast-row[data-state=running]{border-left-color:#7ddc7d}
.ao-cast-row[data-state=failed],.ao-cast-row[data-state=missing]{border-left-color:#ff7b7b}
.ao-cast-head{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.ao-cast-head .name{font-weight:bold}.ao-cast-head .sub{color:#8a8fa8;flex:1;min-width:80px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ao-cast-head .state{color:#9ad1ff}
.ao-cast-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ao-cast-note,.ao-cast-warn,.ao-cast-err{line-height:1.5;overflow-wrap:anywhere;white-space:pre-wrap}
.ao-cast-note{color:#9ad1ff}.ao-cast-warn{color:#f0c040}.ao-cast-err{color:#ff7b7b}
.ao-cast-muted{color:#8a8fa8}
.ao-cast-history{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;
  max-height:180px;overflow-y:auto}
.ao-cast-history button{width:100%;text-align:left;display:block}
.ao-cast-history .full{margin:4px 0 6px;padding:6px 8px;background:#10131f;border-radius:4px;
  line-height:1.5;overflow-wrap:anywhere;white-space:pre-wrap}
.ao-cast-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.ao-cast-form{display:grid;grid-template-columns:minmax(0,1fr) 160px;gap:16px}
@media (max-width:620px){.ao-cast-form{grid-template-columns:minmax(0,1fr)}}
.ao-cast-fields{display:flex;flex-direction:column;gap:10px;min-width:0}
.ao-cast-fields label{display:flex;flex-direction:column;gap:4px}
.ao-cast-fields input[type=text],.ao-cast-fields select{width:100%}
.ao-cast-preview{display:flex;flex-direction:column;gap:8px;align-items:center}
.ao-cast-preview canvas{background:#0d1020;border:2px solid #4a4f70;image-rendering:pixelated;
  width:128px;height:auto;min-height:128px}
.ao-cast-swatches{display:flex;flex-wrap:wrap;gap:4px}
.ao-cast-swatch{width:22px;height:22px;padding:0!important;border:2px solid #4a4f70!important;
  box-shadow:none!important}
.ao-cast-swatch[aria-pressed=true]{border-color:#f0c040!important;outline:2px solid #f0c040}
${BUTTON_CSS}`;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  testId?: string,
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  if (testId) node.setAttribute('data-testid', testId);
  return node;
}

declare global {
  interface Window {
    /** Entry point for other screens and E2E. */
    __castPanel?: CastPanelHandle;
  }
}

export interface CastPanelHandle {
  open(cwd?: string): Promise<void>;
  close(): void;
}

export interface CastPanelOptions {
  /** cwds of the rooms the office shows now (merged into the project list). */
  knownCwds?: () => string[];
  /** The panel takes the keyboard while open (Phaser must not read keys). */
  onKeyboardCapture?: (captured: boolean) => void;
  /** Draws a look onto a canvas using the game's character factory; absent = swatch fallback. */
  drawAvatar?: (look: LookState, canvas: HTMLCanvasElement) => boolean;
  /** Whether the "Elenco" button is added. */
  button?: boolean;
}

/** Id the preview character is built with (only its hash-based traits depend on it). */
const PREVIEW_ID = '__preview__';

const EMPTY_CHANGE: ManagedChange = { sessions: [], failures: [] };

/**
 * Mounts the "Elenco" screen: the project's cast (add/remove profiles, start/stop sessions, notes,
 * auto-reopen) and the profile editor with a live avatar preview. The button lives inside
 * `gameParent`; the modal stays on `document.body`. Call only when the bridges exist.
 */
export function mountCastPanel(
  bridges: CastBridges,
  projects: ProjectsBridge,
  gameParent: HTMLElement,
  options: CastPanelOptions = {},
): CastPanelHandle {
  document.head.append(el('style', { textContent: CSS }));
  let overlay: HTMLElement | undefined;
  let unsubscribe: (() => void) | undefined;
  let unsubscribeComms: (() => void) | undefined;
  const commsBridge: CommsBridge | undefined = commsBridgeOf(window);

  const close = (): void => {
    if (!overlay) return;
    overlay.remove();
    overlay = undefined;
    unsubscribe?.();
    unsubscribe = undefined;
    unsubscribeComms?.();
    unsubscribeComms = undefined;
    document.removeEventListener('keydown', onEscape, true);
    options.onKeyboardCapture?.(false);
  };
  const onEscape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  };

  async function open(preselectCwd?: string): Promise<void> {
    close();
    const root = el('div', {}, 'cast-panel');
    root.className = 'ao-cast';
    const box = el('div');
    box.className = 'ao-cast-box';
    root.append(box);
    root.addEventListener('mousedown', (event) => {
      if (event.target === root) close();
    });
    document.body.append(root);
    document.addEventListener('keydown', onEscape, true);
    options.onKeyboardCapture?.(true);
    overlay = root;

    let projectList: CatalogProject[] = [];
    let cwd: string | undefined = preselectCwd;
    let profiles: AgentProfile[] = [];
    let roster: ProjectRoster = { entries: [], autoReopen: true };
    let change: ManagedChange = EMPTY_CHANGE;
    let message = '';
    let comms: CommsStatus = { mutedEntryIds: [], paused: false, hops: 0, hopLimit: 8 };
    /** Messages between agents of the selected project, newest first (full text). */
    let history: CommMessage[] = [];
    /** Message whose full text is open in the history list. */
    let historyOpen: string | undefined;
    /** Creations/dismissals of agents by orchestrators in the selected project. */
    let audit: SpawnAuditEvent[] = [];
    let error = '';
    let busy = false;
    /** Entry whose notes editor is open. */
    let notesOpen: string | undefined;
    let notesDraft = '';
    /** Entry whose "pode falar com" checklist is open. */
    let linksOpen: string | undefined;
    /** Profile editor state; undefined while the cast view shows. */
    let editor: { id: string | undefined; form: ProfileForm; errors: FormErrors } | undefined;

    const alive = () => overlay === root;
    const fail = (e: unknown) => {
      error = (e as Error).message ?? String(e);
      message = '';
    };

    async function loadRoster(): Promise<void> {
      roster = cwd ? await bridges.profiles.roster.get(cwd) : { entries: [], autoReopen: true };
      if (cwd) comms = await bridges.profiles.comms.status(cwd);
      await loadHistory();
      audit = cwd ? await bridges.profiles.agents.history(cwd) : [];
    }
    async function loadHistory(): Promise<void> {
      history = cwd && commsBridge ? await commsBridge.history(cwd) : [];
    }
    async function loadAll(): Promise<void> {
      profiles = await bridges.profiles.list();
      projectList = await projects.list(options.knownCwds?.() ?? []);
      if (!cwd || !projectList.some((p) => p.cwd === cwd)) {
        if (cwd)
          projectList = [
            ...projectList,
            {
              cwd,
              name: cwd.split('/').pop() ?? cwd,
              favorite: false,
              lastUsedAt: null,
              lastActivityAt: null,
              sources: [],
            },
          ];
        else cwd = projectList[0]?.cwd;
      }
      change = await bridges.managed.list();
      await loadRoster();
    }

    /** Runs an action, then refreshes the data; failures show as an error line. */
    async function act(task: () => Promise<void>, refresh = true): Promise<void> {
      if (busy) return;
      busy = true;
      error = '';
      render();
      try {
        await task();
        if (refresh) {
          profiles = await bridges.profiles.list();
          change = await bridges.managed.list();
          await loadRoster();
        }
      } catch (e) {
        fail(e);
      } finally {
        busy = false;
        if (alive()) render();
      }
    }

    unsubscribe = bridges.managed.onChange((next) => {
      change = next;
      if (alive() && !editor) render();
    });

    unsubscribeComms = commsBridge?.onEvent(() => {
      if (!alive() || editor) return;
      void loadHistory().then(
        () => alive() && !editor && render(),
        () => {},
      );
    });

    // ---- Cast view ----

    function renderCast(): void {
      box.replaceChildren();
      box.append(el('h2', { textContent: 'Elenco do projeto' }));

      const toolbar = el('div');
      toolbar.className = 'ao-cast-toolbar';
      const select = el('select', {}, 'cast-project');
      select.setAttribute('aria-label', 'Projeto');
      for (const project of projectList) {
        select.append(
          el('option', {
            value: project.cwd,
            textContent: `${project.name}  ${project.cwd}`,
            selected: project.cwd === cwd,
          }),
        );
      }
      if (projectList.length === 0) {
        select.append(
          el('option', { textContent: 'Nenhum projeto (inicie uma sessão em "Sessões")' }),
        );
        select.disabled = true;
      }
      select.onchange = () => {
        cwd = select.value;
        notesOpen = undefined;
        void act(async () => {}, true);
      };
      toolbar.append(select);
      box.append(toolbar);

      if (!cwd) {
        box.append(
          el('div', {
            className: 'ao-cast-note',
            textContent: 'Escolha um projeto para montar o elenco.',
          }),
        );
      } else {
        renderRoster(cwd);
      }
      renderHistory();
      renderAudit();
      renderLibrary();

      if (error)
        box.append(el('div', { className: 'ao-cast-err', textContent: error }, 'cast-error'));
      if (message)
        box.append(el('div', { className: 'ao-cast-note', textContent: message }, 'cast-message'));
      const actions = el('div');
      actions.className = 'ao-cast-actions';
      const closeBtn = el('button', { textContent: 'Fechar' }, 'cast-close');
      closeBtn.onclick = close;
      actions.append(closeBtn);
      box.append(actions);
    }

    function renderRoster(projectCwd: string): void {
      const rows = buildCastRows(projectCwd, roster, profiles, change);
      if (comms.paused) {
        const banner = el('div', {}, 'cast-comms-paused');
        banner.className = 'ao-cast-actions';
        const resume = el(
          'button',
          { textContent: 'Continuar', disabled: busy },
          'cast-comms-resume',
        );
        resume.onclick = () =>
          void act(async () => {
            comms = await bridges.profiles.comms.resume(projectCwd);
          });
        const stop = el('button', { textContent: 'Encerrar', disabled: busy }, 'cast-comms-stop');
        stop.onclick = () =>
          void act(async () => {
            comms = await bridges.profiles.comms.stop(projectCwd);
          });
        banner.append(
          el('span', {
            className: 'ao-cast-warn',
            textContent: `Conversa entre agentes pausada após ${comms.hops} mensagens seguidas.`,
          }),
          resume,
          stop,
        );
        box.append(banner);
      }
      const list = el('ul', {}, 'cast-roster');
      list.className = 'ao-cast-list';
      if (rows.length === 0) {
        box.append(
          el(
            'div',
            {
              className: 'ao-cast-muted',
              textContent: 'Nenhum agente no elenco deste projeto. Adicione um perfil abaixo.',
            },
            'cast-empty',
          ),
        );
      }
      for (const row of rows) list.append(renderRow(projectCwd, row, rows));
      box.append(list);

      const addable = availableProfiles(roster, profiles);
      const add = el('div');
      add.className = 'ao-cast-toolbar';
      const pick = el('select', {}, 'cast-add-select');
      pick.setAttribute('aria-label', 'Perfil a adicionar');
      for (const profile of addable)
        pick.append(el('option', { value: profile.id, textContent: profile.name }));
      const addBtn = el(
        'button',
        { textContent: 'Adicionar ao elenco', disabled: busy || addable.length === 0 },
        'cast-add',
      );
      pick.disabled = addable.length === 0;
      addBtn.onclick = () =>
        void act(async () => {
          await bridges.profiles.roster.addProfile(projectCwd, pick.value);
          message = '';
        });
      const auto = el('label');
      const autoBox = el(
        'input',
        { type: 'checkbox', checked: roster.autoReopen },
        'cast-auto-reopen',
      );
      autoBox.onchange = () =>
        void act(async () => {
          await bridges.profiles.roster.setAutoReopen(projectCwd, autoBox.checked);
        });
      auto.append(autoBox, document.createTextNode(' Reabrir o elenco ao abrir o app'));
      add.append(pick, addBtn, auto);
      box.append(add);
    }

    const STATUS_LABEL: Record<CommMessage['status'], string> = {
      'na-fila': 'na fila',
      entregue: 'entregue',
      respondida: 'respondida',
      expirada: 'expirada',
    };

    /** Messages between agents: one line each, click to read the full text. */
    function renderHistory(): void {
      if (!commsBridge || !cwd) return;
      box.append(el('h2', { textContent: 'Conversas entre agentes' }));
      if (history.length === 0) {
        box.append(
          el(
            'div',
            { className: 'ao-cast-muted', textContent: 'Nenhuma mensagem neste projeto ainda.' },
            'cast-history-empty',
          ),
        );
        return;
      }
      const list = el('ul', {}, 'cast-history');
      list.className = 'ao-cast-history';
      for (const m of history) {
        const item = el('li');
        const row = el(
          'button',
          {
            textContent: `${m.fromName} → ${m.toName} · ${commPreview(m.text, 60)} · ${STATUS_LABEL[m.status]}`,
            title: 'Abrir o texto completo',
          },
          `cast-history-${m.id}`,
        );
        row.onclick = () => {
          historyOpen = historyOpen === m.id ? undefined : m.id;
          render();
        };
        item.append(row);
        if (historyOpen === m.id) {
          const full = el('div', {}, `cast-history-text-${m.id}`);
          full.className = 'full';
          full.textContent = m.context ? `${m.text}\n\nContexto: ${m.context}` : m.text;
          item.append(full);
        }
        list.append(item);
      }
      box.append(list);
    }

    /** Who created and ended which agents (orchestrators and the user), newest first. */
    function renderAudit(): void {
      if (!cwd || audit.length === 0) return;
      box.append(el('h2', { textContent: 'Agentes criados' }));
      const list = el('ul', {}, 'cast-audit');
      list.className = 'ao-cast-history';
      for (const event of auditNewestFirst(audit)) {
        list.append(
          el(
            'li',
            { className: 'ao-cast-muted', textContent: auditLine(event) },
            'cast-audit-item',
          ),
        );
      }
      box.append(list);
    }

    function renderRow(projectCwd: string, row: CastRow, rows: readonly CastRow[]): HTMLElement {
      const item = el('li', {}, `cast-row-${row.entryId}`);
      item.className = 'ao-cast-row';
      item.dataset.state = row.state;
      const head = el('div');
      head.className = 'ao-cast-head';
      head.append(
        el('span', { className: 'name', textContent: row.name }),
        el('span', { className: 'sub', textContent: row.subtitle }),
        el('span', { className: 'state', textContent: STATE_LABELS[row.state] }, 'cast-state'),
      );
      item.append(head);
      if (row.createdBy) {
        item.append(
          el(
            'div',
            { className: 'ao-cast-muted', textContent: `Criado por ${row.createdBy}` },
            'cast-created-by',
          ),
        );
      }
      if (row.task) {
        item.append(
          el(
            'div',
            { className: 'ao-cast-muted', textContent: `Tarefa original: ${row.task}` },
            'cast-task',
          ),
        );
      }
      if (row.message)
        item.append(
          el('div', { className: 'ao-cast-err', textContent: row.message }, 'cast-row-error'),
        );

      const actions = el('div');
      actions.className = 'ao-cast-actions';
      if (row.state === 'running') {
        const stop = el('button', { textContent: 'Encerrar', disabled: busy }, 'cast-stop');
        stop.onclick = () =>
          void act(async () => {
            await bridges.managed.stop(projectCwd, row.entryId);
          });
        actions.append(stop);
      } else if (row.state !== 'missing') {
        const start = el('button', { textContent: 'Iniciar', disabled: busy }, 'cast-start');
        start.onclick = () =>
          void act(async () => {
            const result = await bridges.managed.start(projectCwd, row.entryId);
            message = result.ok ? `${row.name} iniciado.` : '';
            if (!result.ok) {
              error = `${row.name}: ${startFailureMessage({ ...result.failure, cwd: projectCwd })}`;
            }
          });
        actions.append(start);
      }
      const notes = el(
        'button',
        { textContent: notesOpen === row.entryId ? 'Fechar notas' : 'Notas', disabled: busy },
        'cast-notes-toggle',
      );
      notes.onclick = () => {
        notesOpen = notesOpen === row.entryId ? undefined : row.entryId;
        notesDraft = row.notes;
        render();
      };
      actions.append(notes);
      const muted = comms.mutedEntryIds.includes(row.entryId);
      item.dataset.muted = String(muted);
      const mute = el(
        'button',
        { textContent: muted ? 'Reativar mensagens' : 'Silenciar', disabled: busy },
        'cast-mute',
      );
      mute.onclick = () =>
        void act(async () => {
          await bridges.profiles.comms.mute(projectCwd, row.entryId, !muted);
        });
      actions.append(mute);
      const links = linkOptions(roster, rows, row.entryId);
      if (links.length > 0) {
        const toggle = el(
          'button',
          { textContent: linksLabel(links), disabled: busy },
          'cast-links-toggle',
        );
        toggle.onclick = () => {
          linksOpen = linksOpen === row.entryId ? undefined : row.entryId;
          render();
        };
        actions.append(toggle);
      }
      if (row.profile) {
        const edit = el('button', { textContent: 'Editar perfil', disabled: busy }, 'cast-edit');
        const profile = row.profile;
        edit.onclick = () => openEditor(profile);
        actions.append(edit);
      }
      if (row.kind === 'inline') {
        const promote = el(
          'button',
          { textContent: 'Salvar como perfil', disabled: busy },
          'cast-save-profile',
        );
        promote.onclick = () =>
          void act(async () => {
            const saved = await bridges.profiles.agents.saveAsProfile(projectCwd, row.entryId);
            message = `Perfil "${saved.name}" salvo na biblioteca.`;
          });
        actions.append(promote);
      }
      const remove = el(
        'button',
        { textContent: 'Remover do elenco', disabled: busy },
        'cast-remove',
      );
      remove.onclick = () =>
        void act(async () => {
          // Removing the entry would leave its terminal running with nobody tracking it.
          if (row.state === 'running') await bridges.managed.stop(projectCwd, row.entryId);
          await bridges.profiles.roster.remove(projectCwd, row.entryId);
        });
      actions.append(remove);
      item.append(actions);

      if (linksOpen === row.entryId && links.length > 0) {
        const list = el('div', {}, 'cast-links');
        list.className = 'ao-cast-actions';
        for (const option of links) {
          const label = el('label', {}, `cast-link-${option.entryId}`);
          const box = el('input', { type: 'checkbox', checked: option.connected, disabled: busy });
          box.onchange = () =>
            void act(async () => {
              const { roster: api } = bridges.profiles;
              if (box.checked) await api.connect(projectCwd, row.entryId, option.entryId);
              else await api.disconnect(projectCwd, row.entryId, option.entryId);
            });
          label.append(box, document.createTextNode(` ${option.name}`));
          list.append(label);
        }
        item.append(
          el('div', {
            className: 'ao-cast-muted',
            textContent:
              'A conexão vale nos dois sentidos. Sem conexão, não há entrega de mensagens.',
          }),
          list,
        );
      }

      if (notesOpen === row.entryId) {
        const area = el(
          'textarea',
          { rows: 5, value: notesDraft, maxLength: AGENT_NOTES_MAX },
          'cast-notes',
        );
        const counter = el('div', {
          className: 'ao-cast-muted',
          textContent: notesCounter(notesDraft, AGENT_NOTES_MAX),
        });
        area.oninput = () => {
          notesDraft = area.value;
          counter.textContent = notesCounter(notesDraft, AGENT_NOTES_MAX);
        };
        const save = el(
          'button',
          { textContent: 'Salvar notas', disabled: busy },
          'cast-notes-save',
        );
        save.onclick = () =>
          void act(async () => {
            await bridges.profiles.roster.setNotes(projectCwd, row.entryId, notesDraft);
            notesOpen = undefined;
            message = 'Notas salvas.';
          });
        item.append(
          el('div', {
            className: 'ao-cast-muted',
            textContent:
              'O agente lê e grava estas notas com a ferramenta save_notes; elas voltam no próximo início.',
          }),
          area,
          counter,
          save,
        );
      }
      return item;
    }

    function renderLibrary(): void {
      box.append(el('h3', { textContent: 'Biblioteca de perfis' }));
      const list = el('ul', {}, 'cast-library');
      list.className = 'ao-cast-list';
      for (const profile of profiles) {
        const item = el('li', {}, `cast-profile-${profile.id}`);
        item.className = 'ao-cast-row';
        const head = el('div');
        head.className = 'ao-cast-head';
        head.append(
          el('span', { className: 'name', textContent: profile.name }),
          el('span', { className: 'sub', textContent: profile.description }),
        );
        const actions = el('div');
        actions.className = 'ao-cast-actions';
        const edit = el('button', { textContent: 'Editar', disabled: busy }, 'cast-profile-edit');
        edit.onclick = () => openEditor(profile);
        const dup = el(
          'button',
          { textContent: 'Duplicar', disabled: busy },
          'cast-profile-duplicate',
        );
        dup.onclick = () =>
          void act(async () => {
            const copy = await bridges.profiles.duplicate(profile.id);
            message = `Perfil "${copy.name}" criado.`;
          });
        actions.append(edit, dup);
        if (canDeleteProfile(profile)) {
          const del = el(
            'button',
            { textContent: 'Apagar', disabled: busy },
            'cast-profile-delete',
          );
          del.onclick = () => void deleteProfile(profile);
          actions.append(del);
        }
        item.append(head, actions);
        list.append(item);
      }
      box.append(list);
      const create = el(
        'button',
        { textContent: 'Novo perfil', disabled: busy },
        'cast-new-profile',
      );
      create.onclick = () => openEditor(undefined);
      const wrap = el('div');
      wrap.className = 'ao-cast-actions';
      wrap.append(create);
      box.append(wrap);
    }

    async function deleteProfile(profile: AgentProfile): Promise<void> {
      await act(async () => {
        const first = await bridges.profiles.remove(profile.id);
        if (first.deleted) {
          message = `Perfil "${profile.name}" apagado.`;
          return;
        }
        // In use: ask before taking it out of the casts it belongs to.
        if (!window.confirm(deleteProfileWarning(profile.name, first.usedBy))) {
          message = 'Nada foi apagado.';
          return;
        }
        for (const session of (await bridges.managed.list()).sessions) {
          if (session.entryId === profile.id)
            await bridges.managed.stop(session.cwd, session.entryId);
        }
        const forced = await bridges.profiles.remove(profile.id, true);
        message = forced.deleted
          ? `Perfil "${profile.name}" apagado.`
          : 'Não foi possível apagar o perfil.';
      });
    }

    // ---- Profile editor ----

    function openEditor(profile: AgentProfile | undefined): void {
      editor = {
        id: profile?.id,
        form: profile ? formFromProfile(profile) : emptyForm(),
        errors: {},
      };
      error = '';
      message = '';
      render();
    }

    function renderEditor(state: NonNullable<typeof editor>): void {
      const { form } = state;
      box.replaceChildren();
      box.append(el('h2', { textContent: state.id ? 'Editar perfil' : 'Novo perfil' }));

      const grid = el('div');
      grid.className = 'ao-cast-form';
      const fields = el('div');
      fields.className = 'ao-cast-fields';

      const field = (
        label: string,
        input: HTMLElement,
        errorText: string | undefined,
        id: string,
      ) => {
        const wrap = el('label');
        wrap.append(document.createTextNode(label), input);
        if (errorText)
          wrap.append(
            el('span', { className: 'ao-cast-err', textContent: errorText }, `profile-error-${id}`),
          );
        return wrap;
      };

      const name = el(
        'input',
        { type: 'text', value: form.name, maxLength: PROFILE_NAME_MAX + 20 },
        'profile-name',
      );
      name.oninput = () => {
        form.name = name.value;
      };
      const description = el(
        'input',
        { type: 'text', value: form.description },
        'profile-description',
      );
      description.oninput = () => {
        form.description = description.value;
      };
      const instructions = el(
        'textarea',
        { rows: 8, value: form.instructions },
        'profile-instructions',
      );
      instructions.placeholder = 'Instruções em Markdown: papel, regras e tom do agente.';
      instructions.oninput = () => {
        form.instructions = instructions.value;
        counter.textContent = notesCounter(form.instructions, PROFILE_INSTRUCTIONS_MAX);
      };
      const counter = el('span', {
        className: 'ao-cast-muted',
        textContent: notesCounter(form.instructions, PROFILE_INSTRUCTIONS_MAX),
      });
      const mode = el('select', {}, 'profile-mode');
      for (const info of PERMISSION_MODES) {
        mode.append(
          el('option', {
            value: info.mode,
            textContent: info.label,
            selected: info.mode === form.permissionMode,
          }),
        );
      }
      const modeNote = el(
        'span',
        { className: 'ao-cast-note', textContent: permissionModeInfo(form.permissionMode).note },
        'profile-mode-note',
      );
      mode.onchange = () => {
        form.permissionMode = mode.value as TerminalPermissionMode;
        modeNote.textContent = permissionModeInfo(form.permissionMode).note;
      };
      const model = el('input', { type: 'text', value: form.model }, 'profile-model');
      model.placeholder = 'padrão do Claude Code (ex.: sonnet, opus)';
      model.oninput = () => {
        form.model = model.value;
      };

      fields.append(
        field('Nome', name, state.errors.name, 'name'),
        field('Descrição', description, state.errors.description, 'description'),
        field('Instruções (Markdown)', instructions, state.errors.instructions, 'instructions'),
        counter,
        field('Permissão', mode, undefined, 'mode'),
        modeNote,
        field('Modelo (opcional)', model, state.errors.model, 'model'),
      );

      // Appearance with live preview.
      const side = el('div');
      side.className = 'ao-cast-preview';
      const canvas = el('canvas', {}, 'profile-preview');
      const drawPreview = () => {
        const look = explicitAppearance(PREVIEW_ID, form.appearance);
        const drawn = options.drawAvatar?.(look, canvas) ?? false;
        canvas.dataset.drawn = drawn ? 'true' : 'false';
        if (!drawn) drawSwatchPreview(canvas, form.appearance);
      };
      const base = el('select', {}, 'profile-base');
      for (const option of BASE_OPTIONS) {
        base.append(
          el('option', {
            value: option.base,
            textContent: option.label,
            selected: option.base === form.appearance.base,
          }),
        );
      }
      base.onchange = () => {
        form.appearance.base = base.value as ProfileForm['appearance']['base'];
        drawPreview();
      };
      const hair = el('select', {}, 'profile-hair');
      for (let i = 0; i < APPEARANCE_RANGES.hairStyle; i++) {
        hair.append(
          el('option', {
            value: String(i),
            textContent: `Cabelo ${i + 1}`,
            selected: i === form.appearance.hairStyle,
          }),
        );
      }
      hair.onchange = () => {
        form.appearance.hairStyle = Number(hair.value);
        drawPreview();
      };
      const swatches = (
        key: 'skinColor' | 'hairColor' | 'outfitColor',
        colors: readonly string[],
        label: string,
      ) => {
        const wrap = el('div');
        wrap.className = 'ao-cast-swatches';
        wrap.setAttribute('aria-label', label);
        const buttons: HTMLButtonElement[] = [];
        for (const color of colors) {
          const b = el(
            'button',
            { type: 'button', title: `${label} ${color}` },
            `profile-${key}-${color.slice(1)}`,
          );
          b.className = 'ao-cast-swatch';
          b.style.background = color;
          b.setAttribute('aria-pressed', String(form.appearance[key].toLowerCase() === color));
          b.onclick = () => {
            form.appearance[key] = color;
            for (const other of buttons) other.setAttribute('aria-pressed', String(other === b));
            drawPreview();
          };
          buttons.push(b);
          wrap.append(b);
        }
        return wrap;
      };
      const skin = swatches('skinColor', SKIN_COLORS, 'Pele');
      const hairColor = swatches('hairColor', HAIR_COLORS, 'Cabelo');
      const outfit = swatches('outfitColor', OUTFIT_COLORS, 'Roupa');
      const roll = el(
        'button',
        { type: 'button', textContent: 'Sortear aparência' },
        'profile-randomize',
      );
      roll.onclick = () => {
        state.form.appearance = randomAppearance();
        render();
      };
      side.append(
        canvas,
        roll,
        field('Base', base, undefined, 'base'),
        field('Cabelo', hair, undefined, 'hair'),
        document.createTextNode('Pele'),
        skin,
        document.createTextNode('Cor do cabelo'),
        hairColor,
        document.createTextNode('Roupa'),
        outfit,
      );
      grid.append(fields, side);
      box.append(grid);

      if (state.id) {
        box.append(
          el('div', {
            className: 'ao-cast-muted',
            textContent: 'Mudanças valem na próxima vez que o agente iniciar.',
          }),
        );
      }
      if (error)
        box.append(el('div', { className: 'ao-cast-err', textContent: error }, 'cast-error'));

      const actions = el('div');
      actions.className = 'ao-cast-actions';
      const save = el('button', { textContent: 'Salvar', disabled: busy }, 'profile-save');
      save.onclick = () => {
        state.errors = validateForm(form, otherProfileNames(profiles, state.id));
        if (hasErrors(state.errors)) {
          render();
          return;
        }
        const draft = formToDraft(form);
        const id = state.id;
        void (async () => {
          busy = true;
          error = '';
          try {
            if (id) await bridges.profiles.update(id, draft);
            else await bridges.profiles.create(draft);
            profiles = await bridges.profiles.list();
            editor = undefined;
            message = id ? 'Perfil salvo.' : 'Perfil criado. Adicione-o ao elenco do projeto.';
          } catch (e) {
            fail(e);
          } finally {
            busy = false;
            if (alive()) render();
          }
        })();
      };
      const cancel = el('button', { textContent: 'Cancelar' }, 'profile-cancel');
      cancel.onclick = () => {
        editor = undefined;
        error = '';
        render();
      };
      actions.append(save, cancel);
      box.append(actions);
      drawPreview();
    }

    function render(): void {
      if (!alive()) return;
      if (editor) renderEditor(editor);
      else renderCast();
    }

    box.append(el('div', { className: 'ao-cast-muted', textContent: 'Carregando…' }));
    try {
      await loadAll();
    } catch (e) {
      fail(e);
      error = `Falha ao ler o elenco: ${error}`;
    }
    render();
  }

  if (options.button !== false) {
    const button = el('button', { textContent: 'Elenco' }, 'cast-open');
    button.className = 'ao-cast-btn';
    button.title = 'Perfis de agente e elenco do projeto';
    button.onclick = () => void open();
    getCornerBar(gameParent).append(button);
  }

  return { open, close };
}

/** Fallback preview when the game is not available: a plain figure from the chosen colors. */
function drawSwatchPreview(canvas: HTMLCanvasElement, look: ProfileForm['appearance']): void {
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, 64, 64);
  ctx.fillStyle = look.hairColor;
  ctx.fillRect(22, 8, 20, 10);
  ctx.fillStyle = look.skinColor;
  ctx.fillRect(24, 14, 16, 14);
  ctx.fillStyle = look.outfitColor;
  ctx.fillRect(20, 28, 24, 22);
  ctx.fillStyle = '#233a8c';
  ctx.fillRect(22, 50, 20, 10);
}
