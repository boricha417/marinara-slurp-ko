# 슬럽 한국어 패치 1.0.0 (Marinara Engine 2.5.0 / Slurp 0.3.17)

Marinara Engine 의 Slurp 앱(패키지 `slurp2`)에서 아직 영어로 남아 있는 문구를 한국어로 보여 주는 개인 확장입니다.

- Slurp 의 원래 한국어 번역은 그대로 두고 **빠진 번역만** 채웁니다(번역 키 2,657개). Slurp 이 업데이트로 번역을 추가하면 그쪽이 우선합니다.
- 번역 키를 거치지 않는 고정 문구(첫 안내 모달, 백스테이지 수치 설명, 프롬프트 레시피 이름 등 약 550개)는 작은 사전으로 바꿉니다.
- 스파이스·탐색 태그와 기본 이벤트 이름처럼 데이터로 들어오는 영어는 `lingerie (란제리)` 식으로 **병기**합니다.
- 마리나라 언어가 **한국어**일 때만 동작합니다. 다른 언어에서는 아무것도 바꾸지 않습니다.
- 모델에 보내는 프롬프트 본문, 사용자·AI 가 쓴 글, 모델 이름은 건드리지 않습니다.

## 설치

### GitHub 확장 관리자로 (업데이트가 편합니다)
1. 마리나라의 **GitHub 확장 관리자**에 이 저장소 주소를 등록합니다.
2. 목록에 뜨는 **슬럽 한국어 패치**를 설치하고 "전체 페이지 접근"을 승인합니다. (Slurp 이 번역 파일을 받아 오는 요청을 가로채야 해서 필요합니다.)
3. Slurp 탭을 다시 엽니다. 이미 열려 있었다면 새로고침 한 번이 가장 확실합니다.
4. 새 버전이 올라오면 GitHub 확장 관리자의 **업데이트 확인**을 눌러 주세요.

### zip 으로
`manifest.json` 과 `extension.js` 를 zip 으로 묶어 **설정 → 애드온 → 외부 확장**에서 가져옵니다. 나머지 절차는 같습니다.

## 동작 원리

1. Slurp 은 자체 번역 시스템(i18next)을 쓰고, 한국어일 때 `/api/capability-packages/slurp2/assets/.../locales/ko.json` 을 받아 옵니다. 이 확장은 그 요청을 가로채서 **Slurp 원본 번역 위에 이 확장의 번역을 빈 키에만** 합쳐 돌려줍니다.
2. 확장이 Slurp 보다 늦게 떠서 이미 번역이 들어간 경우에는 Slurp 화면 안의 React 트리에서 번역 인스턴스를 찾아 같은 방식으로 보완합니다.
3. 고정 문구는 Slurp 화면과 Slurp 의 모달·시트 안에서만, **문구 전체가 정확히 일치할 때만** 사전으로 바꿉니다.

확인용: 브라우저 콘솔에서 `window.__slpKoPatch` 를 보면 적용 건수가 나옵니다.

## 폴더 구조

```
manifest.json             확장 정보
extension.js              빌드 산출물 (설치되는 파일)
src/runtime.js            런타임 원본
data/en.json              Slurp 영어 원문 전체 (추출 결과, 검증용)
data/i18n-ko.engine.json  마리나라 엔진 한국어 팩에서 자동으로 가져온 번역
data/i18n-ko.json         직접 번역한 키
data/text-ko.json         고정 문구 사전 (영어 → 한국어)
data/todo.json            아직 번역이 없는 키 (추출 결과)
도구/extract.mjs          설치된 Slurp 에서 영어 원문·빠진 키 추출
도구/build.mjs            data + src → extension.js
```

## Slurp 이 업데이트됐을 때 (개발 메모)

```bash
node 도구/extract.mjs
```
`data/todo.json` 에 새로 생긴 키가 나옵니다. `data/i18n-ko.json` 에 번역을 추가한 뒤

```bash
node 도구/build.mjs
```
로 `extension.js` 를 다시 만들고, `manifest.json` 의 버전을 올려 커밋합니다. 고정 문구는 번들(`client.js`)에서 `children:"..."`, `title:"..."` 같은 영어 리터럴을 찾아 `data/text-ko.json` 에 추가합니다.

## 버전 기록

- **1.0.0** (2026-10-19): 첫 공개. Slurp 0.3.17 기준 빠진 번역 키 2,657개, 고정 문구 549개(태그·이벤트 병기 포함).

## 번역 오류 제보

어색하거나 틀린 번역을 보시면 화면 이름과 원래 영어 문구를 알려 주세요. `data/i18n-ko.json` 과 `data/text-ko.json` 을 고치면 됩니다.
