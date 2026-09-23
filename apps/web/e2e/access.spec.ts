import { expect, test } from '@playwright/test';
import { accessPort } from '../playwright.config';

const base = `http://127.0.0.1:${accessPort}`;

test('invite-only server asks for the code and invite links carry it', async ({ browser }) => {
  const host = await (await browser.newContext()).newPage();
  await host.goto(base);
  await expect(host.getByRole('heading', { name: '초대받은 사람만 들어올 수 있어요' })).toBeVisible();
  await expect(host).toHaveTitle('빗방울 파우치');

  await host.getByLabel('접근 코드').fill('wrong');
  await host.getByRole('button', { name: '들어가기' }).click();
  await expect(host.getByRole('alert')).toContainText('코드가 맞지 않아요');

  await host.getByLabel('접근 코드').fill('reading-club');
  await host.getByRole('button', { name: '들어가기' }).click();
  await expect(host.getByText('빗방울 파우치').first()).toBeVisible();
  // 가칭 빌드에서는 작품 이름을 보여 주지 않는다
  await expect(host.getByText('비구름을 따라서')).toHaveCount(0);

  await host.getByRole('button', { name: '새 세계 발견' }).click();
  await host.getByLabel('닉네임').fill('보민');
  await host.getByRole('button', { name: '방에 들어가기' }).click();
  await expect(host.getByText('WAITING ROOM')).toBeVisible();

  const guestCtx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  await host.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await host.getByRole('button', { name: '초대 링크 보내기' }).click();
  const link = await host.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/r\/[2-9A-Z]{4}\?k=reading-club$/);

  // 초대 링크로 오면 접근 코드 화면 없이 바로 닉네임을 묻는다
  const guest = await guestCtx.newPage();
  await guest.goto(link);
  await guest.getByLabel('닉네임').fill('은서');
  await guest.getByRole('button', { name: '방에 들어가기' }).click();
  await expect(guest.getByText('2 / 6명')).toBeVisible();
  expect(new URL(guest.url()).search).toBe('');
});
