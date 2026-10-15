#!/usr/bin/env bash
# 새 Ubuntu 24.04 EC2 서버를 노바 파우치 서버로 만든다. root로 한 번 실행한다.
# CloudFormation 템플릿은 UserData로 이 스크립트를 실행하고, 수동으로 만들 때는 SSH에서 직접 실행한다.
#   sudo DOMAIN=play.example.com ACCESS_CODE=코드 bash bootstrap.sh
# 환경 변수: DOMAIN(없으면 :80), ACCESS_CODE(필수 권장), APP_BRAND, BACKUP_BUCKET
set -euo pipefail

DIR=/opt/novapouch
RAW_BASE=${RAW_BASE:-https://raw.githubusercontent.com/h2dj/Novapouch/main/deploy/aws/files}

timedatectl set-timezone Asia/Seoul || true

# 메모리가 작은 인스턴스(t3.micro)를 위해 2GB 스왑을 만든다
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Docker와 AWS CLI
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker
if ! command -v aws >/dev/null; then
  snap install aws-cli --classic || echo "경고: AWS CLI 설치 실패. S3 백업은 건너뜁니다."
fi

# 보안 업데이트 자동 적용 (Ubuntu 기본값을 확실히 켠다)
apt-get install -y unattended-upgrades >/dev/null
dpkg-reconfigure -f noninteractive unattended-upgrades

mkdir -p "$DIR/data" "$DIR/backups"
cd "$DIR"
for f in compose.yaml Caddyfile update.sh backup.sh; do
  curl -fsSL "$RAW_BASE/$f" -o "$f"
done
chmod +x update.sh backup.sh

if [ ! -f .env ]; then
  umask 077
  cat > .env <<ENV
DOMAIN=${DOMAIN:-:80}
ACCESS_CODE=${ACCESS_CODE:-}
APP_BRAND=${APP_BRAND:-}
BACKUP_BUCKET=${BACKUP_BUCKET:-}
ENV
fi

# 매일 새벽 4시 백업
echo "0 4 * * * root $DIR/backup.sh >> /var/log/novapouch-backup.log 2>&1" > /etc/cron.d/novapouch-backup

if ! docker compose pull; then
  echo "이미지를 받지 못했습니다. GHCR 패키지가 공개인지 확인한 뒤 'sudo $DIR/update.sh --force'를 실행하세요."
  exit 1
fi
docker compose up -d
echo "노바 파우치 서버 준비 완료: $(grep ^DOMAIN= .env)"
