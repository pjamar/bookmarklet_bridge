import type { InternalMessage } from "../shared/types";
import { wrapInternalMessage } from "./router";

browser.runtime.onMessage.addListener((message: InternalMessage, sender) => {
  return wrapInternalMessage(message, {
    tabId: sender?.tab?.id
  });
});

browser.browserAction.onClicked.addListener(() => {
  void browser.runtime.openOptionsPage();
});
