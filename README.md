# i_luv_pen

고급 만년필 아카이브를 위한 Vite 기반 정적 웹 프로젝트입니다.

## 핵심 특징

- 프리미엄 카탈로그 감성 UI (Fraunces, 넓은 여백, 은은한 컬러)
- Home / Collection / Blog / Community / About / Search / Admin 라우팅
- 실시간 검색 및 컬렉션 정렬
- 컬렉션 카드 이미지 캐러셀 + 상세 페이지 라이트박스
- 블로그 Markdown 렌더링, 관련 글, 댓글
- 닉네임 기반 커뮤니티 글/댓글 작성 (회원가입 없음)
- 다크 모드 자동 감지 + 수동 토글 + 사용자 설정 저장
- PWA 기본 구성 (manifest, service worker)
- SEO 기본 구성 (OG, Twitter Card, robots, sitemap)
- GitHub Actions 기반 GitHub Pages 자동 배포

## 로컬 실행

```bash
npm install
npm run dev
```

- 개발 모드에서는 프론트가 기본으로 `/api` 프록시를 사용하므로, API 서버가 켜져 있으면 커뮤니티/댓글/계정 데이터는 DB 기준으로 동작합니다.

## PostgreSQL 설치/연결

### 1) 환경 변수 설정

`.env.example` 파일을 `.env`로 복사하고 값을 확인합니다.

```bash
copy .env.example .env
```

### 2) PostgreSQL 실행 (Docker)

```bash
docker compose up -d
```

- 기본 DB: `iluvpen`
- 기본 계정: `postgres`
- 기본 비밀번호: `postgres`
- 관리자 로그인: `.env`의 `ADMIN_PASSWORD`
- 스키마 파일: `server/schema.sql` (컨테이너 최초 실행 시 자동 적용)

### 3) DB 연결 확인

```bash
npm run db:check
```

정상 연결이면 DB 이름과 서버 시간이 출력됩니다.

### 4) 프론트 + API 동시 실행

```bash
npm run dev:all
```

- 프론트: Vite (`http://localhost:5173`)
- API: Express (`http://localhost:8787`)
- 헬스 체크: `GET /api/health`, `GET /api/db-health`

## 배포

1. 저장소 이름을 i_luv_pen으로 생성합니다.
2. main 브랜치에 push 합니다.
3. GitHub Settings > Pages에서 Source를 GitHub Actions로 설정합니다.
4. 워크플로우 실행 후 배포 URL 확인합니다.

## GitHub Pages + PostgreSQL 운영

GitHub Pages는 정적 호스팅이므로 DB 직접 실행이 불가능합니다.
따라서 API 서버(예: Render/Railway/Fly.io) + PostgreSQL 조합으로 운영해야 합니다.

### 1) API 서버 배포

- `server/index.js` 를 Node 환경에 배포합니다.
- 배포 환경 변수 설정:
	- `DATABASE_URL` 또는 `PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD`
	- `PGSSLMODE=require` (클라우드 DB인 경우 권장)
	- `CORS_ORIGIN=https://<your-github-id>.github.io`
	- `ADMIN_PASSWORD`, `ADMIN_TOKEN_SECRET`

### 2) DB 스키마 적용

- `server/schema.sql` 을 PostgreSQL에 실행합니다.

### 3) GitHub Actions 시크릿 추가

- 저장소 Settings > Secrets and variables > Actions
- 시크릿 이름: `VITE_API_BASE_URL`
- 값: 배포된 API URL (예: `https://your-api.example.com`)

배포 워크플로우는 이 값을 사용해 프론트 빌드 시 API 주소를 주입합니다.

### 4) 동작 확인

- 페이지 접속 후 커뮤니티 글/댓글 작성
- API의 `GET /api/db-health` 가 `ok: true` 인지 확인

### Render 추천 빠른 설정 (이 프로젝트 기준)

이 저장소에는 Render 블루프린트 파일 `render.yaml` 이 포함되어 있어, 클릭 몇 번으로 API + PostgreSQL을 함께 만들 수 있습니다.

1) Render에서 Blueprint 배포

- Render Dashboard > New > Blueprint
- 이 GitHub 저장소(`iluvpen777-creator/iluvpen`) 선택
- `render.yaml` 인식 후 생성되는 리소스 확인:
	- Web Service: `iluvpen-api`
	- PostgreSQL: `iluvpen-db`
- Deploy 실행

2) 배포 후 API 주소 확인

- Render의 `iluvpen-api` 서비스 페이지에서 URL 확인
- 예: `https://iluvpen-api.onrender.com`

3) DB/헬스 체크 확인

- `https://<api-url>/api/health`
- `https://<api-url>/api/db-health`

둘 다 `ok: true`면 정상입니다.

4) GitHub Actions Secret 연결

- GitHub 저장소 > Settings > Secrets and variables > Actions
- `New repository secret`
- Name: `VITE_API_BASE_URL`
- Secret: Render에서 확인한 API URL (마지막 `/` 없이)

5) 프론트 재배포

- main 브랜치에 push (또는 Actions에서 수동 실행)
- GitHub Pages 배포 후 폰/PC가 같은 DB 데이터를 보게 됩니다.

## 운영 전 필수 수정

- public/robots.txt 의 YOUR_USERNAME 치환
- public/sitemap.xml 의 YOUR_USERNAME 치환
- 필요시 vite.config.js 의 base 경로 조정

## 관리자 시스템 주의사항

정적 사이트에서는 완전한 관리자 보안을 구현할 수 없습니다.
실 운영에서는 GitHub App 또는 OIDC 기반 인증과 서버리스 검증 레이어를 추가하세요.
