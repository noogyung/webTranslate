/**
 * src/utils/dictionary.js
 * 공용 사용자 사전 유틸리티
 * - content/translation.js, content/image/canvasRenderer.js 양쪽에서 사용 가능
 * - 원본 translation.js의 buildDictRegex / applyLocalDictionary 로직을 그대로 유지
 */

/**
 * 사전 검색용 정규식 생성.
 * ASCII 단어는 단어 경계(\b) 적용, 한/중/일 등 비ASCII는 단순 전체 문자열 매칭.
 * @param {string} original - 사전 원문 단어
 * @returns {RegExp}
 */
export function buildDictRegex(original) {
  var escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var isAscii = /^[\x00-\x7F]+$/.test(original);
  return isAscii
    ? new RegExp(`\\b${escaped}\\b`, 'gi')
    : new RegExp(escaped, 'gi');
}

/**
 * 사용자 사전을 텍스트에 일괄 적용.
 * @param {string} text - 대상 텍스트
 * @param {Array<{original:string, translated:string}>} customDict - 사전 배열
 * @returns {string} 치환된 텍스트
 */
export function applyLocalDictionary(text, customDict) {
  if (!customDict || !Array.isArray(customDict) || customDict.length === 0) return text;
  var result = text;
  for (const item of customDict) {
    if (!item.original || !item.translated) continue;
    result = result.replace(buildDictRegex(item.original), item.translated);
  }
  return result;
}
