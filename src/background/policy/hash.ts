import { canonicalizeRecord } from "../../shared/canonicalize";
import { sha256 } from "../../shared/encoding";
import type { BookmarkletRegistration, BridgeAction } from "../../shared/types";

function inferActions(source: string): BridgeAction[] {
  const inferred: BridgeAction[] = [];
  for (const action of ["post", "get", "toast", "download", "copyText"] as const) {
    const pattern = new RegExp(`\\bbridge\\.${action}\\b`);
    if (pattern.test(source)) {
      inferred.push(action);
    }
  }
  return inferred;
}

export async function buildIdentity(bookmarklet: BookmarkletRegistration) {
  const canonicalBookmarklet = canonicalizeRecord({
    name: bookmarklet.name,
    version: bookmarklet.version,
    source: bookmarklet.source
  });
  const definitionHash = await sha256(canonicalBookmarklet);
  const decodedSource = bookmarklet.source;
  const sourceHash = await sha256(decodedSource);
  const inferredActions = inferActions(decodedSource);
  return {
    canonicalBookmarklet,
    definitionHash,
    decodedSource,
    sourceHash,
    inferredActions
  };
}
