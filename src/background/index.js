import { initializeMessageHandlers } from "./messageHandler.js";
import { initializeKeyboardShortcuts } from "./keyboard.js";
import { initializeInstallHooks } from "./install.js";

initializeMessageHandlers();
initializeKeyboardShortcuts();
initializeInstallHooks();

// 팝업 기능이 활성화되었으므로 클릭 시 수동으로 설정 페이지를 열던 코드를 제거합니다.
