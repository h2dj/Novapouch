# AWS EC2 배포

서울 리전(ap-northeast-2)의 EC2 서버 한 대에 노바 파우치를 올리는 절차입니다. CloudFormation 템플릿 하나로 서버, 고정 IP, 방화벽, 백업용 S3 버킷, GitHub Actions 배포 권한을 한꺼번에 만듭니다.

## 구성

```
휴대폰 ──HTTPS──▶ Elastic IP ──▶ EC2 (Ubuntu 24.04, 서울)
                                   ├─ Caddy      : 80/443, Let's Encrypt 인증서 자동 발급, WebSocket 중계
                                   ├─ 게임 서버   : ghcr.io/h2dj/novapouch (127.0.0.1:8787)
                                   └─ /opt/novapouch/data : 세계 기록·신고·로그 ──매일 04시──▶ S3 버킷

GitHub Actions(main 병합) ──OIDC──▶ 배포 역할 ──SSM Run Command──▶ /opt/novapouch/update.sh
```

- **SSH 없이 운영합니다.** 서버 접속은 AWS Session Manager로, 배포는 SSM Run Command로 합니다. 22번 포트는 기본으로 닫혀 있습니다.
- **서버는 한 대만.** 방 상태가 메모리에 있어 여러 대로 늘리면 안 됩니다. 업데이트·재시작 때 진행 중인 게임은 사라지므로, 업데이트 스크립트가 진행 중인 게임이 있으면 미룹니다.

| 파일 | 역할 |
|---|---|
| `deploy/aws/cloudformation.yaml` | 서버·보안 그룹·Elastic IP·IAM 역할·S3 버킷·GitHub OIDC 배포 역할 |
| `deploy/aws/files/bootstrap.sh` | 새 서버 초기 설정 (Docker, 스왑 2GB, 자동 보안 업데이트, 백업 cron, 첫 실행) |
| `deploy/aws/files/compose.yaml` | 게임 서버 + Caddy 실행 구성 |
| `deploy/aws/files/Caddyfile` | HTTPS와 프록시 설정 |
| `deploy/aws/files/update.sh` | 새 이미지 받아 재시작. 진행 중인 게임이 있으면 미룸(종료 코드 3), 업데이트 전 백업 |
| `deploy/aws/files/backup.sh` | `data/`를 묶어 서버에 14개 보관 + S3 업로드 |

CI가 매 PR마다 셸 스크립트와 템플릿을 검사하고, 같은 `compose.yaml`·`Caddyfile`로 서버를 실제로 띄워 HTTPS 프록시 경로(`/api`, `/socket.io`)를 확인합니다.

## 비용 (서울 리전, 온디맨드 기준 대략)

| 항목 | 월 비용 |
|---|---|
| EC2 t3.micro (기본값, 1GB + 스왑 2GB) | 약 9.5달러 · t3.small(2GB)이면 약 19달러 |
| EBS gp3 20GB | 약 2달러 |
| 공인 IPv4 (Elastic IP) | 약 3.6달러 |
| S3 백업 | 1달러 미만 |
| **합계 (t3.micro)** | **약 15달러** |

정확한 금액은 [EC2 요금](https://aws.amazon.com/ec2/pricing/on-demand/)에서 확인하세요. 프리 티어 적용 여부는 계정을 만든 시점에 따라 다릅니다. 독서모임 몇 팀 규모에는 t3.micro로 충분합니다.

## 첫 배포 절차

### 0. 준비

1. **AWS 계정**과 콘솔 오른쪽 위 리전을 **서울(ap-northeast-2)** 로 맞춥니다.
2. **도메인**(선택, 권장): `play.example.com`처럼 쓸 주소를 정합니다. 도메인이 없으면 우선 공인 IP의 HTTP로 띄우고 나중에 바꿀 수 있지만, 휴대폰 브라우저의 일부 기능(클립보드 복사, 공유 시트)은 HTTPS에서만 동작합니다.
3. **GHCR 이미지 공개**: 서버가 토큰 없이 이미지를 받도록 공개로 바꿉니다. 저장소가 공개라 이미지에도 새로 드러나는 내용은 없습니다.
   - GitHub → 프로필 → **Packages** → `novapouch` → **Package settings** → **Change visibility** → **Public**
   - 공개하지 않으려면 서버에서 `read:packages` 권한만 준 토큰으로 `docker login ghcr.io`를 한 번 해 두면 됩니다.
4. **접근 코드**를 정합니다. 영문·숫자·`. _ -`만, 4자 이상.

### 1. CloudFormation 스택 만들기

**콘솔에서**

1. [템플릿 파일](../deploy/aws/cloudformation.yaml)을 내려받습니다 (GitHub에서 Raw → 저장).
2. CloudFormation → **스택 생성** → **새 리소스 사용** → **템플릿 파일 업로드** → 파일 선택.
3. 스택 이름 `novapouch`, 매개변수 입력:

| 매개변수 | 값 |
|---|---|
| DomainName | `play.example.com` (없으면 비움) |
| AccessCode | 정한 접근 코드 |
| AppBrand | 비움 (외부 공개 때만 가칭) |
| InstanceType | `t3.micro` |
| SshCidr, KeyName | 비움 (SSH가 꼭 필요할 때만 내 IP `x.x.x.x/32`와 키 페어) |
| GitHubRepository | `h2dj/Novapouch` |
| CreateGitHubOidcProvider | `true` (이 계정에 이미 GitHub OIDC 공급자가 있으면 `false`) |

4. 마지막 화면에서 **"AWS CloudFormation에서 IAM 리소스를 생성할 수 있음을 승인합니다"** 를 체크하고 생성합니다. 5분 안팎 걸립니다.

**AWS CLI로**

```bash
aws cloudformation deploy --region ap-northeast-2 \
  --stack-name novapouch \
  --template-file deploy/aws/cloudformation.yaml \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides DomainName=play.example.com AccessCode='원하는-코드'
```

> 접근 코드는 서버 시작 스크립트(UserData)에 들어가므로 이 AWS 계정에서 EC2 조회 권한이 있는 사람은 볼 수 있습니다. 모임용 공유 코드라 괜찮지만, 계정을 여러 사람이 쓴다면 첫 배포 뒤 코드를 바꾸세요(아래 운영 절).

### 2. 출력값 확인

스택의 **출력** 탭에서 확인합니다.

| 출력 | 쓰는 곳 |
|---|---|
| `PublicIp` | 도메인 A 레코드 |
| `Url` | 접속 주소 |
| `InstanceId` | GitHub 변수 `EC2_INSTANCE_ID` |
| `DeployRoleArn` | GitHub 변수 `AWS_DEPLOY_ROLE_ARN` |
| `BackupBucketName` | 백업 위치 |
| `SessionManager` | 서버 접속 명령 |

### 3. 도메인 연결

도메인 DNS(Route 53이든 다른 곳이든)에 **A 레코드: `play.example.com` → PublicIp** 를 추가합니다. DNS가 퍼지면 Caddy가 몇 분 안에 인증서를 받아 HTTPS로 엽니다. 따로 할 일은 없습니다.

### 4. 동작 확인

```bash
curl https://play.example.com/api/health
# {"ok":true,"activeGames":0}
```

브라우저로 접속해 접근 코드 화면이 뜨는지, 방을 만들고 다른 휴대폰이 초대 링크로 바로 들어오는지 확인합니다. 그다음 [운영 테스트 대본](PLAYTEST_SCRIPT.md)의 사전 준비로 넘어가면 됩니다.

응답이 없으면 서버에 접속해 첫 설정 기록을 봅니다.

```bash
aws ssm start-session --target <InstanceId> --region ap-northeast-2
sudo tail -n 50 /var/log/novapouch-bootstrap.log
cd /opt/novapouch && sudo docker compose ps && sudo docker compose logs --tail 50
```

### 5. GitHub 자동 배포 켜기

저장소 **Settings → Secrets and variables → Actions → Variables** 에 추가합니다 (모두 Variables, 시크릿은 필요 없습니다).

| 이름 | 값 |
|---|---|
| `DEPLOY_TARGET` | `ec2` |
| `AWS_DEPLOY_ROLE_ARN` | 출력값 `DeployRoleArn` |
| `EC2_INSTANCE_ID` | 출력값 `InstanceId` |
| `AUTO_DEPLOY` | `true` (main 병합마다 자동 배포. 수동으로만 하려면 넣지 않음) |
| `AWS_REGION` | 서울이 아닐 때만 |

이후 `main`의 CI가 통과하면 Deploy 워크플로가 이미지를 GHCR에 올리고, OIDC로 배포 역할을 받아 서버의 `update.sh`를 실행합니다. 진행 중인 게임이 있으면 경고만 남기고 배포를 미룹니다. 모임이 끝난 뒤 **Actions → Deploy → Run workflow** 로 다시 실행하고, 급하면 `force`를 켭니다.

첫 연결 확인은 **Run workflow**로 한 번 수동 실행해 "업데이트 완료"가 찍히는지 보면 됩니다.

## 운영

서버 명령은 모두 Session Manager 접속 뒤 `cd /opt/novapouch`에서 실행합니다.

| 하고 싶은 일 | 명령 |
|---|---|
| 서버 접속 | `aws ssm start-session --target <InstanceId> --region ap-northeast-2` (또는 콘솔 EC2 → 연결 → Session Manager) |
| 수동 업데이트 | `sudo ./update.sh` (진행 중인 게임이 있어도: `--force`) |
| 로그 | `sudo docker compose logs -f app` |
| 운영 지표 | `sudo docker compose exec app sh -c 'cd /app/apps/server && pnpm metrics'` |
| 접근 코드·가칭·도메인 변경 | `sudo nano .env` 수정 후 `sudo docker compose up -d` |
| 즉시 백업 | `sudo ./backup.sh` → `backups/`와 S3 `backups/` |
| 백업 내려받기 | `aws s3 ls s3://<BackupBucketName>/backups/` → `aws s3 cp s3://.../파일 .` |
| 이전 이미지로 되돌리기 | `.env`에 `IMAGE=ghcr.io/h2dj/novapouch:<커밋 해시>` 추가 → `sudo docker compose up -d` (원래대로는 그 줄을 지우고 `sudo ./update.sh`) |

**백업에서 복구**

```bash
sudo docker compose stop app
sudo tar -xzf backups/novapouch-YYYYMMDD-HHMMSS.tar.gz -C /opt/novapouch   # data/ 를 덮어씀
sudo docker compose start app
```

**보안 메모**

- 22번 포트는 닫혀 있고, 인스턴스 메타데이터는 IMDSv2만 허용합니다.
- 우분투 보안 업데이트는 자동 적용됩니다. 커널 업데이트 뒤 재부팅이 필요하면 모임이 없는 시간에 `sudo reboot` 하세요. 컨테이너는 자동으로 다시 뜹니다.
- GitHub 배포 역할은 `main` 브랜치에서 실행된 워크플로만, 이 인스턴스에 `AWS-RunShellScript`를 보내는 권한만 가집니다.

## 정리 (삭제)

CloudFormation에서 스택을 삭제하면 서버·IP·역할이 지워집니다. **S3 백업 버킷은 기록 보호를 위해 남습니다.** 필요 없으면 버킷을 비운 뒤 따로 삭제하세요.

## CloudFormation 없이 직접 만들 때

1. EC2 → 인스턴스 시작: Ubuntu Server 24.04 LTS(x86), t3.micro, 저장소 20GB gp3.
2. 보안 그룹: 80, 443(TCP)과 443(UDP)을 전체에 열고, SSH는 내 IP만.
3. Elastic IP를 할당해 인스턴스에 연결.
4. SSH로 접속해 실행:

```bash
curl -fsSL https://raw.githubusercontent.com/h2dj/Novapouch/main/deploy/aws/files/bootstrap.sh -o bootstrap.sh
sudo DOMAIN=play.example.com ACCESS_CODE='원하는-코드' bash bootstrap.sh
```

이 방식은 S3 백업과 GitHub 자동 배포 권한이 없습니다. 백업은 서버의 `backups/`에만 쌓이고, 배포는 `sudo ./update.sh`로 직접 합니다.
