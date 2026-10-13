const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const { contrast } = require('./contrast');

const quiz = Array.from({ length: 10 }, (_, index) => ({
  id: `q${index + 1}`, questionText: `Which example best explains concept ${index + 1} and its relationship to the ideas in these notes?`,
  questionType: 'multiple_choice', options: ['A clear explanation of the concept.', 'An unrelated example.', 'The opposite relationship.', 'None of the examples.'],
  correctAnswer: 'A clear explanation of the concept.', briefExplanation: 'The first example follows the definition and relationships described in the source material.',
}));
const session = {
  id: 1, original_filename: 'Biology revision notes — cells, energy, and the relationships between systems.txt',
  created_at: '2026-10-12T12:00:00Z', updated_at: '2026-10-12T12:00:00Z',
  summary: Array.from({ length: 30 }, (_, index) => `**Concept ${index + 1}.** Cells use energy to maintain their structures and carry out important processes. Understanding the relationship between each process and its environment helps connect the main ideas. Review the definitions and compare examples to remember how these systems work together.`).join('\n\n'),
  quiz: JSON.stringify(quiz), flashcards: [{ term: 'Cell', definition: 'A basic unit of life.' }], extracted_text: 'Original source.\n'.repeat(100),
};

test.beforeEach(async ({ page }) => {
  // All API responses are fixtures: opening saved sessions never touches Turso
  // or sends a real generation/deletion request in browser tests.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    let body = {};
    if (url.pathname === '/api/auth/me') body = { user: { id: 9999, email: 'reader@local.test', plan: 'free' } };
    else if (url.pathname === '/api/study/sessions') body = { sessions: [session] };
    else if (url.pathname === '/api/study/sessions/1') body = { session };
    else if (url.pathname.includes('/api/billing/config')) body = { premiumEnabled: false, providers: {}, ads: { enabled: false }, monthlyPriceLabel: '$5 / month', pricing: { why: 'A separate paid AI plan for study tools.' } };
    else if (url.pathname.includes('flashcard-reviews')) body = { reviews: [] };
    return route.fulfill({ json: body });
  });
  fs.mkdirSync('.local/artifacts', { recursive: true });
});

async function singleScrollArea(page) {
  return page.locator('#sessionDetailModal').evaluate(modal => [...modal.querySelectorAll('*')]
    .filter(element => element.getClientRects().length && /auto|scroll/.test(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight + 1)
    .map(element => element.id || element.className));
}

test('saved reader stays open when Escape closes a higher dialog', async ({ page }) => {
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'View Details' }).click();
  const modal = page.locator('#sessionDetailModal');
  await modal.locator('[data-tab="modalFlashcardsTab"]').click();
  await modal.getByRole('button', { name: 'Study These Flashcards' }).click();
  await expect(page.locator('#flashcardStudyModal-modal')).toHaveAttribute('data-visible', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('#flashcardStudyModal-modal')).toHaveAttribute('data-visible', 'false');
  await expect(modal).toHaveAttribute('data-visible', 'true');
  await page.locator('#deleteSessionButton').click();
  await expect(page.locator('#customConfirmModal')).toHaveAttribute('data-visible', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('#customConfirmModal')).toHaveAttribute('data-visible', 'false');
  await expect(modal).toHaveAttribute('data-visible', 'true');
});

for (const theme of ['light', 'dark']) {
  for (const [name, viewport] of Object.entries({
    desktop: { width: 1440, height: 1000 }, laptop: { width: 1280, height: 720 },
    mobile: { width: 390, height: 844 }, landscape: { width: 844, height: 390 },
  })) {
    test(`${theme} ${name}: saved summary and quiz use one usable scrolling area`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/dashboard');
      await page.evaluate(value => window.applyStudyTheme(value), theme);
      const open = page.getByRole('button', { name: 'View Details' });
      await open.click();
      const modal = page.locator('#sessionDetailModal');
      const reader = page.locator('#sessionReaderContent');
      await expect(modal).toHaveAttribute('aria-hidden', 'false');
      await expect(page.getByRole('button', { name: 'Close saved upload' })).toBeFocused();
      const regenerate = page.locator('#regenerateButton');
      const remove = page.locator('#deleteSessionButton');
      await expect(regenerate).toBeInViewport();
      await expect(remove).toBeInViewport();
      // Finish the opening transition before measuring layout/sizing.
      await expect.poll(() => modal.locator('.session-reader').evaluate(element => getComputedStyle(element).transform)).toBe('matrix(1, 0, 0, 1, 0, 0)');
      const bounds = await modal.locator('.session-reader').boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
      const header = await modal.locator('.session-reader-heading').boundingBox();
      const regenerateBounds = await regenerate.boundingBox();
      const deleteBounds = await remove.boundingBox();
      const closeBounds = await page.locator('#closeSessionDetailModalButton').boundingBox();
      expect(regenerateBounds.x + regenerateBounds.width + 4).toBeLessThanOrEqual(deleteBounds.x);
      expect(deleteBounds.y + deleteBounds.height).toBeLessThanOrEqual(header.y + header.height + 1);
      if (viewport.width >= 640) expect(deleteBounds.x + deleteBounds.width + 4).toBeLessThanOrEqual(closeBounds.x);
      else expect(regenerateBounds.height).toBeGreaterThanOrEqual(44);
      for (const selector of ['#regenerateButton', '#deleteSessionButton']) expect((await contrast(page, selector)).ratio).toBeGreaterThanOrEqual(4.5);
      const readingHeight = await reader.evaluate(element => element.clientHeight);
      expect(readingHeight).toBeGreaterThan(viewport.height * 0.45);
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY)).toBe('hidden');
      expect(await singleScrollArea(page)).toEqual(['sessionReaderContent']);
      const summary = await page.locator('#modalSummaryOutput').boundingBox();
      if (viewport.width >= 1280) {
        expect(bounds.width).toBeGreaterThan(1000);
        expect(summary.width).toBeGreaterThan(550);
        expect(summary.width).toBeLessThan(800);
      }
      expect(await page.locator('#modalSummaryOutput').evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
      await expect(page.locator('#modalSummaryOutput')).not.toContainText('<br>');
      expect(await page.locator('#modalSummaryOutput br').count()).toBeGreaterThan(20);
      expect((await contrast(page, '#modalSummaryOutput')).ratio).toBeGreaterThanOrEqual(4.5);
      await page.screenshot({ path: `.local/artifacts/dashboard-summary-${theme}-${name}.png`, animations: 'disabled' });
      // A wheel gesture over the summary moves the reader, not an inner box or the page.
      await page.locator('#modalSummaryOutput').hover({ position: { x: 30, y: 40 } });
      await page.mouse.wheel(0, 650);
      await expect.poll(() => reader.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
      await expect(regenerate).toBeInViewport();
      await expect(remove).toBeInViewport();
      expect((await regenerate.boundingBox()).y).toBe(regenerateBounds.y);
      await modal.locator('[data-tab="modalQuizTab"]').click();
      await expect.poll(() => reader.evaluate(element => element.scrollTop)).toBe(0);
      await expect(modal.locator('.quiz-question-card')).toHaveCount(10);
      expect(await singleScrollArea(page)).toEqual(['sessionReaderContent']);
      const card = modal.locator('.quiz-question-card').first();
      expect(await card.locator(':scope > p').first().evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
      if (viewport.width >= 1280) expect((await card.boundingBox()).width).toBeGreaterThan(800);
      expect((await contrast(page, '#modalQuizOutput .quiz-question-card > p')).ratio).toBeGreaterThanOrEqual(4.5);
      await page.screenshot({ path: `.local/artifacts/dashboard-quiz-${theme}-${name}.png`, animations: 'disabled' });
      // Header actions stay available even at the very end of a long quiz.
      await reader.evaluate(element => { element.scrollTop = element.scrollHeight; });
      await expect(regenerate).toBeInViewport();
      await expect(remove).toBeInViewport();
      await regenerate.click();
      await expect(regenerate).toHaveAttribute('aria-expanded', 'true');
      await expect.poll(() => reader.evaluate(element => element.scrollTop)).toBe(0);
      await expect(page.locator('#regenerateOptions')).toBeInViewport();
      await modal.locator('input[name="regenOutputFormat"][value="summary"]').check();
      await page.locator('#confirmRegenerateButton').scrollIntoViewIfNeeded();
      await expect(page.locator('#confirmRegenerateButton')).toBeInViewport();
      expect(await singleScrollArea(page)).toEqual(['sessionReaderContent']);
      await page.locator('#confirmRegenerateButton').focus();
      await page.keyboard.press('Tab');
      await expect(regenerate).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(modal).toHaveAttribute('data-visible', 'false');
      await expect(open).toBeFocused();
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY)).not.toBe('hidden');
      await open.click();
      await expect(modal).toHaveAttribute('aria-hidden', 'false');
      await expect(page.locator('#modalSummaryTab')).toBeVisible();
      await expect.poll(() => reader.evaluate(element => element.scrollTop)).toBe(0);
    });
  }
}
