# 배포 안내

내부 독서모임 테스트용으로 **서버 한 대**에 배포하는 방법입니다. 기본 대상은 Fly.io이고, Docker가 돌아가는 곳이면 어디든 같은 이미지를 쓸 수 있습니다.

## 먼저 알아 둘 점

| 항목 | 내용 |
|---|---|
| 서버 대수 | **한 대만**. 방 상태가 서버 메모리에 있어서 여러 대로 늘리면 같은 방 사람들이 다른 서버에 붙습니다 |
| 재시작 | 서버가 다시 시작되면 **진행 중인 게임은 사라집니다**. 저장된 세계 기록은 남습니다. 배포는 모임이 없는 시간에 하세요 |
| 저장소 | `/data` 볼륨의 JSON 파일(`worlds.json`, `blocks.json`, `reports.jsonl`, `events.jsonl`) |
| 접근 제한 | `ACCESS_CODE`를 설정하면 코드를 아는 사람만 들어옵니다. 방장이 보내는 초대 링크에는 코드가 자동으로 담깁니다 |
| 이름 | 작품명과 설정을 외부에 공개하기 전에는 작가·출판권 관계자와 협의가 필요합니다. 외부에 여는 서버는 `APP_BRAND`에 가칭을 넣으세요. 가칭을 쓰면 홈 화면의 작품 소개 문구도 빠집니다 |
| 검색 노출 | 모든 응답에 `noindex`를 붙이고 `robots.txt`로 수집을 막습니다 |

## 환경 변수

| 이름 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `8787` | 서버 포트 |
| `DATA_DIR` | `/data` (이미지) | 기록 저장 폴더 |
| `ACCESS_CODE` | 없음 | 접근 코드. 내부 테스트에서는 **반드시 설정** 권장 |
| `APP_BRAND` | `NOVA POUCH` | 화면·탭에 보이는 서비스 이름 |
| `TRUST_PROXY` | `0` | 프록시 뒤에서 실제 접속 주소를 읽을 때 `1` (Fly.io 설정에 이미 포함) |

## Fly.io 첫 배포

[flyctl](https://fly.io/docs/flyctl/install/)을 설치하고 `fly auth login`으로 로그인한 뒤 저장소 루트에서 실행합니다.

```bash
# 1. 앱 만들기. 이름이 이미 쓰이고 있으면 다른 이름을 고르고 fly.toml의 app 값도 바꾼다
fly apps create novapouch

# 2. 기록을 저장할 볼륨 (1GB면 충분)
fly volumes create novapouch_data --region nrt --size 1

# 3. 접근 코드 (모임 사람들에게만 알려 준다)
fly secrets set ACCESS_CODE='원하는-코드'
# 외부에 여는 서버라면 가칭도
# fly secrets set APP_BRAND='가칭'

# 4. 배포
fly deploy

# 5. 확인
curl https://novapouch.fly.dev/api/health   # {"ok":true,"activeGames":0}
```

`fly.toml`은 서버를 재우지 않고 한 대로 유지하도록 설정돼 있습니다. 한 대 이상으로 늘리지 마세요(`fly scale count 1`).

## main에 병합되면 자동 배포

`.github/workflows/deploy.yml`이 `main`의 CI가 통과할 때마다 실행됩니다.

1. 항상: 이미지를 `ghcr.io/h2dj/novapouch:latest`와 커밋 해시 태그로 GitHub Container Registry에 올립니다.
2. 설정했을 때만: Fly.io에 배포합니다. GitHub 저장소 **Settings → Secrets and variables → Actions**에서 다음을 추가하세요.

| 종류 | 이름 | 값 |
|---|---|---|
| Secret | `FLY_API_TOKEN` | `fly tokens create deploy -x 999999h` 로 만든 토큰 |
| Variable | `AUTO_DEPLOY` | `true` |
| Variable | `APP_URL` | `https://novapouch.fly.dev` (배포 전 진행 중인 게임 확인용) |

`APP_URL`을 설정하면 배포 직전에 `/api/health`의 `activeGames`를 확인하고, 진행 중인 게임이 있으면 배포를 미룹니다. 모임이 끝난 뒤 **Actions → Deploy → Run workflow**로 직접 실행하면 됩니다. 급할 때는 `force`를 켜서 바로 배포할 수 있습니다.

## 운영

```bash
# 운영 지표 (완주율, 소요 시간, 기여 균형, 재방문, 신고 등)
fly ssh console -C "sh -c 'cd /app/apps/server && DATA_DIR=/data pnpm metrics'"

# 로그
fly logs

# 기록 백업 (모임 뒤 한 번씩)
fly ssh sftp get /data/worlds.json ./backup-worlds.json
fly ssh sftp get /data/events.jsonl ./backup-events.jsonl
fly ssh sftp get /data/reports.jsonl ./backup-reports.jsonl

# 문제가 생기면 이전 이미지로 되돌리기
fly releases
fly deploy --image ghcr.io/h2dj/novapouch:<이전 커밋 해시>
```

신고 내용은 `/data/reports.jsonl`에 쌓입니다. 운영 테스트 기간에는 모임이 끝날 때마다 확인하세요.

## 다른 곳에 배포할 때

Docker가 돌아가는 서버라면 같은 이미지를 씁니다. WebSocket을 지원하는 프록시 뒤에 두고, `/data`를 영구 저장소에 연결하세요.

```bash
docker run -d --name novapouch --restart unless-stopped \
  -p 8787:8787 -v novapouch-data:/data \
  -e ACCESS_CODE='원하는-코드' -e TRUST_PROXY=1 \
  ghcr.io/h2dj/novapouch:latest
```

GHCR 패키지가 비공개라면 먼저 `docker login ghcr.io`가 필요합니다. Render는 영구 디스크가 유료 요금제에서만 되므로, 무료로 시험할 때는 Fly.io를 권합니다.

## 배포 전 확인 목록

- [ ] `ACCESS_CODE` 설정
- [ ] 외부 공개라면 `APP_BRAND`에 가칭 설정
- [ ] 볼륨 연결 확인 (`fly volumes list`)
- [ ] `/api/health` 응답 확인
- [ ] 휴대폰 두 대로 방 만들기 → 초대 링크로 입장 → 한 판 완주
- [ ] 모임 일정과 겹치지 않는 시간에 배포
