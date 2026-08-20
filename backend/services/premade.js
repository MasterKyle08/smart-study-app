/**
 * @file backend/services/premade.js
 * @description Service helpers for creating and retrieving premade quizzes.
 */

const PremadeQuiz = require('../models/PremadeQuiz');
const aiService = require('./ai');

function slugify(value) {
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    || 'quiz';
}

async function generateUniqueSlug(title) {
  const baseSlug = slugify(title);
  let candidate = baseSlug;
  let counter = 1;
  while (await PremadeQuiz.slugExists(candidate)) {
    candidate = `${baseSlug}-${counter++}`;
  }
  return candidate;
}

function normalizeTags(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) {
    return tags
      .map(tag => (typeof tag === 'string' ? tag.trim() : ''))
      .filter(Boolean)
      .slice(0, 10);
  }
  if (typeof tags === 'string') {
    return tags
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean)
      .slice(0, 10);
  }
  return [];
}

function buildPromptContext({ title, topic, description, sourceText, customInstructions }) {
  const lines = [];
  if (topic || title) lines.push(`Topic: ${topic || title}`);
  if (description) lines.push(`Description: ${description}`);
  if (customInstructions) lines.push(`Focus Points: ${customInstructions}`);
  if (sourceText) lines.push(`Reference Material:\n${sourceText}`);
  return lines.join('\n\n').trim();
}

function normalizeQuizOptions(quizOptions = {}) {
  const defaultOptions = {
    questionTypes: ['multiple_choice'],
    numQuestions: 'ai_choice',
    difficulty: 'medium',
  };

  const normalized = {
    ...defaultOptions,
    ...quizOptions,
  };

  if (!Array.isArray(normalized.questionTypes) || normalized.questionTypes.length === 0) {
    normalized.questionTypes = defaultOptions.questionTypes;
  }
  normalized.questionTypes = normalized.questionTypes
    .map(type => type && type.toString().trim())
    .filter(Boolean);

  const allowedCounts = ['ai_choice', '5', '7', '10', '12', '15'];
  if (!allowedCounts.includes(String(normalized.numQuestions))) {
    normalized.numQuestions = defaultOptions.numQuestions;
  }

  const allowedDifficulty = ['easy', 'medium', 'hard'];
  if (!allowedDifficulty.includes(String(normalized.difficulty))) {
    normalized.difficulty = defaultOptions.difficulty;
  }

  return normalized;
}

async function createPremadeQuiz({
  userId,
  title,
  description,
  topic,
  tags,
  quizOptions,
  sourceText,
  customInstructions,
  premium = false,
}) {
  if (!title || typeof title !== 'string' || title.trim() === '') {
    const error = new Error('A title is required to create a premade quiz.');
    error.statusCode = 400;
    throw error;
  }

  const normalizedTags = normalizeTags(tags);
  const normalizedOptions = normalizeQuizOptions(quizOptions);
  const promptContext = buildPromptContext({ title, topic, description, sourceText, customInstructions });
  if (!promptContext) {
    const error = new Error('Provide at least a topic, description, or reference material to generate a quiz.');
    error.statusCode = 400;
    throw error;
  }

  const aiQuiz = await aiService.generateQuizWithOptions(promptContext, normalizedOptions, { premium });
  if (!Array.isArray(aiQuiz) || aiQuiz.length === 0) {
    const error = new Error('AI did not return any quiz questions.');
    error.statusCode = 500;
    throw error;
  }

  const slug = await generateUniqueSlug(title);
  const record = await PremadeQuiz.create({
    userId,
    title: title.trim(),
    slug,
    description: description || null,
    topic: topic || title,
    tags: normalizedTags,
    sourceText: promptContext,
    quizJson: aiQuiz,
    quizOptions: normalizedOptions,
    isPublic: true,
  });

  return {
    ...record,
    quizUrl: `/quiz/${record.slug}`,
  };
}

async function listPremadeQuizzes({ search } = {}) {
  const quizzes = await PremadeQuiz.listPublic({ search });
  return quizzes.map(quiz => {
    const { quiz: _quizData, sourceText: _source, ...rest } = quiz;
    return {
      ...rest,
      quizUrl: `/quiz/${quiz.slug}`,
    };
  });
}

async function getPremadeQuiz(slug, { userId } = {}) {
  if (!slug) return null;
  const quiz = await PremadeQuiz.findBySlug(slug, { includeQuiz: true, includePrivate: true });
  if (!quiz) return null;
  if (!quiz.isPublic && Number(quiz.userId) !== Number(userId)) return null;
  return { ...quiz, quizUrl: `/quiz/${quiz.slug}` };
}

async function listMine(userId) {
  const quizzes = await PremadeQuiz.listByUserId(userId);
  return quizzes.map((quiz) => ({ ...quiz, quizUrl: `/quiz/${quiz.slug}` }));
}

async function updatePremadeQuiz(slug, userId, updates) {
  const quiz = await PremadeQuiz.findBySlug(slug, { includePrivate: true, includeQuiz: true });
  if (!quiz) {
    const error = new Error('Premade quiz not found.');
    error.statusCode = 404;
    throw error;
  }
  const { assertOwnsRecord } = require('../utils/studyContent');
  assertOwnsRecord(quiz.userId, userId);
  const updated = await PremadeQuiz.updateById(quiz.id, {
    title: updates.title,
    description: updates.description,
    topic: updates.topic,
    tags: updates.tags,
    isPublic: updates.isPublic,
  });
  return { ...updated, quizUrl: `/quiz/${updated.slug}` };
}

async function deletePremadeQuiz(slug, userId) {
  const quiz = await PremadeQuiz.findBySlug(slug, { includePrivate: true });
  if (!quiz) {
    const error = new Error('Premade quiz not found.');
    error.statusCode = 404;
    throw error;
  }
  const { assertOwnsRecord } = require('../utils/studyContent');
  assertOwnsRecord(quiz.userId, userId);
  await PremadeQuiz.deleteById(quiz.id, userId);
  return true;
}

module.exports = {
  createPremadeQuiz,
  listPremadeQuizzes,
  getPremadeQuiz,
  listMine,
  updatePremadeQuiz,
  deletePremadeQuiz,
};
