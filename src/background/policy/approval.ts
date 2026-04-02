import { BridgeError } from "../../shared/errors";
import type {
  ApprovalContext,
  BookmarkletRegistration,
  MessageSenderContext,
  PolicyEntry
} from "../../shared/types";
import { getPolicy, touchPolicy, upsertPolicy } from "./store";
import { registerExecutionSession, revokeExecutionSession } from "./session-store";

export async function getApprovalRequirement(identity: ApprovalContext): Promise<"allow" | "deny" | "prompt"> {
  const policy = await getPolicy(identity.definitionHash);
  if (!policy) {
    return "prompt";
  }
  if (policy.decision === "allow") {
    await touchPolicy(identity.definitionHash);
    return "allow";
  }
  return "deny";
}

export async function applyApprovalDecision(
  decision: "allow" | "deny",
  bookmarklet: BookmarkletRegistration,
  identity: ApprovalContext,
  sender: MessageSenderContext
): Promise<"allow" | "deny"> {
  const now = new Date().toISOString();
  const policyEntry: PolicyEntry = {
    definitionHash: identity.definitionHash,
    sourceHash: identity.sourceHash,
    canonicalBookmarklet: identity.canonicalBookmarklet,
    name: bookmarklet.name,
    version: bookmarklet.version,
    decision,
    inferredActions: identity.inferredActions,
    decodedSource: identity.decodedSource,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: decision === "allow" ? now : undefined
  };

  const existing = await getPolicy(identity.definitionHash);
  await upsertPolicy(
    existing
      ? {
          ...existing,
          ...policyEntry,
          createdAt: existing.createdAt,
          updatedAt: now
        }
      : policyEntry
  );

  if (decision === "allow") {
    registerExecutionSession(sender.tabId, identity.executionId, identity.definitionHash);
  } else {
    revokeExecutionSession(sender.tabId, identity.executionId);
  }
  return decision;
}

export function registerApprovedExecution(
  identity: ApprovalContext,
  sender: MessageSenderContext,
  bookmarklet?: BookmarkletRegistration
): void {
  registerExecutionSession(
    sender.tabId,
    identity.executionId,
    identity.definitionHash,
    bookmarklet?.name,
    bookmarklet?.version
  );
}

export function ensureAllowed(decision: "allow" | "deny"): void {
  if (decision === "deny") {
    throw new BridgeError("denied", "Bookmarklet was denied.");
  }
}
