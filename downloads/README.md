# downloads — 자료실 파일 폴더

자료실(`pages/resources.html`)에서 내려받을 앱·자료 파일을 이 폴더에 직접 커밋하세요.

- 파일을 여기에 올리고(git commit), `data/resources.json`(또는 관리자 페이지)의
  `fileUrl`을 `../downloads/파일명` 형태로 지정하면 다운로드 링크가 동작합니다.
- GitHub Pages가 이 폴더를 그대로 서빙하므로 별도 설정은 필요 없습니다.

예: `downloads/sample-app-v1.0.0.zip` → `fileUrl: "../downloads/sample-app-v1.0.0.zip"`
