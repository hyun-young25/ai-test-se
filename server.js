# 인공지능의 이해 기말고사 - Render 서버형

이 버전은 학생 답안을 브라우저 localStorage가 아니라 PostgreSQL DB에 저장합니다.

## 파일 구조

- server.js: Node.js + Express 서버
- public/index.html: 학생 응시 화면 + 관리자 화면
- package.json: Render 배포용 설정

## Render 배포 순서

### 1. GitHub 저장소에 파일 업로드

이 폴더 안의 파일을 GitHub 저장소 루트에 올립니다.

필수 파일:
- package.json
- server.js
- public/index.html

### 2. Render PostgreSQL 생성

Render Dashboard에서 New + → PostgreSQL 생성

생성 후 Internal Database URL 또는 External Database URL을 복사합니다.

### 3. Render Web Service 생성

New + → Web Service 선택

설정:
- Language: Node
- Build Command: npm install
- Start Command: npm start
- Branch: main

### 4. Environment Variables 설정

Render Web Service의 Environment Variables에 아래 3개를 넣습니다.

- DATABASE_URL = PostgreSQL 연결 주소
- ADMIN_ID = 관리자 아이디
- ADMIN_PW = 관리자 비밀번호

관리자 아이디와 비밀번호는 HTML 화면이나 GitHub 코드에 직접 쓰지 않습니다.

### 5. 배포 후 접속

배포 완료 후 onrender.com 주소로 접속합니다.

학생 제출은 DB에 저장되고, 관리자 로그인 후 전체 제출 목록을 확인할 수 있습니다.

## 주의

Render Free Web Service의 로컬 파일 저장은 재시작/스핀다운/재배포 시 사라질 수 있습니다. 이 프로젝트는 파일 저장이 아니라 PostgreSQL DB 저장 방식을 사용합니다.

Render Free PostgreSQL은 기간 제한이 있을 수 있으므로 실제 시험 후에는 관리자 화면에서 CSV를 꼭 다운로드해 백업하세요.
