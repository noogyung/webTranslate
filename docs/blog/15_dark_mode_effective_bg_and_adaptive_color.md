# [Part 5] #15. 다크모드 가독성 붕괴와 상위 DOM 유효 배경색 보색 계산

> **작업 일자**: 2026-08-06  
> **관련 대화**: `37bafb78-0ac0-4e1a-af49-e3230b742da0` (커밋 `2af2d25`, `b49e42e`, `fe87483`)  
> **핵심 분류**: `새로운 지시`, `지시 번복 (수동 선택 취소)`, `지시 수정 (자동 계산)`

---

## 1. 요구 사항과 이유 (Requirement & Why)

### 요구 이유
스팀(Steam)의 어두운 커뮤니티 페이지나 깃허브 다크모드에서 번역을 켰을 때, 검은 배경 위에 짙은 회색 글씨가 찍혀 나와 글자가 배경에 파묻혀 전혀 읽을 수 없었다. 반대로 글자 색을 흰색으로 고정하면 위키피디아 같은 밝은 사이트에서 흰 배경에 흰 글씨가 되어 사라져 버렸다.

### 요구 사항
1. 웹페이지의 DOM 트리를 상위로 거슬러 올라가며 실제 눈에 보이는 유효 배경색(`Effective Background Color`)을 정확히 탐색할 것.
2. `background-image`가 깔려 있거나 투명(`rgba(0,0,0,0)`)인 경우를 완벽하게 예외 처리할 것.
3. WCAG 2.1 상대 명도(Relative Luminance) 공식을 기반으로 배경색에 최적화된 보색 글자색을 100% 자동 계산할 것.

---

## 2. 지시 내용 (Instruction)

AI에게 다크모드 가독성 엔진 개발을 지시했다:

> **"다크모드 사이트에서 번역문 글자가 배경에 묻히는 문제를 해결해라. 사이트 배경색을 역추적하여 글자색을 자동으로 계산해 주는 적응형 가독성 로직을 작성해라."**

---

## 3. AI의 구현 결과 및 발생한 시행착오 (Trial & Error)

AI가 옵션 페이지에 사용자가 글자 색을 고르는 Color Picker를 추가해왔다.

```javascript
// AI가 제안한 방식 (수동 조작 요구)
// 옵션에서 글자 색상을 사용자가 직접 설정하게 유도
```

### 발생한 문제점
* **극악의 사용자 경험**: 사용자가 어두운 사이트에 들어갈 때마다 옵션 창을 열어서 글자색을 바꾸고, 밝은 사이트에 가면 또 바꾸는 것은 말도 안 되는 불편함.

---

## 4. 지시 번복 및 지시 수정 (Action: Reversal & Fix)

* **[지시 번복 - 옵션 페이지 수동 컬러피커 지시 취소]**:  
  > "수동 선택기 계획은 전면 취소한다! **사용자가 설정을 건드릴 필요 없이, 확장 프로그램이 배경색을 스스로 감지해서 100% 자동으로 글자색과 하이라이트 색상을 계산하도록 만들어라.**"
* **[지시 수정 - `background-image` 탐색 중단 및 WCAG 명도 계산 보정]**:  
  > "배경 이미지가 깔린 요소를 만나면 엉뚱한 투명 배경색을 가져오지 말고, **원문 글자색의 명도를 분석하여 반전시키는 예외 로직을 반드시 추가해라.**"

---

## 5. 해결 과정 및 결과 (Resolution)

AI가 상위 DOM 유효 배경색 탐색기와 WCAG 상대 명도 계산기를 완성했다 (`commit: 2af2d25`, `b49e42e`).

```javascript
// src/content/theme.js
export function getEffectiveBackgroundColor(element) {
  let curr = element;

  while (curr && curr !== document.documentElement) {
    const style = window.getComputedStyle(curr);

    // 배경 이미지가 있으면 왜곡 방지를 위해 즉시 중단하고 원문 색상 분석으로 전환
    if (style.backgroundImage && style.backgroundImage !== "none") {
      return null;
    }

    const bg = style.backgroundColor;
    if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") {
      return parseRgba(bg); // 유효 배경색 반환
    }
    curr = curr.parentElement;
  }

  return { r: 255, g: 255, b: 255, a: 1 }; // 기본 흰색
}

export function computeAdaptiveTextColor(bgRgb) {
  if (!bgRgb) return "inherit";
  // WCAG 상대 명도(Luminance) 계산
  const luminance = (0.299 * bgRgb.r + 0.587 * bgRgb.g + 0.114 * bgRgb.b) / 255;
  // 어두운 배경(L < 0.5)이면 밝은 글씨(#f8fafc), 밝은 배경이면 어두운 글씨(#0f172a)
  return luminance < 0.5 ? "#f8fafc" : "#0f172a";
}
```

검은색 스팀 커뮤니티, 어두운 깃허브, 밝은 위키피디아까지 어떤 사이트에서도 글자가 묻히지 않고 또렷하게 읽히는 완벽한 시각적 안정성을 달성했다.

---

## 6. 다음 작업 사항과 이유 (Next Work & Why)

가독성 엔진은 완성되었으나, 사이트마다 글씨 크기나 하이라이트 투명도를 미세하게 조절하고 싶을 때 매번 옵션 탭으로 이동해야 하는 불편함이 남아있었다.

**웹페이지를 벗어나지 않고 툴바에서 1초 만에 슬라이더로 스타일을 바꾸는 빠른 설정 팝업(`optionPopup.html`)과 드롭다운 UI 통일을 진행해야겠다.**
