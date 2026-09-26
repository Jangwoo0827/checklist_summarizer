# 체크리스트 노트 (Checklist Note)

숙제나 할 일 목록을 텍스트로 붙여넣거나 사진으로 찍어서 바로 체크리스트로 만들어주는 웹 앱입니다. 빌드 도구 없이 브라우저에서 `index.html`을 열면 동작합니다.

## 기능

- 텍스트를 붙여넣으면 "1." "1)" 같은 번호와 Tab/스페이스 4칸 들여쓰기를 인식해서 계층 구조 체크리스트를 만듭니다.
- 캡처한 이미지를 **Ctrl+V** 하거나 사진을 올리면, 내 컴퓨터에서 실행 중인 [Ollama](https://ollama.com) 비전 모델이 목록을 읽어줍니다. 읽는 내용이 실시간으로 보이고, 중간에 멈출 수도 있어요.
- 상위 항목을 체크하면 하위 항목이 모두 체크되고, 상위 항목은 접었다 펼 수 있습니다.
- **남은 것만 새로 만들기**: 안 끝낸 항목만 모아 오늘 날짜의 새 체크리스트로 넘깁니다.
- **아이디로 동기화**: 비밀번호 없이 아이디만으로 PC와 폰에서 같은 체크리스트를 봅니다 (설정 필요, 아래 참고).
- 시스템 / 라이트 / 다크 테마 전환.

## 사진 인식 (Ollama)

1. [Ollama](https://ollama.com)를 설치하고 비전 모델을 받습니다.
   ```
   ollama pull minicpm-v
   ```
2. 브라우저에서 Ollama에 접속하려면 환경 변수 `OLLAMA_ORIGINS=*`를 설정한 뒤 Ollama를 다시 켭니다.
3. 설치된 비전 모델은 "사진으로 인식" 탭의 모델 목록에 자동으로 나타납니다.

## 아이디 동기화 설정 (Supabase, 무료)

비워두면 이 브라우저에만 저장됩니다.

1. [supabase.com](https://supabase.com)에서 무료 프로젝트를 만듭니다.
2. **SQL Editor**에서 아래를 실행합니다.
   ```sql
   create table public.user_data (
     user_id text primary key,
     data jsonb not null,
     updated_at timestamptz not null default now()
   );
   alter table public.user_data enable row level security;
   create policy "read"   on public.user_data for select to anon using (true);
   create policy "insert" on public.user_data for insert to anon with check (true);
   create policy "update" on public.user_data for update to anon using (true) with check (true);
   grant select, insert, update on public.user_data to anon;
   ```
   삭제 권한은 주지 않아서, 누구도 API로 다른 사람의 데이터를 통째로 지울 수는 없습니다.
3. 프로젝트 설정의 API 화면에서 **Project URL**과 **publishable(anon) key**를 복사해 `js/config.js`에 넣습니다. 이 키는 공개용으로 만들어진 키라 저장소에 올려도 됩니다.

비밀번호가 없으므로 아이디를 아는 사람은 누구나 그 체크리스트를 볼 수 있습니다. 남이 짐작하기 어려운 아이디를 쓰세요.

## 구조

```
index.html          화면 마크업
checklist-note.html 예전 주소 → index.html로 이동
css/style.css
js/
  config.js         동기화 서버 설정
  util.js           공통 도구 (id, 날짜, localStorage, 알림)
  parser.js         텍스트 → 항목 구조 변환
  store.js          저장, 기기 간 병합
  sync.js           Supabase 동기화
  ocr.js            Ollama 사진 인식
  theme.js          테마 전환
  view-list.js / view-detail.js / view-input.js / account.js
  app.js            화면 전환, 시작
tests/logic.test.js
```

## 테스트

```
node --test tests/logic.test.js
```
