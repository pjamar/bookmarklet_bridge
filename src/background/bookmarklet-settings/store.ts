import {
  BOOKMARKLET_SETTINGS_SCHEMA_STORAGE_KEY,
  BOOKMARKLET_SETTINGS_VALUES_STORAGE_KEY
} from "../../shared/constants";
import {
  normalizeBookmarkletSettingsValues
} from "../../shared/bookmarklet-settings";
import type {
  BookmarkletSettingsSchema,
  BookmarkletSettingsSchemaMap,
  BookmarkletSettingsValueMap,
  BookmarkletSettingsValues
} from "../../shared/types";

async function getSchemaMap(): Promise<BookmarkletSettingsSchemaMap> {
  const result = await browser.storage.local.get(BOOKMARKLET_SETTINGS_SCHEMA_STORAGE_KEY);
  return (result[BOOKMARKLET_SETTINGS_SCHEMA_STORAGE_KEY] as BookmarkletSettingsSchemaMap | undefined) ?? {};
}

async function saveSchemaMap(schemaMap: BookmarkletSettingsSchemaMap): Promise<void> {
  await browser.storage.local.set({ [BOOKMARKLET_SETTINGS_SCHEMA_STORAGE_KEY]: schemaMap });
}

async function getValueMap(): Promise<BookmarkletSettingsValueMap> {
  const result = await browser.storage.local.get(BOOKMARKLET_SETTINGS_VALUES_STORAGE_KEY);
  return (result[BOOKMARKLET_SETTINGS_VALUES_STORAGE_KEY] as BookmarkletSettingsValueMap | undefined) ?? {};
}

async function saveValueMap(valueMap: BookmarkletSettingsValueMap): Promise<void> {
  await browser.storage.local.set({ [BOOKMARKLET_SETTINGS_VALUES_STORAGE_KEY]: valueMap });
}

export async function listBookmarkletSettingsSchemas(): Promise<BookmarkletSettingsSchemaMap> {
  return getSchemaMap();
}

export async function listBookmarkletSettingsValues(): Promise<BookmarkletSettingsValueMap> {
  return getValueMap();
}

export async function saveBookmarkletSettingsSchema(
  definitionHash: string,
  schema: BookmarkletSettingsSchema | undefined
): Promise<void> {
  const schemaMap = await getSchemaMap();
  const valueMap = await getValueMap();

  if (!schema || Object.keys(schema).length === 0) {
    delete schemaMap[definitionHash];
    delete valueMap[definitionHash];
  } else {
    schemaMap[definitionHash] = schema;
    valueMap[definitionHash] = normalizeBookmarkletSettingsValues(schema, valueMap[definitionHash]);
  }

  await Promise.all([saveSchemaMap(schemaMap), saveValueMap(valueMap)]);
}

export async function saveBookmarkletSettingsValues(
  definitionHash: string,
  values: BookmarkletSettingsValues
): Promise<BookmarkletSettingsValues | undefined> {
  const schemaMap = await getSchemaMap();
  const schema = schemaMap[definitionHash];
  if (!schema) {
    return undefined;
  }

  const valueMap = await getValueMap();
  const normalized = normalizeBookmarkletSettingsValues(schema, values);
  valueMap[definitionHash] = normalized;
  await saveValueMap(valueMap);
  return normalized;
}

export async function getBookmarkletSettingsValues(
  definitionHash: string
): Promise<BookmarkletSettingsValues | undefined> {
  const schemaMap = await getSchemaMap();
  const schema = schemaMap[definitionHash];
  if (!schema) {
    return undefined;
  }

  const valueMap = await getValueMap();
  return normalizeBookmarkletSettingsValues(schema, valueMap[definitionHash]);
}

export async function deleteBookmarkletSettings(definitionHash: string): Promise<void> {
  const schemaMap = await getSchemaMap();
  const valueMap = await getValueMap();
  delete schemaMap[definitionHash];
  delete valueMap[definitionHash];
  await Promise.all([saveSchemaMap(schemaMap), saveValueMap(valueMap)]);
}
