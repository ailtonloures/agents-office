import type {
  CatalogProject,
  ProjectSessionInfo,
  TerminalPermissionMode,
} from '@agents-office/shared';
import { BUTTON_CSS } from './buttonStyles';
import { openInVSCodeWithToast } from './externalOpen';
import {
  buildStartOptions,
  canStart,
  DEFAULT_PERMISSION_MODE,
  filterProjects,
  formatWhen,
  LAUNCH_LABELS,
  type LaunchChoice,
  PERMISSION_MODES,
  type PickerBridges,
  permissionModeInfo,
  startErrorMessage,
  TRUST_FOLDER_NOTE,
} from './projectPicker';

const CSS = `
.ao-picker-btn{position:absolute;left:72px;bottom:8px;z-index:20;padding:4px 8px}
.ao-picker{position:fixed;inset:0;z-index:30;background:rgba(5,6,12,.8);display:flex;
  align-items:center;justify-content:center;font:13px monospace;color:#f0e6b8}
.ao-picker-box{background:#1b1d2a;border:3px solid #f0c040;width:min(760px,94vw);
  max-height:90vh;overflow-x:hidden;overflow-y:auto;box-sizing:border-box;padding:20px 24px;
  display:flex;flex-direction:column;gap:12px}
.ao-picker-box>*{min-width:0;max-width:100%}
.ao-picker-details{display:flex;flex-direction:column;gap:12px}
.ao-picker-details>*{min-width:0;max-width:100%}
.ao-picker-cwd{overflow-wrap:anywhere;color:#8a8fa8}
.ao-picker-box h2{margin:0;font-size:16px}
.ao-picker-box input[type=search],.ao-picker-box select{font:13px monospace;background:#0d1020;
  color:#f0e6b8;border:2px solid #4a4f70;padding:4px 6px}
.ao-picker-box button{padding:4px 10px}
.ao-picker-list{list-style:none;margin:0;padding:0;max-height:34vh;overflow:auto;background:#0d1020}
.ao-picker-row{display:flex;gap:12px;align-items:center;padding:8px 10px;cursor:pointer}
.ao-picker-row[aria-selected=true]{background:#2a2d44;outline:2px solid #f0c040}
.ao-picker-row .star{background:none;border:0;padding:0 4px;font-size:14px;color:#8a8fa8}
.ao-picker-row .star[aria-pressed=true]{color:#f0c040}
.ao-picker-row .name{font-weight:bold}.ao-picker-row .path{color:#8a8fa8;flex:1;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap}.ao-picker-row .when{color:#8a8fa8}
.ao-picker-opts{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}
.ao-picker-opts>*{min-width:0}
.ao-picker-opts label{display:flex;gap:6px;align-items:center;padding:8px 10px;background:#0d1020;
  border:2px solid transparent}
.ao-picker-opts label:has(input:checked){border-color:#f0c040}
.ao-picker-opts select{flex:1;width:100%;min-width:0;max-width:100%;text-overflow:ellipsis}
.ao-picker-mode{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px;align-items:center}
.ao-picker-mode select{width:100%;min-width:0}
.ao-picker-note,.ao-picker-warn,.ao-picker-err{line-height:1.5;overflow-wrap:anywhere}
.ao-picker-note{color:#9ad1ff}.ao-picker-warn{color:#f0c040}.ao-picker-err{color:#ff7b7b}
.ao-picker-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:4px}
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
    /** Entry point for other screens (the interaction point in the room, spec 023) and E2E. */
    __projectPicker?: ProjectPickerHandle;
  }
}

export interface ProjectPickerHandle {
  open(preselectCwd?: string): Promise<void>;
  close(): void;
}

export interface ProjectPickerOptions {
  /** cwds of the rooms the office shows now (merged into the catalog). */
  knownCwds?: () => string[];
  /** The picker takes the keyboard while open (Phaser must not read keys). */
  onKeyboardCapture?: (captured: boolean) => void;
  /** Whether the "Sessões" button is added (the interaction point in the room brings its own). */
  button?: boolean;
}

/**
 * Mounts the "Iniciar sessão" screen. The "Sessões" button lives inside `gameParent` (the office
 * area); the modal stays on `document.body`. Call only when both bridges exist.
 */
export function mountProjectPicker(
  bridges: PickerBridges,
  gameParent: HTMLElement,
  options: ProjectPickerOptions = {},
): ProjectPickerHandle {
  document.head.append(el('style', { textContent: CSS }));
  let overlay: HTMLElement | undefined;

  const close = (): void => {
    if (!overlay) return;
    overlay.remove();
    overlay = undefined;
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
    const root = el('div', {}, 'project-picker');
    root.className = 'ao-picker';
    const box = el('div');
    box.className = 'ao-picker-box';
    root.append(box);
    root.addEventListener('mousedown', (event) => {
      if (event.target === root) close();
    });
    document.body.append(root);
    document.addEventListener('keydown', onEscape, true);
    options.onKeyboardCapture?.(true);
    overlay = root;

    let projects: CatalogProject[] = [];
    let selected: string | undefined = preselectCwd;
    let sessions: ProjectSessionInfo[] = [];
    let choice: LaunchChoice['kind'] = 'new';
    let resumeId = '';
    let mode: TerminalPermissionMode = DEFAULT_PERMISSION_MODE;
    let query = '';
    let error = '';
    let busy = false;

    const search = el(
      'input',
      { type: 'search', placeholder: 'Buscar projeto...' },
      'picker-search',
    );
    search.setAttribute('aria-label', 'Buscar projeto');
    const list = el('ul', {}, 'picker-list');
    list.className = 'ao-picker-list';
    list.setAttribute('role', 'listbox');
    const details = el('div');
    details.className = 'ao-picker-details';
    box.append(el('h2', { textContent: 'Iniciar sessão do Claude Code' }), search, list, details);

    const visible = (): CatalogProject[] => filterProjects(projects, query);
    const current = (): CatalogProject | undefined => projects.find((p) => p.cwd === selected);

    const loadSessions = async (): Promise<void> => {
      sessions = [];
      const project = current();
      if (project) {
        try {
          sessions = await bridges.projects.sessions(project.cwd);
        } catch {
          sessions = [];
        }
      }
      choice = 'new';
      resumeId = sessions[0]?.id ?? '';
      renderDetails();
    };

    const select = (cwd: string | undefined): void => {
      if (cwd === selected) return;
      selected = cwd;
      error = '';
      renderList();
      void loadSessions();
    };

    const renderList = (): void => {
      const rows = visible();
      list.replaceChildren(
        ...rows.map((project) => {
          const row = el('li', {}, `picker-row-${project.name}`);
          row.className = 'ao-picker-row';
          row.setAttribute('role', 'option');
          row.setAttribute('aria-selected', String(project.cwd === selected));
          const star = el('button', { textContent: project.favorite ? '★' : '☆' }, 'picker-star');
          star.className = 'star';
          star.title = project.favorite ? 'Remover dos favoritos' : 'Favoritar';
          star.setAttribute('aria-pressed', String(project.favorite));
          star.onclick = (event) => {
            event.stopPropagation();
            void bridges.projects.setFavorite(project.cwd, !project.favorite).then(refresh);
          };
          const when = project.lastUsedAt ?? project.lastActivityAt;
          row.append(
            star,
            el('span', { textContent: project.name, className: 'name' }),
            el('span', { textContent: project.cwd, className: 'path', title: project.cwd }),
            el('span', { textContent: formatWhen(when, new Date()), className: 'when' }),
          );
          row.onclick = () => select(project.cwd);
          row.ondblclick = () => void start();
          return row;
        }),
      );
      if (rows.length === 0) {
        list.append(
          el(
            'li',
            { textContent: projects.length === 0 ? 'Nenhum projeto ainda.' : 'Nada encontrado.' },
            'picker-empty',
          ),
        );
      }
    };

    const renderDetails = (): void => {
      const project = current();
      const pickNew = el('button', { textContent: 'Novo projeto…' }, 'picker-new');
      pickNew.onclick = () => {
        void bridges.projects.pickFolder().then(async (added) => {
          if (!added) return;
          query = '';
          search.value = '';
          selected = added.cwd;
          await refresh();
          await loadSessions();
        });
      };
      const close_ = el('button', { textContent: 'Cancelar' }, 'picker-cancel');
      close_.onclick = close;
      const startButton = el('button', { textContent: 'Iniciar sessão' }, 'picker-start');
      startButton.disabled = !project || busy || !canStart(launchChoice());
      startButton.onclick = () => void start();
      const actions = el('div');
      actions.className = 'ao-picker-actions';
      actions.append(startButton, pickNew);
      const external = bridges.external;
      if (external) {
        const vscode = el('button', { textContent: 'Abrir no VS Code' }, 'picker-vscode');
        vscode.disabled = !project;
        vscode.onclick = () => {
          if (project) void openInVSCodeWithToast(external, project.cwd);
        };
        actions.append(vscode);
      }
      actions.append(close_);

      const opts = el('div', {}, 'picker-options');
      opts.className = 'ao-picker-opts';
      const radio = (kind: LaunchChoice['kind'], disabled: boolean): HTMLLabelElement => {
        const label = el('label');
        const input = el(
          'input',
          { type: 'radio', name: 'launch', checked: choice === kind },
          `picker-launch-${kind}`,
        );
        input.disabled = disabled || !project;
        input.onchange = () => {
          choice = kind;
          renderDetails();
        };
        label.append(input, el('span', { textContent: LAUNCH_LABELS[kind] }));
        return label;
      };
      const none = sessions.length === 0;
      const resumeLabel = radio('resume', none);
      const resumeSelect = el('select', {}, 'picker-resume-select');
      resumeSelect.disabled = none || choice !== 'resume';
      for (const session of sessions) {
        const text = `${formatWhen(session.modifiedAt, new Date())} · ${session.summary ?? session.id}`;
        resumeSelect.append(new Option(text, session.id, false, session.id === resumeId));
      }
      resumeSelect.onchange = () => {
        resumeId = resumeSelect.value;
      };
      resumeLabel.append(resumeSelect);
      opts.append(radio('new', false), radio('continue', none), resumeLabel);
      if (project && none) {
        opts.append(
          el('span', {
            textContent: 'Sem sessões anteriores neste projeto.',
            className: 'ao-picker-note',
          }),
        );
      }

      const modeSelect = el('select', {}, 'picker-mode');
      for (const info of PERMISSION_MODES) {
        const tag =
          info.cards === 'yes'
            ? 'com cartões'
            : info.cards === 'partial'
              ? 'cartões parciais'
              : 'sem cartões';
        modeSelect.append(
          new Option(`${info.label} (${tag})`, info.mode, false, info.mode === mode),
        );
      }
      modeSelect.onchange = () => {
        mode = modeSelect.value as TerminalPermissionMode;
        renderDetails();
      };
      const info = permissionModeInfo(mode);
      const modeLabel = el('label');
      modeLabel.className = 'ao-picker-mode';
      modeLabel.append(el('span', { textContent: 'Modo de permissão: ' }), modeSelect);

      details.replaceChildren(
        el(
          'div',
          {
            textContent: project ? project.cwd : 'Escolha um projeto.',
            className: 'ao-picker-cwd',
          },
          'picker-selected',
        ),
        opts,
        modeLabel,
        el(
          'div',
          {
            textContent: info.note,
            className: info.cards === 'yes' ? 'ao-picker-note' : 'ao-picker-warn',
          },
          'picker-mode-note',
        ),
        el(
          'div',
          { textContent: TRUST_FOLDER_NOTE, className: 'ao-picker-note' },
          'picker-trust-note',
        ),
        el('div', { textContent: error, className: 'ao-picker-err' }, 'picker-error'),
        actions,
      );
    };

    const launchChoice = (): LaunchChoice =>
      choice === 'resume' ? { kind: 'resume', sessionId: resumeId } : { kind: choice };

    async function start(): Promise<void> {
      const project = current();
      if (!project || busy || !canStart(launchChoice())) return;
      busy = true;
      error = '';
      renderDetails();
      try {
        const result = await bridges.terminal.start(
          buildStartOptions(project.cwd, launchChoice(), mode),
        );
        if (!result.ok) {
          error = startErrorMessage(result);
          return;
        }
        void bridges.projects.markUsed(project.cwd);
        close();
      } catch (e) {
        error = `Não foi possível iniciar: ${(e as Error).message}`;
      } finally {
        busy = false;
        if (overlay === root) renderDetails();
      }
    }

    async function refresh(): Promise<void> {
      projects = await bridges.projects.list(options.knownCwds?.() ?? []);
      renderList();
      renderDetails();
    }

    search.oninput = () => {
      query = search.value;
      const rows = visible();
      if (!rows.some((p) => p.cwd === selected)) select(rows[0]?.cwd);
      else renderList();
    };
    search.onkeydown = (event) => {
      const rows = visible();
      const index = rows.findIndex((p) => p.cwd === selected);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const next =
          rows[
            Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))
          ];
        select(next?.cwd);
        list.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' });
      } else if (event.key === 'Enter') {
        event.preventDefault();
        void start();
      }
    };

    renderDetails();
    try {
      await refresh();
    } catch (e) {
      list.replaceChildren(
        el('li', { textContent: `Falha ao ler os projetos: ${(e as Error).message}` }),
      );
      return;
    }
    if (!current()) selected = projects[0]?.cwd;
    renderList();
    await loadSessions();
    search.focus();
  }

  if (options.button !== false) {
    const button = el('button', { textContent: 'Sessões' }, 'picker-open');
    button.className = 'ao-picker-btn';
    button.title = 'Iniciar uma sessão do Claude Code em um projeto';
    button.onclick = () => void open();
    gameParent.append(button);
  }

  return { open, close };
}
