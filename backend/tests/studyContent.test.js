const test = require('node:test');
const assert = require('node:assert/strict');
const {
  recoverJson,
  normalizeQuizQuestions,
  normalizeFlashcards,
  scoreLocally,
  assertOwnsRecord,
} = require('../utils/studyContent');
const { reviewCard, isDue } = require('../utils/srs');
const { usageDate, userKeyFrom, estimateTokens, parseGoogleUsageMetadata } = require('../utils/usageMath');

test('recoverJson parses fenced JSON and truncated arrays', () => {
  const fenced = recoverJson('```json\n[{"term":"A","definition":"B"}]\n```');
  assert.equal(fenced[0].term, 'A');

  const truncated = recoverJson('[{"id":"q1","questionText":"Hi","questionType":"multiple_choice","options":["a","b"],"correctAnswer":"a","briefExplanation":"x"}, {"id":"q2"');
  assert.ok(Array.isArray(truncated));
  assert.equal(truncated.length, 1);
  assert.equal(truncated[0].id, 'q1');
});

test('normalizeQuizQuestions maps aliases and drops incomplete items', () => {
  const quiz = normalizeQuizQuestions([
    { question: 'What is 2+2?', type: 'multiple choice', choices: ['3', '4'], answer: '4' },
    { questionText: 'Pick both', questionType: 'select_all_that_apply', options: ['a', 'b'], correctAnswer: 'a|b' },
    { questionText: 'Broken MC' },
  ]);
  assert.equal(quiz.length, 2);
  assert.equal(quiz[0].questionType, 'multiple_choice');
  assert.equal(quiz[0].correctAnswer, '4');
  assert.deepEqual(quiz[1].correctAnswer, ['a', 'b']);
});

test('normalizeFlashcards keeps only term/definition pairs', () => {
  const cards = normalizeFlashcards({
    flashcards: [
      { front: 'ATP', back: 'Energy currency' },
      { term: 'Nope' },
    ],
  });
  assert.equal(cards.length, 1);
  assert.equal(cards[0].term, 'ATP');
});

test('scoreLocally handles numeric tolerance and select-all', () => {
  const numeric = scoreLocally({ questionType: 'numeric', correctAnswer: '3.14', numericTolerance: 0.02 }, '3.15');
  assert.equal(numeric.correctness, 'correct');
  const select = scoreLocally({ questionType: 'select_all', correctAnswer: ['A', 'B'] }, ['A']);
  assert.equal(select.correctness, 'partial');
});

test('assertOwnsRecord blocks mismatched ids including BigInt', () => {
  assert.equal(assertOwnsRecord(5, 5), true);
  assert.equal(assertOwnsRecord(BigInt(9), 9), true);
  assert.throws(() => assertOwnsRecord(1, 2), (err) => err.statusCode === 403);
});

test('parseGoogleUsageMetadata prefers API counts including thinking tokens', () => {
  const parsed = parseGoogleUsageMetadata({
    promptTokenCount: 1200,
    candidatesTokenCount: 400,
    thoughtsTokenCount: 80,
  });
  assert.equal(parsed.source, 'api');
  assert.equal(parsed.inputTokens, 1200);
  assert.equal(parsed.outputTokens, 480);
  const fallback = parseGoogleUsageMetadata({}, { inputTokens: 10, outputTokens: 4 });
  assert.equal(fallback.source, 'estimate');
  assert.equal(fallback.inputTokens, 10);
});

test('usage helpers format Pacific dates and anonymous keys', () => {
  const day = usageDate(new Date('2026-08-20T10:00:00Z'));
  assert.match(day, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(userKeyFrom({ id: 9 }), 'user:9');
  assert.equal(userKeyFrom(null, '127.0.0.1'), 'anon:127.0.0.1');
  assert.ok(estimateTokens('abcd') >= 1);
});

test('SM-2 reviewCard schedules a later due date after a good answer', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const first = reviewCard({}, 5, now);
  assert.equal(first.repetitions, 1);
  assert.equal(first.intervalDays, 1);
  assert.equal(isDue(first, now), false);
  const again = reviewCard(first, 0, now);
  assert.equal(again.repetitions, 0);
  assert.equal(isDue(again, new Date('2026-01-03T00:00:00Z')), true);
});
