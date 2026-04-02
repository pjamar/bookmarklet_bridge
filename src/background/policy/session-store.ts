interface ExecutionSession {
  tabId: number;
  executionId: string;
  definitionHash: string;
  bookmarkletName?: string;
  bookmarkletVersion?: number;
}

const executionSessions = new Map<string, ExecutionSession>();

function buildKey(tabId: number, executionId: string): string {
  return `${tabId}:${executionId}`;
}

export function hasExecutionSession(tabId: number | undefined, executionId: string): boolean {
  if (tabId === undefined) {
    return false;
  }
  return executionSessions.has(buildKey(tabId, executionId));
}

export function registerExecutionSession(
  tabId: number | undefined,
  executionId: string,
  definitionHash: string,
  bookmarkletName?: string,
  bookmarkletVersion?: number
): void {
  if (tabId === undefined) {
    return;
  }
  executionSessions.set(buildKey(tabId, executionId), {
    tabId,
    executionId,
    definitionHash,
    bookmarkletName,
    bookmarkletVersion
  });
}

export function revokeExecutionSession(tabId: number | undefined, executionId: string): void {
  if (tabId === undefined) {
    return;
  }
  executionSessions.delete(buildKey(tabId, executionId));
}

export function getExecutionSession(tabId: number | undefined, executionId: string): ExecutionSession | undefined {
  if (tabId === undefined) {
    return undefined;
  }
  return executionSessions.get(buildKey(tabId, executionId));
}
