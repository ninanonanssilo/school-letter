Edu Tools - 가정통신문 자동 생성기 (정적 페이지)

- `index.html`/`style.css`/`main.js`만으로 동작합니다.
- 햄버거 카테고리 메뉴에서 아래 Edu Tools 사이트로 이동(연동)됩니다.
  - https://money-report.pages.dev/
  - https://educate1.pages.dev/

AI(양식 분석/양식 기반 생성) - Cloudflare Pages Functions

- 엔드포인트
  - `POST /api/analyze-template` (multipart/form-data, field `file`)
  - `POST /api/generate` (JSON: `{ template, values }`)
- 파일 형식
  - 지원: `PDF`, `HWPX(.hwpx)`, 이미지(`png/jpg/jpeg/webp`)
  - 미지원: `HWP(.hwp)` (PDF 또는 HWPX로 변환 후 업로드)
- Cloudflare Pages 환경변수(서버에만 설정, 프론트에 노출 금지)
  - `OPENAI_API_KEY` (필수)
  - `OPENAI_MODEL` (선택, 기본: `gpt-4o-mini`)
