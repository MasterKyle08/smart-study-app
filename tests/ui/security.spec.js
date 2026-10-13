const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const { contrast } = require('./contrast');

const malicious = '<img src=x onerror="window.auditXss=1">';
const question = { id: 'q1', questionText: 'What is one plus one?', questionType: 'multiple_choice', options: ['1', '2', '3', '4'], correctAnswer: '2', briefExplanation: 'The answer is two.' };
const privateQuiz = { id: 1, userId: 9999, slug: 'private-fixture', title: 'Private fixture quiz', isPublic: false, quiz: [question], questionCount: 1, tags: [], quizUrl: '/quiz/private-fixture', sourceText: 'Private reference notes.' };

test.beforeEach(async ({ page }) => {
  fs.mkdirSync('.local/artifacts', { recursive: true });
  await page.addInitScript(() => localStorage.setItem('userEmail', 'reader@local.test'));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    let body = {};
    if (url.pathname === '/api/auth/me') body = { user: { id: 9999, email: 'reader@local.test', plan: 'free', isAdmin: false } };
    else if (url.pathname === '/api/usage/status') body = { community: { gemmaUsed: 0, gemmaBudget: 1500, estimatedInputTokens: 0, estimatedOutputTokens: 0 }, you: { jobsUsed: 0, jobsLimit: 24, jobsRemaining: 24, plan: 'free' } };
    else if (url.pathname === '/api/billing/config') body = { premiumEnabled: false, providers: {}, ads: { enabled: false }, monthlyPriceLabel: '$5 / month' };
    else if (url.pathname === '/api/study/sessions') body = { sessions: [{ id: 2, original_filename: 'Recent fixture', created_at: '2026-10-13T12:00:00Z', summary: 'A preview.' }], nextCursor: null };
    else if (url.pathname === '/api/study/flashcard-reviews') body = { reviews: [{ term: malicious, dueAt: '2020-01-01T00:00:00Z' }] };
    else if (url.pathname === '/api/premade/mine/list') body = { quizzes: [privateQuiz] };
    else if (url.pathname === '/api/premade') body = { quizzes: [] };
    else if (url.pathname.startsWith('/api/premade/')) body = { quiz: privateQuiz };
    return route.fulfill({ json: body });
  });
});

test('stored flashcard markup and progress filenames remain inert in both themes', async ({ page }) => {
  await page.goto('/dashboard');
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => window.applyStudyTheme(value), theme);
    await expect(page.locator('#dueCardsList')).toContainText(malicious);
    await expect(page.locator('#dueCardsList img')).toHaveCount(0);
    expect(await page.evaluate(() => window.auditXss)).toBeUndefined();
  }
  await page.goto('/');
  await page.evaluate(value => window.showProcessingStatus('processingStatus', value, true), malicious);
  await expect(page.locator('#processingStatus')).toContainText(malicious);
  await expect(page.locator('#processingStatus img')).toHaveCount(0);
  expect(await page.evaluate(() => window.auditXss)).toBeUndefined();
});

test('dashboard sign-out calls the server and clears the HttpOnly session cookie', async ({ page, context }) => {
  await context.addCookies([{ name: 'ss_token', value: 'browser-fixture', url: 'http://127.0.0.1:4180', httpOnly: true }]);
  let signedOut = false;
  await page.route('**/api/auth/logout', async route => {
    expect(route.request().method()).toBe('POST');
    signedOut = true;
    await route.fulfill({ json: { message: 'Signed out.' }, headers: { 'set-cookie': 'ss_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax' } });
  });
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Sign out', exact: true }).first().click();
  await expect(page).toHaveURL(/\/index\.html$/);
  expect(signedOut).toBe(true);
  expect((await context.cookies()).find(cookie => cookie.name === 'ss_token')).toBeUndefined();
});

test('load more appends summaries without replacing the current page', async ({ page }) => {
  await page.route('**/api/study/sessions*', async route => {
    const next = new URL(route.request().url()).searchParams.get('before');
    await route.fulfill({ json: { sessions: [{ id: next ? 1 : 2, original_filename: next ? 'Older fixture' : 'Recent fixture', created_at: '2026-10-13T12:00:00Z', summary: 'A preview.' }], nextCursor: next ? null : 1 } });
  });
  await page.goto('/dashboard');
  await expect(page.locator('.session-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Load more sessions' }).click();
  await expect(page.locator('.session-card')).toHaveCount(2);
  await expect(page.locator('#sessionsList')).toContainText('Recent fixture');
  await expect(page.locator('#sessionsList')).toContainText('Older fixture');
  await expect(page.locator('#loadMoreSessions')).toBeHidden();
});

test('creation defaults to private and own private quizzes remain accessible', async ({ page }) => {
  await page.route('**/api/premade', async route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: { quizzes: [] } });
    const submitted = route.request().postDataJSON();
    expect(submitted.isPublic).toBe(false);
    await route.fulfill({ json: { quiz: privateQuiz } });
  });
  await page.goto('/premade');
  await expect(page.locator('#premadeListContainer')).toContainText('Private fixture quiz');
  await expect(page.locator('#premadePublic')).not.toBeChecked();
  for (const theme of ['light', 'dark']) {
    for (const [name, viewport] of Object.entries({ desktop: { width: 1440, height: 1000 }, mobile: { width: 390, height: 844 } })) {
      await page.setViewportSize(viewport);
      await page.evaluate(value => window.applyStudyTheme(value), theme);
      await page.locator('#premadePublic').scrollIntoViewIfNeeded();
      expect((await contrast(page, 'label:has(#premadePublic)')).ratio).toBeGreaterThanOrEqual(4.5);
      await page.screenshot({ path: `.local/artifacts/private-publication-${theme}-${name}.png`, animations: 'disabled' });
    }
  }
  await page.locator('#premadeTitle').fill('A private fixture');
  await page.locator('#premadeSourceText').fill('Private reference notes.');
  await page.locator('#premadeQuizForm button[type="submit"]').click();
  await expect(page.locator('#premadeMetaDisplay')).toContainText('Private quiz - only you can open it');
  await expect(page.locator('#premadeOwnerActions')).toBeVisible();
});

test('publishing requires explicit opt-in', async ({ page }) => {
  let published = false;
  await page.route('**/api/premade', async route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: { quizzes: [] } });
    published = route.request().postDataJSON().isPublic;
    await route.fulfill({ json: { quiz: { ...privateQuiz, isPublic: true } } });
  });
  await page.goto('/premade');
  await page.locator('#premadeTitle').fill('Public fixture');
  await page.locator('#premadePublic').check();
  await page.locator('#premadeQuizForm button[type="submit"]').click();
  await expect.poll(() => published).toBe(true);
});

test('phone settings are available only after admin step-up', async ({ page }) => {
  let unlocked = false;
  await page.route('**/api/auth/me', route => route.fulfill({ json: { user: { id: 9999, email: 'owner@local.test', isAdmin: true } } }));
  const status = () => ({ unlocked, smsConfigured: true, emailConfigured: true, twoFactor: { channel: 'email', destinationMasked: 'owner@local.test', needsPhone: false } });
  await page.route('**/api/admin/status', route => route.fulfill({ json: status() }));
  await page.route('**/api/admin/unlock/start', route => route.fulfill({ json: { message: 'Fixture code requested.' } }));
  await page.route('**/api/admin/unlock/confirm', route => { unlocked = true; return route.fulfill({ json: status() }); });
  await page.route('**/api/admin/users*', route => route.fulfill({ json: { users: [] } }));
  await page.route('**/api/admin/quizzes*', route => route.fulfill({ json: { quizzes: [] } }));
  await page.route('**/api/admin/audit*', route => route.fulfill({ json: { entries: [] } }));
  await page.goto('/admin');
  await expect(page.locator('#phoneEnroll')).toBeHidden();
  await page.locator('#sendUnlockCode').click();
  await page.locator('#unlockCodeInput').fill('123456');
  await page.locator('#confirmUnlockCode').click();
  await expect(page.locator('#adminApp')).toBeVisible();
  await expect(page.locator('#adminApp #phoneEnroll')).toBeVisible();
  for (const theme of ['light', 'dark']) {
    for (const [name, viewport] of Object.entries({ desktop: { width: 1440, height: 1000 }, mobile: { width: 390, height: 844 } })) {
      await page.setViewportSize(viewport);
      await page.evaluate(value => window.applyStudyTheme(value), theme);
      await page.locator('#phoneEnroll').scrollIntoViewIfNeeded();
      expect((await contrast(page, '#phoneEnroll p')).ratio).toBeGreaterThanOrEqual(4.5);
      await page.screenshot({ path: `.local/artifacts/admin-phone-unlocked-${theme}-${name}.png`, animations: 'disabled' });
    }
  }
});

function pdfFixture() {
  const content = 'BT /F1 12 Tf 40 700 Td (Hello secure PDF. This is a local browser fixture containing enough readable study text to avoid any OCR downloads or external services.) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

test('the patched PDF reader and worker extract a real fixture without CDN or provider calls', async ({ page }) => {
  let extracted = '';
  await page.route('**/api/study/process', async route => {
    extracted = route.request().postDataJSON().extractedText;
    await route.fulfill({ json: { summary: 'Secure PDF fixture summary.', warnings: [], savedToAccount: false } });
  });
  await page.goto('/');
  await page.locator('#fileInput').setInputFiles({ name: 'secure-fixture.pdf', mimeType: 'application/pdf', buffer: pdfFixture() });
  await page.locator('#processButton').click();
  await expect.poll(async () => extracted || ((await page.locator('#processingStatus').getAttribute('class'))?.includes('bg-red') ? await page.locator('#processingStatus').textContent() : ''), { timeout: 15000 }).toContain('Hello secure PDF');
  await expect(page.locator('#summaryOutput')).toContainText('Secure PDF fixture summary.', { timeout: 15000 });
  expect(extracted).toContain('Hello secure PDF');
});

test('scanned PDF pages reuse one OCR worker and release both workers after the upload', async ({ page }) => {
  await page.route('**/api/study/process', route => route.fulfill({ json: { summary: 'OCR fixture summary.', warnings: [] } }));
  await page.goto('/');
  await page.evaluate(() => {
    window.auditOcr = { created: 0, recognized: 0, terminated: 0, pdfDestroyed: 0 };
    window.Tesseract = { createWorker: async () => {
      window.auditOcr.created++;
      return {
        recognize: async () => { window.auditOcr.recognized++; return { data: { text: 'Readable fixture OCR text. '.repeat(5) } }; },
        terminate: async () => { window.auditOcr.terminated++; },
      };
    } };
    window.loadPdfReader = async () => ({ getDocument: options => {
      if (options.isEvalSupported !== false) throw new Error('Evaluation must be disabled.');
      return { destroy: async () => { window.auditOcr.pdfDestroyed++; }, promise: Promise.resolve({
        numPages: 2,
        getPage: async () => ({ getTextContent: async () => ({ items: [] }), getViewport: () => ({ width: 100, height: 100 }), render: () => ({ promise: Promise.resolve() }) }),
      }) };
    } });
  });
  await page.locator('#fileInput').setInputFiles({ name: 'scanned-fixture.pdf', mimeType: 'application/pdf', buffer: Buffer.from('Fixture content handled by the isolated PDF mock.') });
  await page.locator('#processButton').click();
  await expect(page.locator('#summaryOutput')).toContainText('OCR fixture summary.');
  await expect.poll(() => page.evaluate(() => window.auditOcr.terminated)).toBe(1);
  expect(await page.evaluate(() => window.auditOcr)).toEqual({ created: 1, recognized: 2, terminated: 1, pdfDestroyed: 1 });
});
