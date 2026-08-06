import { initializeMessageHandlers } from "./messageHandler.js";
import { initializeKeyboardShortcuts } from "./keyboard.js";
import { initializeInstallHooks } from "./install.js";

initializeMessageHandlers();
initializeKeyboardShortcuts();
initializeInstallHooks();

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});
