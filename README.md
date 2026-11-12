# 체크리스트 노트 (Checklist Note)

현재 버전 **v1.5.1** · 웹사이트와 크롬 확장 프로그램이 같은 버전을 써요. 바뀐 내용은 앱의 설정 > 패치노트에서 볼 수 있어요.

숙제나 할 일 목록을 텍스트로 붙여넣으면 바로 체크리스트로 만들어주는 웹 앱입니다. 빌드 도구 없이 브라우저에서 `index.html`을 열면 동작합니다.

## 기능

- 텍스트를 붙여넣으면 "1." "1)" 같은 번호와 Tab/스페이스 4칸 들여쓰기를 인식해서 계층 구조 체크리스트를 만듭니다.
- 입력할 때 Enter를 치면 다음 번호가 자동으로 붙고, Tab/Shift+Tab으로 들여쓰기·내어쓰기를 합니다.
- 체크하면 체크 표시와 취소선이 그어지듯 나타나고, 다 끝내면 축하 효과가 나옵니다.
- 다 끝낸 체크리스트는 목록 아래 "완료한 체크리스트"로 모입니다.
- 삭제와 체크 초기화는 바로 되돌릴 수 있습니다.
- **순서 바꾸기**: 항목 오른쪽 끝의 ⋮⋮ 손잡이를 끌어서 같은 묶음 안에서 순서를 바꿔요 (하위 항목은 함께 움직여요). 키보드로는 손잡이에서 ↑ ↓ 키를 눌러요. 번호가 매겨진 묶음은 번호를 다시 매기고, 바로 되돌릴 수 있어요.
- **설정**: 오른쪽 위 설정 버튼에서 Tab/Enter로 붙는 번호 모양(`1.` `1)` `(1)` `1-` `1_` `1` `①` `a)` `-` `•` 번호 없음)을 단계별로 골라요. 이미 번호가 붙은 줄을 Tab으로 들여쓰면 그 단계의 모양으로 바뀌어요. 로그인하면 설정도 계정으로 동기화돼요.
- **메모**: 체크리스트마다 상세 화면 아래에 메모를 남겨요. 입력하는 대로 저장되고, 목록 화면 카드에는 메모의 첫 줄이 보여요.
- 상위 항목을 체크하면 하위 항목이 모두 체크되고, 상위 항목은 접었다 펼 수 있습니다.
- **템플릿**: 자주 쓰는 틀을 저장해 두고 목록 화면의 "템플릿으로 시작"에서 불러와요. 채울 곳은 `___`로 적어두면 Tab/Shift+Tab으로 빈칸 사이를 옮겨 다니며 채워요. 템플릿도 계정으로 동기화돼요.
- **남은 것만 새로 만들기**: 안 끝낸 항목만 모아 오늘 날짜의 새 체크리스트로 넘깁니다.
- **계정으로 동기화**: 이메일 + 비밀번호로 로그인하면 PC와 폰에서 같은 체크리스트를 봅니다. 내 계정에만 저장되고 다른 사람은 볼 수 없습니다 (설정 필요, 아래 참고).
- 시스템 / 라이트 / 다크 테마 전환.

## 크롬 확장 프로그램으로 쓰기

같은 폴더가 웹사이트이자 크롬 확장 프로그램이에요.

1. 크롬 주소창에 `chrome://extensions` 입력
2. 오른쪽 위 **개발자 모드** 켜기
3. **압축해제된 확장 프로그램을 로드합니다** → 이 폴더 선택
4. 퍼즐 조각 아이콘에서 체크리스트 노트를 고정하면, 툴바 아이콘(또는 `Alt+Shift+C`)으로 팝업이 열려요.

팝업 오른쪽 위 ↗ 버튼을 누르면 큰 화면 탭으로 열려요. 확장 프로그램과 웹사이트는 저장 공간이 따로라서, 같은 계정으로 로그인하면 양쪽에 같은 체크리스트가 보여요.

## 계정 동기화 설정 (Supabase, 무료)

비워두면 이 브라우저에만 저장됩니다.

1. [supabase.com](https://supabase.com)에서 무료 프로젝트를 만듭니다.
2. **SQL Editor**에서 아래를 실행합니다. 로그인한 본인만 자기 행을 읽고 쓸 수 있습니다.
   ```sql
   create table public.checklist_data (
     user_id uuid primary key references auth.users(id) on delete cascade,
     data jsonb not null default '{}'::jsonb,
     updated_at timestamptz not null default now()
   );
   alter table public.checklist_data enable row level security;
   create policy "select_own" on public.checklist_data for select to authenticated using ((select auth.uid()) = user_id);
   create policy "insert_own" on public.checklist_data for insert to authenticated with check ((select auth.uid()) = user_id);
   create policy "update_own" on public.checklist_data for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
   ```
3. **Authentication > Sign In / Providers > Email**에서 이메일 로그인을 켭니다. 가입 직후 바로 쓰려면 "Confirm email"을 끕니다.
4. 프로젝트 설정의 API 화면에서 **Project URL**과 **publishable(anon) key**를 복사해 `js/config.js`에 넣습니다. 이 키는 공개용으로 만들어진 키라 저장소에 올려도 됩니다.

### 예전 아이디 동기화에서 옮기기

이전에는 아이디만으로 동기화했습니다(`user_data` 테이블). 계정으로 로그인한 뒤 로그인 창의 **예전 아이디에서 가져오기**에 예전 아이디를 입력하면 그 체크리스트가 이 계정으로 합쳐집니다. 이 브라우저에 있던 체크리스트는 로그인하는 순간 계정으로 올라갑니다.

### SuperDialer 앱과 함께 쓰기

SuperDialer 앱의 내장 브라우저에서 이 사이트를 열면 앱 계정이 같은 계정이라 로그인된 채로 열립니다(앱이 이 페이지의 `localStorage`에 한 시간짜리 로그인 정보를 넣어 줍니다. 갱신용 토큰은 주지 않으므로 앱이 열 때마다 새로 넣어요).

## 사진 인식

입력 화면의 **사진에서 읽기**를 누르거나, 사진을 Ctrl+V로 붙여넣거나 끌어다 놓으면 할 일을 읽어서 입력칸에 채워요. 브라우저 안에서 [Tesseract.js](https://github.com/naptha/tesseract.js)로 읽어서 계정이나 키가 필요 없어요.

- 인쇄된 글자, 화면 캡처는 잘 읽고 손글씨는 약해요. 읽은 뒤 틀린 글자는 고쳐주세요.
- 표처럼 칸이 나뉜 사진은 세로선을 찾아 칸마다 따로 읽어요.
- 처음 한 번은 한국어 데이터(몇 MB)를 받느라 느려요.
- `file://`로 열면 동작하지 않아요. 웹사이트나 확장 프로그램에서 써주세요.

## 구조

```
index.html          화면 마크업 (웹사이트, 확장 팝업 겸용)
manifest.json       크롬 확장 설정
icons/              확장 아이콘
checklist-note.html 예전 주소 → index.html로 이동
css/style.css
js/
  version.js        버전과 패치노트
tools/stamp.js        캐시 방지용 ?v= 값 붙이기
  boot.js           테마 적용, 팝업 모드 표시
  config.js         동기화 서버 설정
  util.js           공통 도구 (id, 날짜, localStorage, 알림)
  markers.js        번호 모양 처리 (파싱, 이어 붙이기, 다시 매기기)
  settings.js       설정 저장과 설정 창
  dragsort.js       끌어서 순서 바꾸기
  parser.js         텍스트 → 항목 구조 변환
  store.js          저장, 기기 간 병합
  sync.js           Supabase 로그인 + 동기화
  theme.js          테마 전환
  confetti.js       완료 축하 효과
  templates.js      템플릿 저장
  photo.js          사진 → 텍스트 (Tesseract, 칸 나누기)
  ocr-text.js       읽은 글자 → 목록 형식 정리
  view-list.js / view-detail.js / view-input.js / account.js
  app.js            화면 전환, 시작
tests/
vendor/tesseract/   글자 인식 엔진 (Apache-2.0)
```

## 버전 올리기

버전은 `js/version.js`의 `VERSION`이 기준이에요. 새 버전을 낼 때:

1. `js/version.js`의 `VERSION`과 `PATCH_NOTES` 맨 위에 새 항목을 적어요.
2. `manifest.json`의 `version`을 같은 숫자로 바꿔요. (크롬은 `1.5.0`처럼 숫자와 점만 받아요)
3. 이 README의 `현재 버전`도 같이 바꿔요.
4. **`node tools/stamp.js`를 실행해요.** index.html의 js/css 주소에 파일 내용에 따른 `?v=` 값을 붙여서, GitHub Pages가 옛 파일을 캐시에서 꺼내 쓰지 못하게 해요. (js/css를 고칠 때마다 필요해요)
5. `node --test tests/*.test.js`가 버전이 어긋나거나 stamp를 빼먹으면 알려줘요.
6. 커밋 후 `git tag v1.5.1`처럼 태그를 달아 올려요.

## 테스트

```
node --test tests/*.test.js
```
