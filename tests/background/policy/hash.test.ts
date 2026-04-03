import { describe, expect, test } from "vitest";
import { buildIdentity } from "../../../src/background/policy/hash";

describe("buildIdentity", () => {
  test("produces stable hashes for equivalent bookmarklet definitions", async () => {
    const first = await buildIdentity({
      name: "Example",
      version: 2,
      source: "async function run(bridge) { await bridge.get('https://example.com'); }",
      settings: {
        includeSelection: {
          type: "boolean",
          label: "Include selected text",
          description: "Append the current selection to the request.",
          default: true
        }
      }
    });

    const second = await buildIdentity({
      settings: {
        includeSelection: {
          description: "Append the current selection to the request.",
          default: true,
          label: "Include selected text",
          type: "boolean"
        }
      },
      source: "async function run(bridge) { await bridge.get('https://example.com'); }",
      version: 2,
      name: "Example"
    });

    expect(first.canonicalBookmarklet).toBe(second.canonicalBookmarklet);
    expect(first.definitionHash).toBe(second.definitionHash);
    expect(first.sourceHash).toBe(second.sourceHash);
  });

  test("changes definition hash when declared settings change", async () => {
    const first = await buildIdentity({
      name: "Example",
      version: 2,
      source: "async function run(bridge) { await bridge.getSettings(); }",
      settings: {
        timeoutSeconds: {
          type: "integer",
          label: "Timeout",
          description: "Maximum wait time.",
          default: 10
        }
      }
    });

    const second = await buildIdentity({
      name: "Example",
      version: 2,
      source: "async function run(bridge) { await bridge.getSettings(); }",
      settings: {
        timeoutSeconds: {
          type: "integer",
          label: "Timeout",
          description: "Maximum wait time.",
          default: 15
        }
      }
    });

    expect(first.definitionHash).not.toBe(second.definitionHash);
    expect(first.sourceHash).toBe(second.sourceHash);
  });

  test("infers each bridge action exactly once", async () => {
    const identity = await buildIdentity({
      name: "Action inference",
      version: 1,
      source: `
        async function run(bridge) {
          await bridge.post("https://example.com/post", { ok: true });
          await bridge.get("https://example.com/get");
          await bridge.toast("Done");
          await bridge.download({ filename: "notes.md", content: "ok" });
          await bridge.downloadUrl({ url: "https://example.com/files/report.pdf" });
          await bridge.copyText("Copied");
          await bridge.get("https://example.com/again");
        }
      `
    });

    expect(identity.inferredActions).toEqual(["post", "get", "toast", "download", "downloadUrl", "copyText"]);
  });

  test("does not infer actions from similarly named identifiers", async () => {
    const identity = await buildIdentity({
      name: "No false positives",
      version: 1,
      source: `
        async function run(bridge) {
          const helper = {
            bridgeGet() {},
            toastify() {}
          };
          return helper;
        }
      `
    });

    expect(identity.inferredActions).toEqual([]);
  });
});
