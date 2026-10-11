import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createEmptyModel,
  type EventMessage,
  type OfficeEvent,
  type OfficeModel,
  type PermissionSnapshotMessage,
  parseClientMessage,
  parseHookPayload,
  permissionHookOutput,
  type ServerMessage,
  type SnapshotMessage,
} from '@agents-office/shared';
import fastifyWebsocket from '@fastify/websocket';
import Fastify from 'fastify';
import type { ProfessionsConfig } from '../model';
import { DEFAULT_LIVENESS_CONFIG, type LivenessConfig, reduce, tick } from '../model';
import { createNormalizer, type NormalizerInput } from '../normalizer';
import { createTranscriptWatcher } from '../watcher';
import { createPermissionBroker } from './permissionBroker';
import { readStaticFile } from './static';

export const DEFAULT_PORT = 4777;
export const LOOPBACK_HOST = '127.0.0.1';
export const TICK_INTERVAL_MS = 5000;
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set([LOOPBACK_HOST, '::1', 'localhost']);

export const DEFAULT_PROJECTS_DIR = join(homedir(), '.claude', 'projects');
/** `packages/web/dist`, relative to this file (`packages/daemon/src/server`). */
const DEFAULT_WEB_DIST = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'web',
  'dist',
);

export interface Clock {
  /** Epoch milliseconds. */
  now(): number;
}

export interface DaemonOptions {
  /** 0 picks a free port. */
  port: number;
  /** Must be a loopback address unless `unsafeHost` is set. Default 127.0.0.1. */
  host?: string;
  /** Allows binding a non-loopback host (the daemon has no authentication). */
  unsafeHost?: boolean;
  projectsDir: string;
  config?: Partial<LivenessConfig>;
  professions?: ProfessionsConfig;
  clock?: Clock;
  /** Ids of permission requests. Default `crypto.randomUUID`. */
  generateId?: () => string;
  /** Liveness tick period. Default 5 s. */
  tickIntervalMs?: number;
  /** Directory with the built web app. Default `packages/web/dist` (served only if it exists). */
  webDist?: string;
  /** Directory of an external skin, served under `/skin/*` (404 when absent or unset). */
  skinDir?: string;
  usePolling?: boolean;
  version?: string;
  log?: (message: string, error?: unknown) => void;
}

export interface DaemonAddress {
  host: string;
  port: number;
}

export interface Daemon {
  /** Binds the socket, starts the watcher and the liveness timer. Rejects when the port is busy. */
  start(): Promise<DaemonAddress>;
  /** Idempotent. */
  stop(): Promise<void>;
  /** Current model (immutable value; replaced on every event). */
  getModel(): OfficeModel;
  /** Present after `start()`. */
  readonly address: DaemonAddress | undefined;
}

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host);
}

export function createDaemon(options: DaemonOptions): Daemon {
  const host = options.host ?? LOOPBACK_HOST;
  if (!isLoopbackHost(host) && options.unsafeHost !== true) {
    throw new Error(
      `Refusing to bind "${host}": the daemon has no authentication and only listens on loopback. Pass --unsafe-host to override.`,
    );
  }
  const clock: Clock = options.clock ?? { now: () => Date.now() };
  const config: LivenessConfig = { ...DEFAULT_LIVENESS_CONFIG, ...options.config };
  const tickIntervalMs = options.tickIntervalMs ?? TICK_INTERVAL_MS;
  const webDist = options.webDist ?? DEFAULT_WEB_DIST;
  const log =
    options.log ??
    ((message: string, error?: unknown) => {
      if (error === undefined) console.error(`[daemon] ${message}`);
      else console.error(`[daemon] ${message}`, error);
    });

  const normalizer = createNormalizer();
  const reduceOptions = options.professions ? { professions: options.professions } : {};
  const app = Fastify({ logger: false });
  type Client = { send(data: string): void; readyState: number };
  const clients = new Set<Client>();
  /** Sockets that connected as `/stream?role=ui`: the only ones that receive and send permissions. */
  const uiClients = new Set<Client>();
  let model: OfficeModel = createEmptyModel();
  let hooksSeenAt: string | undefined;
  let address: DaemonAddress | undefined;
  let timer: NodeJS.Timeout | undefined;
  let started = false;
  let stopped = false;

  function broadcast(message: EventMessage): void {
    sendTo(clients, message);
  }

  function sendTo(targets: Set<Client>, message: ServerMessage): void {
    const data = JSON.stringify(message);
    for (const client of targets) {
      if (client.readyState !== 1) continue;
      try {
        client.send(data);
      } catch (error) {
        log('failed to send to a client', error);
      }
    }
  }

  function apply(events: OfficeEvent[]): void {
    for (const event of events) {
      model = reduce(model, event, reduceOptions);
      broadcast({ kind: 'event', event });
    }
  }

  function ingest(input: NormalizerInput): void {
    try {
      apply(normalizer.ingest(input));
    } catch (error) {
      log('failed to process an input', error);
    }
  }

  const broker = createPermissionBroker({
    now: () => clock.now(),
    generateId: options.generateId ?? randomUUID,
    hasUi: () => uiClients.size > 0,
    emit: (message) => sendTo(uiClients, message),
    log,
  });

  const watcher = createTranscriptWatcher({
    projectsDir: options.projectsDir,
    initialWindowMs: config.initialWindowMs,
    onInput: ingest,
    log,
    ...(options.usePolling !== undefined ? { usePolling: options.usePolling } : {}),
  });

  app.register(fastifyWebsocket);

  app.register(async (instance) => {
    instance.get('/health', async () => ({
      ok: true,
      version: options.version ?? '0.0.0',
      sessions: Object.keys(model.sessions).length,
      agents: Object.keys(model.agents).length,
      pendingPermissions: broker.pendingCount,
      ...(hooksSeenAt !== undefined ? { hooksSeenAt } : {}),
    }));

    instance.post('/hook', async (request, reply) => {
      const parsed = parseHookPayload(request.body);
      if (!parsed.success)
        return reply.code(400).send({ ok: false, error: 'invalid hook payload' });
      const receivedAt = new Date(clock.now()).toISOString();
      hooksSeenAt = receivedAt;
      const payload = parsed.data;
      // A regular hook can only prove a request was answered in the terminal; it never decides.
      broker.resolveExternally(payload);
      // Answer right away; Claude Code waits on the hook command.
      setImmediate(() => ingest({ kind: 'hook', payload, receivedAt }));
      return reply.code(204).send();
    });

    // Long-poll: the connection is held until the user decides, the request is released or the
    // hook process goes away. No server-side timeout applies.
    instance.post('/hook/permission', async (request, reply) => {
      const parsed = parseHookPayload(request.body);
      if (!parsed.success)
        return reply.code(400).send({ ok: false, error: 'invalid hook payload' });
      request.raw.setTimeout(0);
      request.raw.socket.setTimeout(0);
      const aborter = new AbortController();
      const onClose = () => {
        if (!reply.raw.writableEnded) aborter.abort();
      };
      reply.raw.once('close', onClose);
      const outcome = await broker.request(parsed.data, aborter.signal);
      reply.raw.off('close', onClose);
      if (aborter.signal.aborted) return reply;
      const output = outcome === 'release' ? null : permissionHookOutput(outcome);
      if (output === null) return reply.code(204).send();
      return reply.code(200).send(output);
    });

    instance.get('/stream', { websocket: true }, (socket, request) => {
      const isUi = (request.query as { role?: unknown } | undefined)?.role === 'ui';
      clients.add(socket);
      const dropped = () => {
        clients.delete(socket);
        if (uiClients.delete(socket) && uiClients.size === 0) broker.releaseAll();
      };
      socket.on('close', dropped);
      socket.on('error', dropped);
      const snapshot: SnapshotMessage = { kind: 'snapshot', model };
      socket.send(JSON.stringify(snapshot));
      if (!isUi) return;
      uiClients.add(socket);
      const permissions: PermissionSnapshotMessage = {
        kind: 'permission.snapshot',
        pending: broker.snapshot(),
      };
      socket.send(JSON.stringify(permissions));
      socket.on('message', (data: Buffer) => {
        let decoded: unknown;
        try {
          decoded = JSON.parse(data.toString());
        } catch {
          return;
        }
        const message = parseClientMessage(decoded);
        if (message.success && message.data.kind === 'permission.decide')
          broker.decide(message.data.id, message.data.decision);
      });
    });

    instance.get('/skin/*', async (request, reply) => {
      if (options.skinDir === undefined || !existsSync(options.skinDir))
        return reply.code(404).send({ ok: false, error: 'no skin configured' });
      const subPath = request.url.slice('/skin'.length);
      const file = await readStaticFile(options.skinDir, subPath, { spaFallback: false });
      if (!file) return reply.code(404).send({ ok: false, error: 'not found' });
      return reply.type(file.contentType).send(file.body);
    });

    instance.get('/*', async (request, reply) => {
      if (!existsSync(webDist))
        return reply.code(404).send({ ok: false, error: 'web app not built' });
      const file = await readStaticFile(webDist, request.url);
      if (!file) return reply.code(404).send({ ok: false, error: 'not found' });
      return reply.type(file.contentType).send(file.body);
    });
  });

  return {
    get address() {
      return address;
    },
    getModel: () => model,

    async start() {
      if (started) throw new Error('daemon already started');
      started = true;
      await app.listen({ port: options.port, host });
      const bound = app.server.address();
      if (bound === null || typeof bound === 'string')
        throw new Error('no TCP address after listen');
      address = { host: bound.address, port: bound.port };
      await watcher.start();
      timer = setInterval(() => apply(tick(model, clock.now(), config)), tickIntervalMs);
      timer.unref();
      return address;
    },

    async stop() {
      if (stopped) return;
      stopped = true;
      if (timer) clearInterval(timer);
      await watcher.stop();
      uiClients.clear();
      broker.releaseAll();
      for (const client of app.websocketServer?.clients ?? []) client.terminate();
      clients.clear();
      if (started) await app.close();
    },
  };
}
