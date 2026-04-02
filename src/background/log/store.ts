import {
  LOG_RETENTION_DAYS,
  LOG_STORAGE_KEY,
  MAX_LOG_ENTRIES
} from "../../shared/constants";
import type { ExecutionLogEntry } from "../../shared/types";

const RETENTION_MS = LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;

async function getLogEntriesRaw(): Promise<ExecutionLogEntry[]> {
  const result = await browser.storage.local.get(LOG_STORAGE_KEY);
  return (result[LOG_STORAGE_KEY] as ExecutionLogEntry[] | undefined) ?? [];
}

function prune(entries: ExecutionLogEntry[]): ExecutionLogEntry[] {
  const cutoff = Date.now() - RETENTION_MS;
  return entries
    .filter((entry) => {
      const time = Date.parse(entry.timestamp);
      return Number.isFinite(time) && time >= cutoff;
    })
    .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))
    .slice(0, MAX_LOG_ENTRIES);
}

async function save(entries: ExecutionLogEntry[]): Promise<void> {
  await browser.storage.local.set({ [LOG_STORAGE_KEY]: entries });
}

export async function listLogs(): Promise<ExecutionLogEntry[]> {
  const pruned = prune(await getLogEntriesRaw());
  await save(pruned);
  return pruned;
}

export async function appendLog(entry: ExecutionLogEntry): Promise<void> {
  const entries = await getLogEntriesRaw();
  const pruned = prune([entry, ...entries]);
  await save(pruned);
}

export async function clearLogs(): Promise<void> {
  await save([]);
}
