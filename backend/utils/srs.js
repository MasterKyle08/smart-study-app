/**
 * SM-2 spaced repetition. Quality is 0-5:
 * 0 again, 3 hard, 4 good, 5 easy.
 */
function reviewCard(state = {}, quality = 4, now = new Date()) {
  const q = Math.max(0, Math.min(5, Number(quality)));
  let repetitions = Number(state.repetitions) || 0;
  let intervalDays = Number(state.intervalDays) || 0;
  let easeFactor = Number(state.easeFactor) || 2.5;

  if (q < 3) {
    repetitions = 0;
    intervalDays = 1;
  } else {
    if (repetitions === 0) intervalDays = 1;
    else if (repetitions === 1) intervalDays = 6;
    else intervalDays = Math.round(intervalDays * easeFactor);
    repetitions += 1;
  }

  easeFactor = easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3;

  const due = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  return {
    repetitions,
    intervalDays,
    easeFactor: Number(easeFactor.toFixed(2)),
    dueAt: due.toISOString(),
    lastQuality: q,
    lastReviewedAt: now.toISOString(),
  };
}

function isDue(state, now = new Date()) {
  if (!state || !state.dueAt) return true;
  return new Date(state.dueAt).getTime() <= now.getTime();
}

module.exports = { reviewCard, isDue };
