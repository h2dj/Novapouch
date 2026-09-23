import { readFileSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';

const shots = process.env.SCREENSHOT_DIR;
async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}

async function player(browser: Browser, mobile: boolean) {
  const ctx = await browser.newContext(
    mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 800 } },
  );
  return ctx.newPage();
}

async function joinAs(page: Page, name: string) {
  await page.getByLabel('닉네임').fill(name);
  await page.getByRole('button', { name: '방에 들어가기' }).click();
  await expect(page.getByText('WAITING ROOM')).toBeVisible();
}

/** 조건에 맞는 화면을 가진 플레이어를 찾는다 */
async function whoever(pages: Page[], check: (p: Page) => Promise<boolean>): Promise<Page> {
  for (let i = 0; i < 100; i++) {
    for (const p of pages) if (await check(p)) return p;
    await pages[0]!.waitForTimeout(150);
  }
  throw new Error('no page matched');
}

test('three people finish a world together', async ({ browser }) => {
  const host = await player(browser, false);
  const eunseo = await player(browser, true);
  const jaehyun = await player(browser, true);
  const all = [host, eunseo, jaehyun];

  await host.goto('/');
  await shot(host, '01-home-desktop');
  await eunseo.goto('/');
  await shot(eunseo, '01-home-mobile');

  await host.getByRole('button', { name: '새 세계 발견' }).click();
  await expect(host).toHaveURL(/\/r\/[2-9A-Z]{4}$/);
  const code = host.url().split('/').pop()!;
  await joinAs(host, '보민');

  await eunseo.getByPlaceholder('초대 코드 입력').fill(code);
  await eunseo.getByRole('button', { name: '들어가기' }).click();
  await joinAs(eunseo, '은서');
  await jaehyun.goto(`/r/${code}`);
  await joinAs(jaehyun, '재현');

  await expect(host.getByText('3 / 6명')).toBeVisible();
  await host.getByRole('button', { name: '라운드 줄이기' }).click();
  await host.getByRole('button', { name: '라운드 줄이기' }).click();
  await expect(eunseo.getByText('3회')).toBeVisible();
  await shot(host, '02-lobby-desktop');
  await shot(eunseo, '02-lobby-mobile');
  await expect(eunseo.getByRole('button', { name: '파우치 열기' })).toHaveCount(0);
  await host.getByRole('button', { name: '파우치 열기' }).click();

  // 방장은 첫 발견자 대신 파우치를 열 수 있다
  await host.getByRole('button', { name: /A 파우치 열기/ }).click();
  await shot(host, '03-draw-desktop');
  await host.getByRole('button', { name: /B 파우치 열기/ }).click();
  await expect(host.getByRole('heading', { name: '잠시 상상해 보세요' })).toBeVisible();
  await shot(eunseo, '03-imagine-mobile');

  const namer = await whoever(all, async (p) => (await p.locator('#obj-name').count()) > 0);
  await namer.locator('#obj-name').fill('빗기억 거름우산');
  await namer.locator('#obj-use').fill('비를 막지 않는다. 구멍마다 하늘의 기억을 걸러 모은다.');
  await shot(namer, '04-naming');
  await namer.getByRole('button', { name: '발견 카드 공개' }).click();

  for (let round = 1; round <= 3; round++) {
    const picker = await whoever(all, async (p) => (await p.getByRole('heading', { name: '질문 카드를 골라 주세요' }).count()) > 0);
    if (round === 1) await shot(picker, '05-pick');
    await picker.locator('.question-choice').first().click();

    for (const [i, p] of all.entries()) {
      await expect(p.locator('#my-sentence')).toBeVisible();
      if (round === 2 && p === jaehyun) {
        // 쓰던 문장은 새로고침해도 남는다
        await p.locator('#my-sentence').fill('돌아와서 마저 쓴 문장');
        await expect(p.getByText('자동 저장됨')).toBeVisible();
        await p.reload();
        await expect(p.locator('#my-sentence')).toHaveValue('돌아와서 마저 쓴 문장');
        await p.getByRole('button', { name: '문장 보내기' }).click();
        continue;
      }
      if (round === 3 && p === eunseo) {
        // 조용한 참여: 선택지로 답한다
        await p.locator('.composer .row.wrap .btn').first().click();
        continue;
      }
      await p.locator('#my-sentence').fill(`${['보민', '은서', '재현'][i]}의 ${round}번째 조각`);
      if (round === 1 && i === 1) {
        await shot(p, '06-explore-mobile');
      }
      await p.getByRole('button', { name: '문장 보내기' }).click();
      if (round === 1 && i === 0) await shot(p, '06-explore-desktop-quiet');
    }
  }

  await expect(host.getByRole('heading', { name: /장소를 하나 골라/ })).toBeVisible();
  await host.getByPlaceholder(/비가 멈추지 않는/).fill('비가 멈추지 않는 지붕 도시');
  await host.getByRole('button', { name: '제안', exact: true }).click();
  await expect(eunseo.getByText('비가 멈추지 않는 지붕 도시')).toBeVisible();
  for (const p of all) {
    await p.getByText('비가 멈추지 않는 지붕 도시').click();
    if (p === host) await shot(p, '07-connect-desktop');
    if (p === eunseo) await shot(p, '07-connect-mobile');
    await p.getByRole('button', { name: '투표 보내기' }).click();
  }
  await expect(host.getByRole('heading', { name: /사람이나 존재/ })).toBeVisible();
  await host.getByRole('button', { name: '지금 마감하기 · 방장' }).click();
  await expect(host.getByRole('heading', { name: /규칙 3개/ })).toBeVisible();
  const boxes = host.locator('.candidate input[type=checkbox]');
  for (let i = 0; i < 3; i++) await boxes.nth(i).check();
  await host.getByRole('button', { name: '투표 보내기' }).click();
  await host.getByRole('button', { name: '지금 마감하기 · 방장' }).click();
  await expect(host.getByRole('heading', { name: /사건을 하나/ })).toBeVisible();
  await host.getByRole('button', { name: '지금 마감하기 · 방장' }).click();

  await expect(host.getByRole('heading', { name: /세계에 이름을 붙이고/ })).toBeVisible();
  await eunseo.getByPlaceholder('예: 비의 기억을 거르는 도시').fill('비의 기억을 거르는 도시');
  await eunseo.getByRole('button', { name: '이름 제안' }).click();
  for (const p of all) {
    await p.getByText('비의 기억을 거르는 도시', { exact: true }).click();
  }
  await eunseo.getByRole('button', { name: '여운' }).first().click({ trial: false }).catch(() => undefined);
  await shot(host, '08-record-desktop');
  await shot(eunseo, '08-record-mobile');
  await host.getByRole('button', { name: '성운에 저장' }).click();

  for (const p of all) await expect(p.getByRole('heading', { name: '비의 기억을 거르는 도시' })).toBeVisible();
  await expect(host.getByText('비가 멈추지 않는 지붕 도시')).toBeVisible();
  await shot(host, '09-done-desktop');
  await shot(jaehyun, '09-done-mobile');

  const download = host.waitForEvent('download');
  await host.getByRole('button', { name: '이미지로 내보내기' }).click();
  // 헤드리스 Chromium은 한글 파일 이름을 "download"로 바꾸므로 내용이 PNG인지 확인한다
  const file = await (await download).path();
  const bytes = readFileSync(file);
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  expect(bytes.length).toBeGreaterThan(20_000);

  await eunseo.getByRole('button', { name: '성운 기록' }).click();
  await expect(eunseo.getByRole('link', { name: /비의 기억을 거르는 도시/ }).first()).toBeVisible();
  await shot(eunseo, '10-nebula-mobile');
  await eunseo.getByRole('link', { name: /비의 기억을 거르는 도시/ }).first().click();
  await expect(eunseo.getByText('누가 어떤 질문에서 무엇을 보탰나')).toBeVisible();
  await shot(eunseo, '11-world-mobile');
});
