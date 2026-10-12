import type { SpawnApprovalBridge, SpawnApprovalRequest } from '@agents-office/shared';
import { PROFESSION_LABEL } from './dialogContent';
import { buildResponse, dequeue, enqueue, instructionsValid } from './spawnApprovalLogic';

const CSS = `
.ao-spawn-card{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:30;
  font:13px monospace;background:#1b1d2a;color:#f0e6b8;border:2px solid #f0c040;padding:12px;
  width:min(520px,calc(100% - 16px));max-height:calc(100% - 16px);overflow:auto;
  box-sizing:border-box;display:flex;flex-direction:column;gap:8px;box-shadow:0 6px 0 #000a}
.ao-spawn-card[hidden]{display:none}
.ao-spawn-card h3{margin:0;font-size:14px}
.ao-spawn-card textarea{font:12px monospace;background:#12131c;color:#f0e6b8;border:2px solid #4a4f78;
  min-height:140px;resize:vertical;padding:6px}
.ao-spawn-card .task{white-space:pre-wrap;opacity:.8}
.ao-spawn-card .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.ao-spawn-card button{font:12px monospace;background:#2a2d44;color:#f0e6b8;border:2px solid #f0c040;
  padding:4px 10px;cursor:pointer;box-shadow:0 3px 0 #000a}
.ao-spawn-card button:disabled{opacity:.45;cursor:default}
.ao-spawn-card button.deny{border-color:#e07070}
`;

/**
 * Mounts the creation-approval card inside `gameParent`: one card at a time (queue), showing the
 * name, the look (profession) and editable instructions. Returns the cleanup.
 */
export function mountSpawnApprovalCard(
  bridge: SpawnApprovalBridge,
  gameParent: HTMLElement,
): () => void {
  const style = Object.assign(document.createElement('style'), { textContent: CSS });
  document.head.append(style);

  const card = document.createElement('div');
  card.className = 'ao-spawn-card';
  card.setAttribute('data-testid', 'spawn-approval');
  card.hidden = true;
  const stopKeys = (event: KeyboardEvent): void => event.stopPropagation();
  card.addEventListener('keydown', stopKeys);
  card.addEventListener('keyup', stopKeys);
  gameParent.append(card);

  let queue: SpawnApprovalRequest[] = [];
  let shownId: string | null = null;
  let disposed = false;

  const field = (testid: string, tag = 'div'): HTMLElement => {
    const node = document.createElement(tag);
    node.setAttribute('data-testid', testid);
    return node;
  };

  const render = (): void => {
    const request = queue[0];
    if (!request) {
      shownId = null;
      card.hidden = true;
      card.replaceChildren();
      return;
    }
    if (shownId === request.id) return; // keep the user's edits while others queue up
    shownId = request.id;
    card.hidden = false;

    const title = field('spawn-title', 'h3');
    title.textContent = `${request.orchestratorName} quer criar um agente${
      queue.length > 1 ? ` (+${queue.length - 1} na fila)` : ''
    }`;
    const name = field('spawn-name');
    name.textContent = `Nome: ${request.name}`;
    const look = field('spawn-profession');
    look.textContent = `Aparência: ${PROFESSION_LABEL[request.profession]}`;
    const instructions = field('spawn-instructions', 'textarea') as HTMLTextAreaElement;
    instructions.value = request.instructions;
    instructions.setAttribute('aria-label', 'Instruções do novo agente');
    const children: HTMLElement[] = [title, name, look, instructions];
    if (request.task) {
      const task = field('spawn-task');
      task.className = 'task';
      task.textContent = `Tarefa inicial: ${request.task}`;
      children.push(task);
    }
    const always = field('spawn-always', 'input') as HTMLInputElement;
    always.type = 'checkbox';
    const label = document.createElement('label');
    label.className = 'row';
    label.append(
      always,
      document.createTextNode(
        `Permitir sem perguntar para ${request.orchestratorName} neste projeto`,
      ),
    );
    const approve = field('spawn-approve', 'button') as HTMLButtonElement;
    approve.textContent = 'Aprovar';
    const deny = field('spawn-deny', 'button') as HTMLButtonElement;
    deny.textContent = 'Negar';
    deny.className = 'deny';
    const buttons = document.createElement('div');
    buttons.className = 'row';
    buttons.append(approve, deny);
    children.push(label, buttons);

    const sync = (): void => {
      approve.disabled = !instructionsValid(instructions.value);
    };
    instructions.addEventListener('input', sync);
    sync();

    const answer = (approved: boolean): void => {
      approve.disabled = true;
      deny.disabled = true;
      const response = buildResponse(request, {
        approved,
        instructions: instructions.value,
        allowAlways: always.checked,
      });
      bridge
        .respond(response)
        .catch(() => false)
        .then(() => {
          if (disposed) return;
          queue = dequeue(queue, request.id);
          render();
        });
    };
    approve.onclick = () => answer(true);
    deny.onclick = () => answer(false);
    card.replaceChildren(...children);
  };

  const add = (request: SpawnApprovalRequest): void => {
    if (disposed) return;
    queue = enqueue(queue, request);
    render();
  };

  const unsubscribeRequest = bridge.onRequest(add);
  const unsubscribeResolved = bridge.onResolved((id) => {
    if (disposed) return;
    queue = dequeue(queue, id);
    if (shownId === id) shownId = null;
    render();
  });
  void bridge
    .pending()
    .then((requests) => {
      for (const request of requests) add(request);
    })
    .catch(() => {
      // No pending list: pushes still arrive.
    });

  return () => {
    disposed = true;
    unsubscribeRequest();
    unsubscribeResolved();
    card.remove();
    style.remove();
  };
}
