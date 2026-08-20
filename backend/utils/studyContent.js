function stripMarkdownFence(text) {
  const trimmed = String(text || '').trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1].trim();
  return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

function recoverJson(text) {
  const cleaned = stripMarkdownFence(text);
  if (!cleaned) return null;

  const tryParse = (value) => {
    try {
      return JSON.parse(value);
    } catch (_err) {
      return null;
    }
  };

  const direct = tryParse(cleaned);
  if (direct !== null) return direct;

  const arrayStart = cleaned.indexOf('[');
  const objectStart = cleaned.indexOf('{');
  const start = arrayStart === -1 ? objectStart
    : objectStart === -1 ? arrayStart
      : Math.min(arrayStart, objectStart);
  if (start === -1) return null;

  const sliced = cleaned.slice(start);
  const slicedParsed = tryParse(sliced);
  if (slicedParsed !== null) return slicedParsed;

  if (sliced.startsWith('[')) {
    const lastComplete = sliced.lastIndexOf('}');
    if (lastComplete > 0) {
      let candidate = sliced.slice(0, lastComplete + 1).trim();
      if (!candidate.endsWith(']')) candidate += ']';
      const recovered = tryParse(candidate);
      if (Array.isArray(recovered) && recovered.length > 0) return recovered;
    }
  }

  if (sliced.startsWith('{')) {
    const lastBrace = sliced.lastIndexOf('}');
    if (lastBrace > 0) {
      const recovered = tryParse(sliced.slice(0, lastBrace + 1));
      if (recovered && typeof recovered === 'object') return recovered;
    }
  }

  return null;
}

function asStringArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (item == null ? '' : String(item).trim()))
      .filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return value.split(/\s*(?:,|;|\||\/)\s*/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function normalizeFlashcards(raw) {
  const list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.flashcards) ? raw.flashcards : []);
  return list
    .map((card) => {
      if (!card || typeof card !== 'object') return null;
      const term = String(card.term || card.front || card.question || card.prompt || '').trim();
      const definition = String(card.definition || card.back || card.answer || card.explanation || '').trim();
      if (!term || !definition) return null;
      return { term, definition };
    })
    .filter(Boolean);
}

function normalizeQuestionType(value) {
  const raw = String(value || '').toLowerCase().replace(/[\s-]+/g, '_');
  if (raw.includes('select') || raw.includes('all_that') || raw === 'multi_select') return 'select_all';
  if (raw.includes('numeric') || raw.includes('number') || raw.includes('calculation')) return 'numeric';
  if (raw.includes('code') || raw.includes('trace') || raw.includes('output')) return 'coding_trace';
  if (raw.includes('worked') || raw.includes('step')) return 'worked_problem';
  if (raw.includes('short') || raw.includes('fill') || raw.includes('open')) return 'short_answer';
  return 'multiple_choice';
}

function normalizeQuizQuestions(raw, fallbackType = 'multiple_choice') {
  const list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.questions) ? raw.questions : []);
  return list
    .map((question, index) => {
      if (!question || typeof question !== 'object') return null;
      const questionText = String(question.questionText || question.question || question.prompt || question.text || '').trim();
      if (!questionText) return null;

      const questionType = normalizeQuestionType(question.questionType || question.type || fallbackType);
      let options = asStringArray(question.options || question.choices);
      let correctAnswer = question.correctAnswer != null ? question.correctAnswer : question.correctAnswers;
      if (correctAnswer == null) correctAnswer = question.answer;

      if (questionType === 'select_all') {
        correctAnswer = asStringArray(correctAnswer);
        if (correctAnswer.length === 0) return null;
        options = Array.from(new Set([...options, ...correctAnswer]));
      } else if (questionType === 'short_answer' || questionType === 'worked_problem' || questionType === 'coding_trace' || questionType === 'numeric') {
        correctAnswer = Array.isArray(correctAnswer) ? String(correctAnswer[0] || '').trim() : String(correctAnswer || '').trim();
        if (!correctAnswer) return null;
        if (questionType !== 'coding_trace' && questionType !== 'worked_problem') {
          if (questionType === 'numeric') options = [];
        }
      } else {
        correctAnswer = Array.isArray(correctAnswer) ? String(correctAnswer[0] || '').trim() : String(correctAnswer || '').trim();
        if (!options.length || !correctAnswer) return null;
        if (!options.includes(correctAnswer)) options = [...options, correctAnswer];
        if (options.length > 6) options = options.slice(0, 6);
        if (options.length < 2) return null;
      }

      const numericTolerance = Number(question.numericTolerance);
      return {
        id: String(question.id || `q${index + 1}`),
        questionText,
        questionType,
        options,
        correctAnswer,
        briefExplanation: String(question.briefExplanation || question.explanation || question.rationale || '').trim(),
        codeSnippet: question.codeSnippet ? String(question.codeSnippet) : '',
        language: question.language ? String(question.language) : '',
        numericTolerance: Number.isFinite(numericTolerance) ? numericTolerance : (questionType === 'numeric' ? 0.01 : null),
      };
    })
    .filter(Boolean);
}

function scoreLocally(question, userAnswer) {
  const type = normalizeQuestionType(question.questionType);
  if (type === 'select_all') {
    const correct = asStringArray(question.correctAnswer).map((item) => item.toLowerCase());
    const given = asStringArray(userAnswer).map((item) => item.toLowerCase());
    const correctSet = new Set(correct);
    const givenSet = new Set(given);
    const matched = correct.filter((item) => givenSet.has(item)).length;
    const extras = given.filter((item) => !correctSet.has(item)).length;
    if (matched === correct.length && extras === 0 && correct.length > 0) {
      return { correctness: 'correct', feedback: 'Every correct option was selected.' };
    }
    if (matched > 0) {
      return { correctness: 'partial', feedback: `You found ${matched} of ${correct.length} correct option(s).` };
    }
    return { correctness: 'incorrect', feedback: 'None of the required options were selected.' };
  }

  if (type === 'numeric') {
    const expected = Number(String(question.correctAnswer).replace(/[^0-9eE.+-]/g, ''));
    const given = Number(String(userAnswer).replace(/[^0-9eE.+-]/g, ''));
    const tolerance = Number(question.numericTolerance);
    const allowed = Number.isFinite(tolerance) ? Math.abs(tolerance) : 0.01;
    if (!Number.isFinite(expected) || !Number.isFinite(given)) {
      return { correctness: 'incorrect', feedback: 'Enter a numeric answer.' };
    }
    if (Math.abs(expected - given) <= allowed || (expected !== 0 && Math.abs((expected - given) / expected) <= allowed)) {
      return { correctness: 'correct', feedback: 'That numeric answer is within the accepted range.' };
    }
    return { correctness: 'incorrect', feedback: `Expected about ${question.correctAnswer}.` };
  }

  const correct = String(Array.isArray(question.correctAnswer) ? question.correctAnswer[0] : question.correctAnswer || '')
    .trim()
    .toLowerCase();
  const given = String(Array.isArray(userAnswer) ? userAnswer.join(' ') : userAnswer || '').trim().toLowerCase();
  if (!given) return { correctness: 'incorrect', feedback: 'No answer was provided.' };
  if (given === correct) return { correctness: 'correct', feedback: 'That matches the expected answer.' };
  if ((type === 'short_answer' || type === 'worked_problem' || type === 'coding_trace') && (correct.includes(given) || given.includes(correct)) && given.length > 2) {
    return { correctness: 'partial', feedback: 'Close — you captured part of the expected idea.' };
  }
  return { correctness: 'incorrect', feedback: `The expected answer is "${Array.isArray(question.correctAnswer) ? question.correctAnswer[0] : question.correctAnswer}".` };
}

function assertOwnsRecord(recordUserId, requesterId) {
  if (recordUserId == null || requesterId == null || Number(recordUserId) !== Number(requesterId)) {
    const error = new Error('Access denied.');
    error.statusCode = 403;
    throw error;
  }
  return true;
}

module.exports = {
  stripMarkdownFence,
  recoverJson,
  asStringArray,
  normalizeFlashcards,
  normalizeQuestionType,
  normalizeQuizQuestions,
  scoreLocally,
  assertOwnsRecord,
};
