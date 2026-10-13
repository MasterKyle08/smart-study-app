const { normalizeQuestionType } = require('./studyContent');

function normalizeQuizOptions(value = {}) {
  const options = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const types = Array.isArray(options.questionTypes) ? options.questionTypes.slice(0, 6).map(normalizeQuestionType) : [];
  const count = Number(options.numQuestions);
  return {
    questionTypes: types.length ? [...new Set(types)] : ['multiple_choice'],
    numQuestions: Number.isInteger(count) && count > 0 ? Math.min(count, 15) : 'ai_choice',
    difficulty: ['easy', 'medium', 'hard'].includes(options.difficulty) ? options.difficulty : 'medium',
  };
}
module.exports = { normalizeQuizOptions };
