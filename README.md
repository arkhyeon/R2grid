# R2grid
## 테스트

브라우저 없이 그리드 코어(정렬·필터·그룹·집계·SSRM·편집 등)를 검사합니다.

```bash
npm test               # tests/**/*.test.mjs 전체
npm test -- ssrm pivot # 파일 이름에 그 글자가 들어간 것만
```

새 테스트는 `tests/core/<기능>.test.mjs` 에 두고 `check(이름, 실제값, 기대값)` 으로 비교합니다 (`tests/check.mjs`).
