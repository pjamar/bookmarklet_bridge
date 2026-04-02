import { EXECUTION_SESSIONS_STORAGE_KEY } from "../../shared/constants";

interface ExecutionSession {
  tabId: number;
  executionId: string;
  definitionHash: string;
  bookmarkletName?: string;
  bookmarkletVersion?: number;
}

const executionSessions = new Map<string, ExecutionSession>();
let hydrated = false;
let hydratePromise: Promise<void> | undefined;
let persistQueue = Promise.resolve();

function buildKey(tabId: number, executionId: string): string {
  return `${tabId}:${executionId}`;
}

function isExecutionSession(value: unknown): value is ExecutionSession {
  if (!value || typeof value !== "object") {
    return false;
  }
  const session = value as Partial<ExecutionSession>;
  return (
    typeof session.tabId === "number" &&
    typeof session.executionId === "string" &&
    typeof session.definitionHash === "string" &&
    (session.bookmarkletName === undefined || typeof session.bookmarkletName === "string") &&
    (session.bookmarkletVersion === undefined || typeof session.bookmarkletVersion === "number")
  );
}

async function ensureHydrated(): Promise<void> {
  if (hydrated) {
    return;
  }
  if (!hydratePromise) {
    hydratePromise = (async () => {
      const result = await browser.storage.local.get(EXECUTION_SESSIONS_STORAGE_KEY);
      const stored = result[EXECUTION_SESSIONS_STORAGE_KEY];
      if (stored && typeof stored === "object") {
        for (const [key, value] of Object.entries(stored)) {
          if (isExecutionSession(value)) {
            executionSessions.set(key, value);
          }
        }
      }
      hydrated = true;
    })();
  }
  await hydratePromise;
}

function queuePersist(): Promise<void> {
  persistQueue = persistQueue
    .catch(() => undefined)
    .then(() =>
      browser.storage.local.set({
        [EXECUTION_SESSIONS_STORAGE_KEY]: Object.fromEntries(executionSessions.entries())
      })
    );
  return persistQueue;
}

export async function hasExecutionSession(tabId: number | undefined, executionId: string): Promise<boolean> {
  if (tabId === undefined) {
    return false;
  }
  await ensureHydrated();
  return executionSessions.has(buildKey(tabId, executionId));
}

export async function registerExecutionSession(
  tabId: number | undefined,
  executionId: string,
  definitionHash: string,
  bookmarkletName?: string,
  bookmarkletVersion?: number
): Promise<void> {
  if (tabId === undefined) {
    return;
  }
  await ensureHydrated();
  executionSessions.set(buildKey(tabId, executionId), {
    tabId,
    executionId,
    definitionHash,
    bookmarkletName,
    bookmarkletVersion
  });
  await queuePersist();
}

export async function revokeExecutionSession(tabId: number | undefined, executionId: string): Promise<void> {
  if (tabId === undefined) {
    return;
  }
  await ensureHydrated();
  executionSessions.delete(buildKey(tabId, executionId));
  await queuePersist();
}

export async function getExecutionSession(
  tabId: number | undefined,
  executionId: string
): Promise<ExecutionSession | undefined> {
  if (tabId === undefined) {
    return undefined;
  }
  await ensureHydrated();
  return executionSessions.get(buildKey(tabId, executionId));
}

export async function clearExecutionSessionsForTab(tabId: number): Promise<void> {
  await ensureHydrated();
  let changed = false;
  for (const [key, session] of executionSessions.entries()) {
    if (session.tabId === tabId) {
      executionSessions.delete(key);
      changed = true;
    }
  }
  if (changed) {
    await queuePersist();
  }
}
