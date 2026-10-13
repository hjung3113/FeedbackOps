# Interactive user guide

`index.html` is a self-contained Korean walkthrough of the shipped product, with annotated screenshots and interactive navigation. Open `index.html` directly in a browser; its screenshots are loaded from the adjacent `screens/` directory.

[`../USER-MANUAL.md`](../USER-MANUAL.md) is the text authority. Update the guide and manual together when product behavior or user-facing labels change.

Screenshots were captured with the visual harness and schema-validated mock data at 1440×960 on 2026-10-04 from main commit `859cf4aa`. Four screens use capture-time response supplements: `integration-links` includes an entity links list; `task-requests` includes requester names and a source Finding; the Managed System and Analytics Area lists use the coverage fixture.

Survey 생성 안내는 빈 Survey, 기본 템플릿, 기존 Survey 문항 사용과 명시적 Managed System/응답 익명 보호 선택을 설명합니다. 기존 화면 캡처의 촬영 시점은 위와 같으며 새 dialog 상태의 시각 검증과 기준 이미지 생성은 #1075 conductor가 수행합니다.
