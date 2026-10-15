#!/usr/bin/env bash
# 새 이미지를 받아 다시 띄운다. 진행 중인 게임이 있으면 미룬다(종료 코드 3).
#   sudo /opt/novapouch/update.sh            # 기본
#   sudo /opt/novapouch/update.sh --force    # 진행 중인 게임이 있어도
set -euo pipefail

DIR=/opt/novapouch
RAW_BASE=${RAW_BASE:-https://raw.githubusercontent.com/h2dj/Novapouch/main/deploy/aws/files}
cd "$DIR"

health() { curl -fsS --max-time 5 http://127.0.0.1:8787/api/health 2>/dev/null || true; }

if [ "${1:-}" != "--force" ]; then
  active=$(health | sed -n 's/.*"activeGames":\([0-9]*\).*/\1/p')
  if [ -n "$active" ] && [ "$active" != "0" ]; then
    echo "진행 중인 게임이 ${active}개 있어 업데이트를 미룹니다. 끝난 뒤 다시 실행하거나 --force를 쓰세요."
    exit 3
  fi
fi

# 배포 파일을 저장소 main의 최신으로 맞춘다 (.env와 data는 건드리지 않는다)
for f in compose.yaml Caddyfile backup.sh update.sh; do
  if curl -fsSL --max-time 20 "$RAW_BASE/$f" -o "$f.new"; then
    mv "$f.new" "$f"
  else
    rm -f "$f.new"
    echo "경고: $f 를 받지 못해 기존 파일을 씁니다."
  fi
done
chmod +x update.sh backup.sh

# 업데이트 전에 기록을 한 번 백업한다
./backup.sh || echo "경고: 백업에 실패했지만 업데이트는 계속합니다."

if ! docker compose pull app; then
  echo "이미지를 받지 못했습니다. GHCR 패키지가 비공개라면 docs/DEPLOY_EC2.md의 'GHCR 이미지 공개'를 확인하세요."
  exit 1
fi
docker compose up -d --remove-orphans

for _ in $(seq 1 30); do
  if health | grep -q '"ok":true'; then
    echo "업데이트 완료: $(docker compose images app --format '{{.Repository}}:{{.Tag}} {{.ID}}' 2>/dev/null | head -1)"
    docker image prune -f >/dev/null
    exit 0
  fi
  sleep 2
done
echo "서버가 60초 안에 응답하지 않습니다. 'docker compose logs app'을 확인하세요."
docker compose logs --tail 50 app
exit 1
