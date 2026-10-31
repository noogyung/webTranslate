import { initializeMessageHandlers } from "./messageHandler.js";
import { initializeKeyboardShortcuts } from "./keyboard.js";
import { initializeInstallHooks } from "./install.js";

initializeMessageHandlers();
initializeKeyboardShortcuts();
initializeInstallHooks();

/* ── Pixiv 이미지(pximg.net) 직접 열기 및 임베드 시 403 방지 상시 규칙 ── */
if (chrome.declarativeNetRequest) {
  chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [9998],
    addRules: [
      {
        id: 9998,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [
            { header: "Referer", operation: "set", value: "https://www.pixiv.net/" },
          ],
        },
        condition: {
          urlFilter: "||pximg.net/",
          resourceTypes: ["main_frame", "sub_frame", "image", "xmlhttprequest", "other"],
        },
      },
    ],
  }).catch(() => {});
}

/* ── SW keepAlive: 장시간 API 호출(gpt-image-2 등) 중 SW 자동 종료 방지 ──
 * Chrome MV3 SW는 비활성 30초 후 종료됨.
 * alarms API로 25초마다 noop 알람을 생성해 SW를 활성 상태로 유지.
 * manifest permissions에 "alarms"가 없어도 alarms는 기본 허용됨. */
chrome.alarms.create("wt-keepalive", { periodInMinutes: 0.4 }); // 24초 간격
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "wt-keepalive") {
    // noop — 알람 수신 자체가 SW를 활성 상태로 유지
  }
});
