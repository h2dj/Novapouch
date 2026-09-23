import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 8799);
export const accessPort = port - 1;
const executablePath = process.env.CHROMIUM_PATH ?? (process.env.PLAYWRIGHT_BROWSERS_PATH ? '/opt/pw-browsers/chromium' : undefined);

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    launchOptions: executablePath ? { executablePath } : undefined,
    locale: 'ko-KR',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // 운영 빌드를 서버가 그대로 내보내는 구성으로 검사한다 (빌드는 pnpm e2e가 먼저 한다)
      command: `rm -rf /tmp/novapouch-e2e && DATA_DIR=/tmp/novapouch-e2e PORT=${port} pnpm --filter @novapouch/server start`,
      cwd: '../..',
      url: `http://127.0.0.1:${port}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // 배포 설정(접근 코드, 가칭)을 켠 서버
      command: `rm -rf /tmp/novapouch-e2e-access && DATA_DIR=/tmp/novapouch-e2e-access PORT=${accessPort} ACCESS_CODE=reading-club APP_BRAND="빗방울 파우치" pnpm --filter @novapouch/server start`,
      cwd: '../..',
      url: `http://127.0.0.1:${accessPort}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
