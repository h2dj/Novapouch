#!/usr/bin/env bash
# 세계 기록·차단·신고·이벤트 로그를 묶어 보관한다.
# 서버에는 최근 14개를 남기고, .env에 BACKUP_BUCKET이 있으면 S3에도 올린다.
set -euo pipefail

DIR=/opt/novapouch
cd "$DIR"
mkdir -p backups data

BACKUP_BUCKET=$(sed -n 's/^BACKUP_BUCKET=//p' .env 2>/dev/null | tail -1)
name="novapouch-$(date +%Y%m%d-%H%M%S).tar.gz"
tar -czf "backups/$name" -C "$DIR" data
# 파일 이름은 이 스크립트가 만든 형식뿐이라 ls로 충분하다
# shellcheck disable=SC2012
ls -1t backups/novapouch-*.tar.gz | tail -n +15 | xargs -r rm -f

if [ -n "$BACKUP_BUCKET" ] && command -v aws >/dev/null; then
  aws s3 cp --only-show-errors "backups/$name" "s3://$BACKUP_BUCKET/backups/$name"
fi
echo "백업: backups/$name"
