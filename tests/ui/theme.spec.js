const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const { contrast } = require('./contrast');

const quiz = [{ id: 'q1', questionText: 'Which value equals one plus one?', questionType: 'multiple_choice', options: ['1', '2', '3', '4'], correctAnswer: '2', briefExplanation: 'One plus one is two.' }];
const session = { id: 1, original_filename: 'Browser fixture notes', original_content_type: 'text/plain', created_at: '2026-10-12T12:00:00Z', updated_at: '2026-10-12T12:00:00Z', summary: 'A readable local browser fixture summary.', flashcards: JSON.stringify([{ term: 'API', definition: 'An interface for applications.' }]), quiz: JSON.stringify(quiz), extracted_text: 'Fixture text.' };

test.beforeEach(async ({ page }) => {
  // Browser fixtures never relay writes or paid/free API generation to a server.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    let body = {};
    if (url.pathname === '/api/auth/me') {
      const authenticatedPage = /\/(dashboard|admin)/.test(new URL(page.url()).pathname);
      body = { user: authenticatedPage ? { id: 9999, email: 'owner@local.test', plan: 'free', isAdmin: true } : null };
    }
    else if (url.pathname === '/api/usage/status') body = { community: { gemmaUsed: 0, gemmaBudget: 1500, gemmaRemaining: 1500, estimatedInputTokens: 0, estimatedOutputTokens: 0 }, you: { plan: 'free', jobsUsed: 0, jobsLimit: 24, jobsRemaining: 24, jobsPerAd: 1 }, quota: { used: 0, limit: 1500, source: 'smart-study' } };
    else if (url.pathname === '/api/usage/quota') body = { used: 0, limit: 1500 };
    else if (url.pathname === '/api/billing/config') body = { premiumEnabled: false, providers: {}, ads: { enabled: false }, pricing: { amount: '$6', period: 'month', costNotes: [] } };
    else if (url.pathname === '/api/study/sessions') body = { sessions: [session] };
    else if (url.pathname === '/api/study/sessions/1') body = { session };
    else if (url.pathname === '/api/study/practice') body = { quiz };
    else if (url.pathname.includes('quiz-answer-feedback')) body = { feedback: 'Correct: one plus one is two.', correctness: 'correct' };
    else if (url.pathname.includes('/api/admin/gate')) body = { isAdmin: true, isOwner: true, unlocked: false, twoFactor: { channel: 'dev', destinationMasked: 'owner@local.test' }, sessionMinutes: 20 };
    else if (url.pathname.includes('/api/premade')) body = { quizzes: [] };
    else if (url.pathname.includes('due')) body = { cards: [] };
    return route.fulfill({ json: body });
  });
  fs.mkdirSync('.local/artifacts', { recursive: true });
});

async function setTheme(page, theme) {
  await page.evaluate(value => window.applyStudyTheme(value), theme);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}
async function readable(page, selector, pseudo) {
  const result = await contrast(page, selector, pseudo);
  await expect.poll(async () => (await contrast(page, selector, pseudo)).ratio, { timeout: 1500, message: `${selector}: ${JSON.stringify(result)}` }).toBeGreaterThanOrEqual(result.minimum - 0.01);
}

async function capture(page, file, fullPage = false) {
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
  await page.screenshot({ path: `.local/artifacts/${file}`, fullPage, animations: 'disabled' });
}

for (const theme of ['light', 'dark']) {
  test(`${theme}: home links, placeholders, footer, modal and button states are readable`, async ({ page }) => {
    await page.goto('/');
    await setTheme(page, theme);
    for (const selector of ['.hero-kicker', '.nav-link-active', '#dropZone .text-indigo-600', 'footer p', '.btn-accent']) {
      if (await page.locator(selector).count()) await readable(page, selector);
    }
    await readable(page, '#pasteNotesInput', '::placeholder');
    await page.locator('#pasteNotesInput').fill('Local fixture notes for contrast checks.');
    await readable(page, '#processButton');
    await page.locator('#processButton').hover();
    await readable(page, '#processButton');
    const checked = page.locator('input[name="outputFormat"][value="summary"]');
    await expect(checked).toBeChecked();
    if (theme === 'dark') {
      const fill = await checked.evaluate(element => getComputedStyle(element).backgroundColor);
      expect(fill).toBe('rgb(79, 70, 229)');
      const boundary = await contrast(page, '#pasteNotesInput', null, 'borderTopColor');
      expect(boundary.ratio).toBeGreaterThanOrEqual(3);
    }
    await capture(page, `home-${theme}-after.png`, true);
    await page.locator('#loginNavButton').click();
    await expect(page.locator('#authModal')).toHaveAttribute('data-visible', 'true');
    for (const selector of ['#modalTitle', '#authSubmitButton', '#toggleToRegister']) await readable(page, selector);
    await capture(page, `login-${theme}.png`);
  });

  test(`${theme}: feedback, prose and colored action labels retain contrast`, async ({ page }) => {
    await page.goto('/');
    await setTheme(page, theme);
    await page.evaluate(() => {
      const fixture = document.createElement('section');
      fixture.id = 'color-fixture';
      fixture.className = 'surface-card';
      fixture.innerHTML = `
        <p class="success-message">Correct answer</p><p class="error-message">Try again</p>
        <p class="quiz-feedback-partial">Partially correct</p><span class="plan-pill">Free plan</span>
        <div class="details-accordion"><div class="details-accordion-summary">More detail</div><div class="details-accordion-content"><h3>A heading</h3><p>A paragraph with <strong>important words</strong> and <code>inline code</code>.</p></div></div>
        <p class="bg-indigo-100 text-indigo-600">Selected option</p><p class="bg-teal-100 text-teal-700">Quiz tag</p><p class="bg-amber-100 text-amber-600">Difficulty</p>
        <button class="text-white bg-green-500">Correct</button><button class="text-white bg-teal-500">Next</button><button class="text-white bg-yellow-400">Partial</button><button class="text-white bg-gray-400">Skip</button>
        <button class="flashcard-modal-action-btn bg-green-500">Submit and flip</button><button class="flashcard-modal-action-btn bg-yellow-400">Mark card</button><button class="flashcard-modal-nav-btn">Next card</button>
        <a class="tab-link" href="#">Other tab</a><a class="tab-link" data-active="true" href="#">Active tab</a>`;
      document.querySelector('main').prepend(fixture);
    });
    for (const selector of ['.success-message', '.error-message', '.quiz-feedback-partial', '.plan-pill', '.details-accordion-summary', '.details-accordion-content h3', '.details-accordion-content strong', '.details-accordion-content code', '.bg-indigo-100', '.bg-teal-100', '.bg-amber-100', '.bg-green-500', '.bg-teal-500', '.bg-yellow-400', '.bg-gray-400', '.tab-link']) await readable(page, `#color-fixture ${selector}`);
    await page.locator('#color-fixture .bg-teal-500').hover();
    await readable(page, '#color-fixture .bg-teal-500');
    for (const selector of ['.flashcard-modal-action-btn.bg-green-500', '.flashcard-modal-action-btn.bg-yellow-400', '.flashcard-modal-nav-btn']) await readable(page, `#color-fixture ${selector}`);
    await page.locator('#color-fixture .tab-link').first().focus();
    expect(await page.locator('#color-fixture .tab-link').first().evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid');
    await capture(page, `feedback-${theme}.png`);
  });
}

test('dark practice: generated quiz choices and submission feedback are readable', async ({ page }) => {
  await page.goto('/practice');
  await setTheme(page, 'dark');
  await page.locator('#practiceTopic').fill('Addition');
  await page.locator('#practiceGenerateBtn').click();
  await expect(page.locator('#quizInterfaceContainer')).toBeVisible();
  await readable(page, '.quiz-question-text');
  await readable(page, '.quiz-option-label');
  await page.locator('input[name="quizOption"][value="2"]').check();
  await readable(page, '.quiz-option-label:has(input:checked)');
  await page.getByRole('button', { name: /check answer/i }).click();
  await expect(page.locator('#quizAnswerFeedback')).toContainText(/correct/i);
  await readable(page, '#quizAnswerFeedback');
  await capture(page, 'practice-dark-feedback.png', true);
});

test('dark mobile: all main pages fit the screen and retain readable headings', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['/', '/practice', '/premade', '/dashboard', '/admin']) {
    await page.goto(route);
    await setTheme(page, 'dark');
    const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: innerWidth }));
    expect(width.scroll, route).toBeLessThanOrEqual(width.viewport + 1);
    if (await page.locator('h1').count()) await readable(page, 'h1');
    const name = route === '/' ? 'home' : route.slice(1);
    await capture(page, `mobile-${name}-dark.png`, true);
  }
});
