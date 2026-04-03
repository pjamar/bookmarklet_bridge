import { BridgeError } from "./errors";
import { parseBookmarkletSettingsSchema, normalizeBookmarkletSettingsValues } from "./bookmarklet-settings";
import type {
  BridgeConfigurationExport,
  BridgeState,
  BookmarkletSettingsSchemaMap,
  BookmarkletSettingsValueMap,
  EncryptedBridgeConfigurationExport,
  PolicyEntry
} from "./types";

const PBKDF2_ITERATIONS = 250_000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new BridgeError("invalid_request", `${field} must be a non-empty string.`);
  }
  return value;
}

function requireFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new BridgeError("invalid_request", `${field} must be a finite number.`);
  }
  return value;
}

function toBase64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(value: string, field: string): Uint8Array {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    throw new BridgeError("invalid_request", `${field} must be valid base64.`);
  }
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: PBKDF2_ITERATIONS
    },
    material,
    {
      name: "AES-GCM",
      length: 256
    },
    false,
    ["encrypt", "decrypt"]
  );
}

export function buildConfigurationExport(state: BridgeState): BridgeConfigurationExport {
  const approvedPolicies = state.policies.filter((policy) => policy.decision === "allow");
  const allowedHashes = new Set(approvedPolicies.map((policy) => policy.definitionHash));
  const bookmarkletSettingsSchemas: BookmarkletSettingsSchemaMap = {};
  const bookmarkletSettingsValues: BookmarkletSettingsValueMap = {};

  for (const [definitionHash, schema] of Object.entries(state.bookmarkletSettingsSchemas)) {
    if (allowedHashes.has(definitionHash)) {
      bookmarkletSettingsSchemas[definitionHash] = schema;
    }
  }

  for (const [definitionHash, values] of Object.entries(state.bookmarkletSettingsValues)) {
    if (allowedHashes.has(definitionHash)) {
      bookmarkletSettingsValues[definitionHash] = values;
    }
  }

  return {
    format: "bookmarklet-bridge-config",
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    approvedPolicies,
    bookmarkletSettingsSchemas,
    bookmarkletSettingsValues
  };
}

export async function encryptConfigurationExport(
  payload: BridgeConfigurationExport,
  passphrase: string
): Promise<EncryptedBridgeConfigurationExport> {
  if (!passphrase.trim()) {
    throw new BridgeError("invalid_request", "Encryption key must not be empty.");
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);

  return {
    format: "bookmarklet-bridge-encrypted-config",
    version: 1,
    app: "Bookmarklet Bridge",
    exportedAt: payload.exportedAt,
    scope: "approved-policies-and-settings",
    kdf: "PBKDF2",
    cipher: "AES-GCM",
    iterations: PBKDF2_ITERATIONS,
    saltBase64: toBase64(salt),
    ivBase64: toBase64(iv),
    ciphertextBase64: toBase64(new Uint8Array(ciphertext))
  };
}

function parsePolicyEntry(value: unknown, field: string): PolicyEntry {
  if (!isPlainObject(value)) {
    throw new BridgeError("invalid_request", `${field} must be an object.`);
  }
  return {
    definitionHash: requireString(value.definitionHash, `${field}.definitionHash`),
    sourceHash: requireString(value.sourceHash, `${field}.sourceHash`),
    canonicalBookmarklet: requireString(value.canonicalBookmarklet, `${field}.canonicalBookmarklet`),
    name: requireString(value.name, `${field}.name`),
    version: requireFiniteNumber(value.version, `${field}.version`),
    extendedDescription:
      value.extendedDescription === undefined ? undefined : requireString(value.extendedDescription, `${field}.extendedDescription`),
    decision: value.decision === "allow" ? "allow" : value.decision === "deny" ? "deny" : (() => {
      throw new BridgeError("invalid_request", `${field}.decision must be allow or deny.`);
    })(),
    inferredActions: Array.isArray(value.inferredActions)
      ? value.inferredActions.map((entry, index) => requireString(entry, `${field}.inferredActions[${index}]`))
      : (() => {
          throw new BridgeError("invalid_request", `${field}.inferredActions must be an array.`);
        })(),
    decodedSource: requireString(value.decodedSource, `${field}.decodedSource`),
    createdAt: requireString(value.createdAt, `${field}.createdAt`),
    updatedAt: requireString(value.updatedAt, `${field}.updatedAt`),
    lastUsedAt: value.lastUsedAt === undefined ? undefined : requireString(value.lastUsedAt, `${field}.lastUsedAt`)
  };
}

export function parseConfigurationExport(value: unknown): BridgeConfigurationExport {
  if (!isPlainObject(value)) {
    throw new BridgeError("invalid_request", "Backup payload must be an object.");
  }
  if (value.format !== "bookmarklet-bridge-config" || value.version !== 1) {
    throw new BridgeError("invalid_request", "Unsupported backup payload format.");
  }
  if (!Array.isArray(value.approvedPolicies)) {
    throw new BridgeError("invalid_request", "approvedPolicies must be an array.");
  }

  const approvedPolicies = value.approvedPolicies.map((policy, index) =>
    parsePolicyEntry(policy, `approvedPolicies[${index}]`)
  );
  for (const policy of approvedPolicies) {
    if (policy.decision !== "allow") {
      throw new BridgeError("invalid_request", "Backups may only contain approved policies.");
    }
  }

  const schemasInput = value.bookmarkletSettingsSchemas;
  const valuesInput = value.bookmarkletSettingsValues;
  if (!isPlainObject(schemasInput) || !isPlainObject(valuesInput)) {
    throw new BridgeError("invalid_request", "bookmarklet settings maps must be objects.");
  }

  const bookmarkletSettingsSchemas: BookmarkletSettingsSchemaMap = {};
  const bookmarkletSettingsValues: BookmarkletSettingsValueMap = {};
  for (const policy of approvedPolicies) {
    const rawSchema = schemasInput[policy.definitionHash];
    const schema = parseBookmarkletSettingsSchema(rawSchema ?? {});
    if (schema && Object.keys(schema).length > 0) {
      bookmarkletSettingsSchemas[policy.definitionHash] = schema;
      const rawValues = valuesInput[policy.definitionHash];
      bookmarkletSettingsValues[policy.definitionHash] = normalizeBookmarkletSettingsValues(
        schema,
        isPlainObject(rawValues) ? rawValues : {}
      );
    }
  }

  if (!isPlainObject(value.settings)) {
    throw new BridgeError("invalid_request", "settings must be an object.");
  }

  return {
    format: "bookmarklet-bridge-config",
    version: 1,
    exportedAt: requireString(value.exportedAt, "exportedAt"),
    settings: {
      themeMode:
        value.settings.themeMode === "light" || value.settings.themeMode === "dark" || value.settings.themeMode === "active"
          ? value.settings.themeMode
          : "active",
      allowedOrigins: Array.isArray(value.settings.allowedOrigins)
        ? value.settings.allowedOrigins.map((origin, index) => requireString(origin, `settings.allowedOrigins[${index}]`))
        : [],
      toastDefaults: {
        durationMs: requireFiniteNumber(
          isPlainObject(value.settings.toastDefaults) ? value.settings.toastDefaults.durationMs : undefined,
          "settings.toastDefaults.durationMs"
        )
      },
      requestDefaults: {
        timeoutMs: requireFiniteNumber(
          isPlainObject(value.settings.requestDefaults) ? value.settings.requestDefaults.timeoutMs : undefined,
          "settings.requestDefaults.timeoutMs"
        )
      }
    },
    approvedPolicies,
    bookmarkletSettingsSchemas,
    bookmarkletSettingsValues
  };
}

export function parseEncryptedConfigurationExport(value: unknown): EncryptedBridgeConfigurationExport {
  if (!isPlainObject(value)) {
    throw new BridgeError("invalid_request", "Encrypted backup must be an object.");
  }
  if (value.format !== "bookmarklet-bridge-encrypted-config" || value.version !== 1) {
    throw new BridgeError("invalid_request", "Unsupported encrypted backup format.");
  }
  return {
    format: "bookmarklet-bridge-encrypted-config",
    version: 1,
    app: value.app === "Bookmarklet Bridge" ? "Bookmarklet Bridge" : (() => {
      throw new BridgeError("invalid_request", "Encrypted backup app is invalid.");
    })(),
    exportedAt: requireString(value.exportedAt, "exportedAt"),
    scope: value.scope === "approved-policies-and-settings" ? "approved-policies-and-settings" : (() => {
      throw new BridgeError("invalid_request", "Encrypted backup scope is invalid.");
    })(),
    kdf: value.kdf === "PBKDF2" ? "PBKDF2" : (() => {
      throw new BridgeError("invalid_request", "Encrypted backup KDF is invalid.");
    })(),
    cipher: value.cipher === "AES-GCM" ? "AES-GCM" : (() => {
      throw new BridgeError("invalid_request", "Encrypted backup cipher is invalid.");
    })(),
    iterations: requireFiniteNumber(value.iterations, "iterations"),
    saltBase64: requireString(value.saltBase64, "saltBase64"),
    ivBase64: requireString(value.ivBase64, "ivBase64"),
    ciphertextBase64: requireString(value.ciphertextBase64, "ciphertextBase64")
  };
}

export async function decryptConfigurationExport(
  envelope: EncryptedBridgeConfigurationExport,
  passphrase: string
): Promise<BridgeConfigurationExport> {
  if (!passphrase.trim()) {
    throw new BridgeError("invalid_request", "Encryption key must not be empty.");
  }
  if (envelope.iterations !== PBKDF2_ITERATIONS) {
    throw new BridgeError("invalid_request", "Unsupported encrypted backup iteration count.");
  }

  const key = await deriveKey(passphrase, fromBase64(envelope.saltBase64, "saltBase64"));
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(envelope.ivBase64, "ivBase64") },
      key,
      fromBase64(envelope.ciphertextBase64, "ciphertextBase64")
    );
    return parseConfigurationExport(JSON.parse(new TextDecoder().decode(plaintext)) as unknown);
  } catch {
    throw new BridgeError("invalid_request", "Unable to decrypt backup. Check the encryption key.");
  }
}
