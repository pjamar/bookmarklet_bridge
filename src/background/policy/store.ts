import { POLICIES_STORAGE_KEY } from "../../shared/constants";
import type { PolicyEntry } from "../../shared/types";

type PolicyMap = Record<string, PolicyEntry>;

async function getPolicyMap(): Promise<PolicyMap> {
  const result = await browser.storage.local.get(POLICIES_STORAGE_KEY);
  return (result[POLICIES_STORAGE_KEY] as PolicyMap | undefined) ?? {};
}

async function savePolicyMap(policyMap: PolicyMap): Promise<void> {
  await browser.storage.local.set({ [POLICIES_STORAGE_KEY]: policyMap });
}

export async function listPolicies(): Promise<PolicyEntry[]> {
  const policyMap = await getPolicyMap();
  return Object.values(policyMap).sort((left, right) => left.name.localeCompare(right.name));
}

export async function getPolicy(definitionHash: string): Promise<PolicyEntry | undefined> {
  const policyMap = await getPolicyMap();
  return policyMap[definitionHash];
}

export async function upsertPolicy(entry: PolicyEntry): Promise<void> {
  const policyMap = await getPolicyMap();
  policyMap[entry.definitionHash] = entry;
  await savePolicyMap(policyMap);
}

export async function deletePolicy(definitionHash: string): Promise<void> {
  const policyMap = await getPolicyMap();
  delete policyMap[definitionHash];
  await savePolicyMap(policyMap);
}

export async function updatePolicyDecision(
  definitionHash: string,
  decision: "allow" | "deny"
): Promise<PolicyEntry | undefined> {
  const policyMap = await getPolicyMap();
  const entry = policyMap[definitionHash];
  if (!entry) {
    return undefined;
  }
  const updated: PolicyEntry = {
    ...entry,
    decision,
    updatedAt: new Date().toISOString()
  };
  policyMap[definitionHash] = updated;
  await savePolicyMap(policyMap);
  return updated;
}

export async function touchPolicy(definitionHash: string): Promise<void> {
  const policyMap = await getPolicyMap();
  const entry = policyMap[definitionHash];
  if (!entry) {
    return;
  }
  policyMap[definitionHash] = {
    ...entry,
    lastUsedAt: new Date().toISOString()
  };
  await savePolicyMap(policyMap);
}
