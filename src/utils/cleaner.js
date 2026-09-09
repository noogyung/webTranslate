/**
 * src/utils/cleaner.js
 * OCR 추출 텍스트 정규화 전처리 유틸리티
 * - PP-OCRv6 / PaddleOCR 서버가 반환한 원문 텍스트를 메인 번역 엔진 전달 전 정제
 */

/**
 * OCR 텍스트를 번역 엔진에 전달하기 전 정규화.
 * - 연속 개행(\n) → 단일 개행으로 압축
 * - 전각 공백(U+3000), 비파괴 공백(U+00A0) → 일반 공백
 * - 말풍선 테두리 특수 기호 제거 (…, ─, ━ 등 순수 구분자)
 * - 앞뒤 공백 정리
 * @param {string} text - OCR 원문 텍스트
 * @returns {string} 정제된 텍스트
 */
export function cleanOcrTextForTranslation(text) {
  if (!text || typeof text !== 'string') return '';

  return text
    // 전각 공백, 비파괴 공백 → 일반 공백
    .replace(/[\u3000\u00A0]/g, ' ')
    // 연속 개행 2개 이상 → 단일 개행
    .replace(/\n{2,}/g, '\n')
    // 말풍선 구분선 패턴 제거 (3자 이상 연속된 ─ ━ ― 등)
    .replace(/[─━―]{3,}/g, '')
    // 줄 앞뒤 공백 정리 (각 줄별)
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n')
    .trim();
}
