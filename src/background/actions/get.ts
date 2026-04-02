import type { BridgeSettings, GetActionMessage } from "../../shared/types";
import { executeJsonRequest } from "./network";

export async function handleGet(request: GetActionMessage, settings: BridgeSettings) {
  return executeJsonRequest("GET", request.payload, settings);
}
