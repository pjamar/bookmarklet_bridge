import type { BridgeSettings, PostActionMessage } from "../../shared/types";
import { executeJsonRequest } from "./network";

export async function handlePost(request: PostActionMessage, settings: BridgeSettings) {
  return executeJsonRequest("POST", request.payload, settings);
}
