const { chromium } = require('playwright');
const baseURL = process.env.LIVE_BASE_URL;
const bypassToken = process.env.LIVE_BYPASS_TOKEN;
const email = process.env.LIVE_TEST_EMAIL;
const password = process.env.LIVE_TEST_PASSWORD;
const assert = (c, m) => { if (!c) throw new Error(m); };
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL, extraHTTPHeaders: { 'x-vercel-protection-bypass': bypassToken }, viewport: { width: 1440, height: 1800 } });
  const page = await context.newPage();
  try {
    await page.goto('/auth?redirectTo=%2Fdashboard', { waitUntil: 'networkidle' });
    await page.getByPlaceholder('you@example.com').fill(email);
    await page.getByPlaceholder('Your password').fill(password);
    await page.getByRole('button', { name: /Log in/i }).last().click();
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });

    const seeded = await page.evaluate(async () => {
      let ok = 0;
      for (let i = 0; i < 12; i += 1) {
        const res = await fetch('/api/buckets/create', { method: 'POST' });
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(`seed failed status=${res.status} message=${payload?.error?.message ?? 'unknown'}`);
        }
        ok += 1;
      }
      return ok;
    });
    assert(seeded === 12, `Expected 12 seeded buckets, got ${seeded}`);

    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));

    const beforeIds = await page.evaluate(async () => {
      const res = await fetch('/api/buckets', { cache: 'no-store' });
      const payload = await res.json();
      return (payload?.data?.buckets ?? []).map((bucket) => bucket.id);
    });
    const beforeSet = new Set(beforeIds);
    const beforeCount = beforeIds.length;
    const beforeScroll = await page.evaluate(() => window.scrollY);

    await page.getByRole('button', { name: /Create Bucket/i }).click();

    let afterCount = beforeCount;
    for (let i = 0; i < 30; i += 1) {
      const res = await page.request.get(`${baseURL}/api/buckets`, { headers: { 'x-vercel-protection-bypass': bypassToken } });
      const payload = await res.json();
      afterCount = (payload?.data?.buckets ?? []).length;
      if (afterCount === beforeCount + 1) break;
      await page.waitForTimeout(200);
    }
    assert(afterCount === beforeCount + 1, `Count mismatch ${beforeCount}->${afterCount}`);

    const afterIds = await page.evaluate(async () => {
      const res = await fetch('/api/buckets', { cache: 'no-store' });
      const payload = await res.json();
      return (payload?.data?.buckets ?? []).map((bucket) => bucket.id);
    });
    const createdId = afterIds.find((id) => !beforeSet.has(id));
    assert(Boolean(createdId), 'No created bucket id found');

    const afterScroll = await page.evaluate(() => window.scrollY);
    assert(afterScroll > beforeScroll + 120, `Auto-scroll did not trigger before=${beforeScroll} after=${afterScroll}`);

    await page.locator(`section#bucket-${createdId}`).waitFor({ state: 'visible', timeout: 15000 });

    const go = await page.request.post(`${baseURL}/api/buckets/${createdId}/go`, { headers: { 'x-vercel-protection-bypass': bypassToken } });
    assert(go.ok(), 'GO request failed');

    let status = '';
    for (let i = 0; i < 30; i += 1) {
      const res = await page.request.get(`${baseURL}/api/buckets`, { headers: { 'x-vercel-protection-bypass': bypassToken } });
      const payload = await res.json();
      const bucket = (payload?.data?.buckets ?? []).find((item) => item.id === createdId);
      status = bucket?.status ?? '';
      if (status === 'FAILED') break;
      await page.waitForTimeout(400);
    }
    assert(status === 'FAILED', `Expected FAILED, got ${status || 'none'}`);

    await page.reload({ waitUntil: 'networkidle' });
    await page.getByTestId(`bucket-trash-open-${createdId}`).click();
    await page.getByTestId(`bucket-trash-soft-${createdId}`).waitFor({ state: 'visible', timeout: 15000 });
    await page.getByTestId(`bucket-trash-hard-${createdId}`).waitFor({ state: 'visible', timeout: 15000 });

    await page.getByTestId(`bucket-trash-soft-${createdId}`).click();
    await page.locator(`section#bucket-${createdId}`).waitFor({ state: 'detached', timeout: 15000 });
    await page.locator(`[data-trash-bucket-id='${createdId}']`).waitFor({ state: 'visible', timeout: 15000 });

    await page.getByTestId(`trash-restore-${createdId}`).click();
    await page.locator(`section#bucket-${createdId}`).waitFor({ state: 'visible', timeout: 15000 });
    await page.locator(`[data-trash-bucket-id='${createdId}']`).waitFor({ state: 'detached', timeout: 15000 });

    await page.getByTestId(`bucket-trash-open-${createdId}`).click();
    await page.getByTestId(`bucket-trash-hard-${createdId}`).click();
    await page.locator(`section#bucket-${createdId}`).waitFor({ state: 'detached', timeout: 15000 });

    const final = await page.evaluate(async (bucketId) => {
      const [active, trash] = await Promise.all([
        fetch('/api/buckets', { cache: 'no-store' }),
        fetch('/api/buckets/trash', { cache: 'no-store' }),
      ]);
      const activePayload = await active.json();
      const trashPayload = await trash.json();
      return {
        inActive: (activePayload?.data?.buckets ?? []).some((bucket) => bucket.id === bucketId),
        inTrash: (trashPayload?.data?.trashedBuckets ?? []).some((bucket) => bucket.id === bucketId),
      };
    }, createdId);

    assert(!final.inActive, 'Bucket still in active list after permanent delete');
    assert(!final.inTrash, 'Bucket still in trash list after permanent delete');

    console.log('LIVE_VERIFY_RESULT=PASS');
    console.log(`LIVE_VERIFY_BUCKET_ID=${createdId}`);
    console.log(`LIVE_VERIFY_SCROLL_BEFORE=${beforeScroll}`);
    console.log(`LIVE_VERIFY_SCROLL_AFTER=${afterScroll}`);
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((err) => {
  console.error('LIVE_VERIFY_RESULT=FAIL');
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
