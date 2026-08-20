/**
 * @file backend/services/ai.js
 * @description Google AI service for summaries, flashcards, quizzes, and study feedback.
 * Free tier uses Gemma 4 with thinking disabled and robust JSON parsing.
 * Premium uses a Gemini Flash-Lite model with native structured output.
 */

const fetch = require('node-fetch');
const {
  recoverJson,
  normalizeFlashcards,
  normalizeQuestionType,
  normalizeQuizQuestions,
  scoreLocally,
} = require('../utils/studyContent');
const usage = require('./usage');
const { parseGoogleUsageMetadata, estimateTokens } = require('../utils/usageMath');

const FREE_API_KEY = (process.env.GOOGLE_FREE_API_KEY || process.env.GOOGLE_API_KEY || '').replace(/['"]/g, '');
const PREMIUM_API_KEY = (process.env.GOOGLE_PREMIUM_API_KEY || '').replace(/['"]/g, '');
const GOOGLE_API_KEY = FREE_API_KEY;
const FREE_MODEL = (process.env.GOOGLE_AI_MODEL_NAME || 'gemma-4-31b-it').replace(/['"]/g, '');
const PREMIUM_MODEL = (process.env.GOOGLE_PREMIUM_MODEL_NAME || 'gemini-3.5-flash-lite').replace(/['"]/g, '');
const GOOGLE_API_URL_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

const FREE_MAX_SOURCE_CHARS = 14000;
const PREMIUM_MAX_SOURCE_CHARS = 40000;
const FREE_MAX_QUIZ_QUESTIONS = 10;
const PREMIUM_MAX_QUIZ_QUESTIONS = 15;
const REQUEST_TIMEOUT_MS = 90000;

if (!GOOGLE_API_KEY) {
  console.warn('Warning: GOOGLE_API_KEY is not defined. AI features will not work.');
}

function isPremiumRequest(options = {}) {
  return Boolean(options.premium);
}

function modelFor(options = {}) {
  return isPremiumRequest(options) ? PREMIUM_MODEL : FREE_MODEL;
}

function apiKeyFor(options = {}) {
  if (isPremiumRequest(options)) {
    if (!PREMIUM_API_KEY) {
      const error = new Error('Premium is missing GOOGLE_PREMIUM_API_KEY. Use a separate Google AI Studio project for the paid model.');
      error.statusCode = 501;
      throw error;
    }
    return PREMIUM_API_KEY;
  }
  if (!FREE_API_KEY) {
    const error = new Error('Google free API key is not configured. Set GOOGLE_FREE_API_KEY or GOOGLE_API_KEY.');
    error.statusCode = 500;
    throw error;
  }
  return FREE_API_KEY;
}

function tokensFromGoogleResponse(data, contents) {
  return parseGoogleUsageMetadata(data && (data.usageMetadata || data.usage_metadata), {
    inputTokens: estimateTokens(JSON.stringify(contents || [])),
    outputTokens: estimateTokens(extractCandidateText(data)),
  });
}

function maxSourceChars(options = {}) {
  return isPremiumRequest(options) ? PREMIUM_MAX_SOURCE_CHARS : FREE_MAX_SOURCE_CHARS;
}

function truncateSource(text, options = {}) {
  const limit = maxSourceChars(options);
  const raw = String(text || '').trim();
  if (raw.length <= limit) return raw;
  const sliced = raw.slice(0, limit);
  const lastBreak = Math.max(sliced.lastIndexOf('\n'), sliced.lastIndexOf('. '), sliced.lastIndexOf('? '), sliced.lastIndexOf('! '));
  const cut = lastBreak > limit * 0.7 ? sliced.slice(0, lastBreak + 1) : sliced;
  return `${cut.trim()}\n\n[Source truncated to the most relevant opening section for generation.]`;
}

function capQuestionCount(numQuestions, options = {}) {
  const max = isPremiumRequest(options) ? PREMIUM_MAX_QUIZ_QUESTIONS : FREE_MAX_QUIZ_QUESTIONS;
  if (numQuestions === 'ai_choice' || numQuestions == null) {
    return isPremiumRequest(options) ? 10 : 7;
  }
  const parsed = parseInt(numQuestions, 10);
  if (Number.isNaN(parsed) || parsed < 1) return isPremiumRequest(options) ? 10 : 7;
  return Math.min(parsed, max);
}

function extractCandidateText(data) {
  const candidate = data && data.candidates && data.candidates[0];
  if (!candidate) return '';
  const parts = (candidate.content && candidate.content.parts) || [];
  return parts
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim();
}

async function noteUsage(data, contents, premium, modelName) {
  try {
    const counts = tokensFromGoogleResponse(data, contents);
    const usedPremium = Boolean(premium) || (modelName && !String(modelName).toLowerCase().includes('gemma'));
    await usage.recordRequest({
      premium: usedPremium,
      inputTokens: counts.inputTokens,
      outputTokens: counts.outputTokens,
      source: counts.source,
    });
  } catch (_err) {
    // usage tracking must never break generation
  }
}

async function callGoogleAI(contents, generationConfig = {}, { modelName, json = false, timeoutMs = REQUEST_TIMEOUT_MS, premium = false } = {}) {
  const apiKey = apiKeyFor({ premium });
  const apiUrl = `${GOOGLE_API_URL_BASE}${modelName}:generateContent?key=${apiKey}`;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  const payload = {
    contents,
    generationConfig: {
      temperature: 0.4,
      topP: 0.9,
      maxOutputTokens: 2048,
      thinkingConfig: { thinkingLevel: 'minimal' },
      ...generationConfig,
    },
  };

  if (json && payload.generationConfig.responseMimeType !== 'application/json') {
    payload.generationConfig.responseMimeType = 'application/json';
  }

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller ? controller.signal : undefined,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorMessage = data.error?.message || `Google AI API request failed with status ${response.status}`;
      const error = new Error(errorMessage);
      error.statusCode = response.status >= 500 ? 502 : response.status;
      throw error;
    }

    if (!data.candidates || data.candidates.length === 0) {
      const block = data.promptFeedback && data.promptFeedback.blockReason;
      const error = new Error(block ? `AI blocked the request (${block}).` : 'The AI returned an empty response.');
      error.statusCode = 502;
      throw error;
    }

    const text = extractCandidateText(data);
    await noteUsage(data, contents, premium, modelName);
    return { data, text, finishReason: data.candidates[0].finishReason || '' };
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('The AI took too long to respond. Try a shorter document or fewer questions.');
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    console.error('Error in callGoogleAI:', error.message);
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function generateJson(contents, { schema, modelName, temperature = 0.35, maxOutputTokens = 4096, systemInstruction, premium = false } = {}) {
  const apiKey = apiKeyFor({ premium });
  const generationConfig = {
    temperature,
    maxOutputTokens,
    thinkingConfig: { thinkingLevel: 'minimal' },
    responseMimeType: 'application/json',
  };
  if (schema) generationConfig.responseSchema = schema;

  const bodyContents = contents;

  const request = {
    contents: bodyContents,
    generationConfig,
  };
  if (systemInstruction) {
    request.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const apiUrl = `${GOOGLE_API_URL_BASE}${modelName}:generateContent?key=${apiKey}`;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller ? controller.signal : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error?.message || `Google AI API request failed with status ${response.status}`);
      error.statusCode = response.status >= 500 ? 502 : response.status;
      throw error;
    }
    const text = extractCandidateText(data);
    await noteUsage(data, contents, premium, modelName);
    const parsed = recoverJson(text);
    if (parsed == null) {
      const error = new Error('The AI returned content that could not be parsed as JSON.');
      error.statusCode = 502;
      error.rawText = text;
      throw error;
    }
    return parsed;
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('The AI took too long to respond. Try a shorter document or fewer questions.');
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function generateJsonWithFallback(prompt, schema, options = {}) {
  const modelName = modelFor(options);
  const systemInstruction = 'Return only valid JSON. Do not include markdown fences, commentary, or trailing text.';
  const contents = [{ role: 'user', parts: [{ text: prompt }] }];

  try {
    return await generateJson(contents, {
      schema,
      modelName,
      temperature: options.temperature || 0.35,
      maxOutputTokens: options.maxOutputTokens || 6144,
      systemInstruction,
      premium: options.premium,
    });
  } catch (firstError) {
    console.warn('Structured JSON generation failed, retrying with prompt-only JSON:', firstError.message);
    const retryPrompt = `${prompt}\n\nIMPORTANT: Reply with JSON only. No markdown. No extra keys.`;
    const { text } = await callGoogleAI(
      [{ role: 'user', parts: [{ text: retryPrompt }] }],
      {
        temperature: 0.2,
        maxOutputTokens: options.maxOutputTokens || 6144,
        thinkingConfig: { thinkingLevel: 'minimal' },
      },
      { modelName, premium: options.premium }
    );
    const parsed = recoverJson(text);
    if (parsed == null) {
      const error = new Error(firstError.message || 'Failed to parse AI JSON.');
      error.statusCode = 502;
      throw error;
    }
    return parsed;
  }
}

const FLASHCARD_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      term: { type: 'STRING', description: 'Front of the card: a concise term, name, or question' },
      definition: { type: 'STRING', description: 'Back of the card: a clear student-friendly definition or answer' },
    },
    required: ['term', 'definition'],
  },
};

const QUIZ_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      id: { type: 'STRING' },
      questionText: { type: 'STRING' },
      questionType: { type: 'STRING', description: 'multiple_choice, select_all, short_answer, numeric, coding_trace, or worked_problem' },
      options: { type: 'ARRAY', items: { type: 'STRING' } },
      correctAnswer: { type: 'STRING', description: 'Exact matching option, pipe-separated options, numeric value, or short result' },
      briefExplanation: { type: 'STRING' },
      codeSnippet: { type: 'STRING' },
      language: { type: 'STRING' },
      numericTolerance: { type: 'STRING' },
    },
    required: ['id', 'questionText', 'questionType', 'options', 'correctAnswer', 'briefExplanation'],
  },
};

const SINGLE_QUESTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    id: { type: 'STRING' },
    questionText: { type: 'STRING' },
    questionType: { type: 'STRING' },
    options: { type: 'ARRAY', items: { type: 'STRING' } },
    correctAnswer: { type: 'STRING' },
    briefExplanation: { type: 'STRING' },
  },
  required: ['id', 'questionText', 'questionType', 'options', 'correctAnswer', 'briefExplanation'],
};

const FEEDBACK_SCHEMA = {
  type: 'OBJECT',
  properties: {
    correctness: { type: 'STRING', description: 'correct, incorrect, or partial' },
    feedback: { type: 'STRING' },
  },
  required: ['correctness', 'feedback'],
};

async function generateSummary(text, lengthPreference = 'medium', stylePreference = 'paragraph', keywords = [], audiencePurpose = '', negativeKeywords = [], options = {}) {
  const source = truncateSource(text, options);
  const lengthInstruction = lengthPreference === 'short'
    ? 'about 60-90 words'
    : lengthPreference === 'long'
      ? 'about 250-350 words'
      : 'about 140-200 words';
  const styleInstruction = stylePreference === 'bullets'
    ? 'Use short bullet points grouped under clear headings. Each bullet should be a complete idea.'
    : 'Write 2-4 clear paragraphs with topic sentences. Use short sentences.';

  const prompt = `You are a careful academic tutor. Summarize the source for a student.

Length: ${lengthInstruction}
Style: ${styleInstruction}
${keywords.length ? `Emphasize these ideas if they appear: ${keywords.join(', ')}` : ''}
${audiencePurpose ? `Audience/purpose: ${audiencePurpose}` : ''}
${negativeKeywords.length ? `Do not dwell on: ${negativeKeywords.join(', ')}` : ''}

Rules:
- Use only facts from the source. Do not invent details.
- Prefer key definitions, processes, and relationships over trivia.
- If the source is messy OCR text, ignore obvious scanning garbage.

Source:
${source}`;

  const { text: summary } = await callGoogleAI(
    [{ role: 'user', parts: [{ text: prompt }] }],
    { temperature: 0.45, maxOutputTokens: 1600, thinkingConfig: { thinkingLevel: 'minimal' } },
    { modelName: modelFor(options), premium: options.premium }
  );
  if (!summary) {
    const error = new Error('The AI did not return a summary.');
    error.statusCode = 502;
    throw error;
  }
  return summary;
}

async function generateFlashcards(text, options = {}) {
  const source = truncateSource(text, options);
  const count = isPremiumRequest(options) ? '12-16' : '8-12';
  const prompt = `Create ${count} study flashcards from the source.

Each card must have:
- term: a short concept, vocabulary word, or question
- definition: a clear 1-3 sentence answer a student can memorize

Rules:
- Cover the most testable ideas, not trivia
- Do not duplicate cards
- Use only information in the source
- Definitions should stand alone without referring to "the text"

Source:
${source}`;

  const parsed = await generateJsonWithFallback(prompt, FLASHCARD_SCHEMA, {
    ...options,
    maxOutputTokens: isPremiumRequest(options) ? 6144 : 4096,
  });
  const flashcards = normalizeFlashcards(parsed);
  if (!flashcards.length) {
    const error = new Error('The AI did not return usable flashcards. Try a clearer document.');
    error.statusCode = 502;
    throw error;
  }
  return flashcards;
}

function describeQuestionTypes(questionTypes) {
  return questionTypes.map((type) => {
    const normalized = normalizeQuestionType(type);
    if (normalized === 'select_all') {
      return 'select_all: several options can be correct; put every correct option in correctAnswer separated by |';
    }
    if (normalized === 'short_answer') {
      return 'short_answer: no options array; correctAnswer is a concise model answer';
    }
    return 'multiple_choice: exactly 4 options; correctAnswer must match one option exactly';
  }).join('; ');
}

async function generateQuizWithOptions(text, quizOptions = {}, requestOptions = {}) {
  const source = truncateSource(text, requestOptions);
  const questionTypes = (quizOptions.questionTypes && quizOptions.questionTypes.length)
    ? quizOptions.questionTypes.map(normalizeQuestionType)
    : ['multiple_choice'];
  const count = capQuestionCount(quizOptions.numQuestions, requestOptions);
  const difficulty = ['easy', 'medium', 'hard'].includes(String(quizOptions.difficulty))
    ? quizOptions.difficulty
    : 'medium';
  const primaryType = questionTypes[0] || 'multiple_choice';

  const prompt = `Create exactly ${count} quiz questions from the source for a student.

Difficulty: ${difficulty}
Allowed types: ${describeQuestionTypes(questionTypes)}

JSON fields for every question:
- id: q1, q2, ...
- questionText
- questionType: one of ${questionTypes.join(', ')}
- options: array of strings (empty for short_answer)
- correctAnswer: exact option text, or option1|option2 for select_all
- briefExplanation: one or two sentences from the source

Rules:
- Mix the allowed types if more than one is listed
- Questions must be answerable from the source only
- Wrong options should be plausible
- Never leave JSON unfinished — if you are running out of room, return fewer complete questions
- Do not wrap the JSON in markdown

Source:
${source}`;

  const parsed = await generateJsonWithFallback(prompt, QUIZ_SCHEMA, {
    ...requestOptions,
    maxOutputTokens: 8192,
    temperature: 0.35,
  });
  const quiz = normalizeQuizQuestions(parsed, primaryType).slice(0, count);
  if (!quiz.length) {
    const error = new Error('The AI did not return complete quiz questions. Try fewer questions or a shorter document.');
    error.statusCode = 502;
    throw error;
  }
  return quiz;
}

async function explainTextSnippet(snippet, options = {}) {
  const prompt = `Explain this excerpt for a student in 4-7 sentences. Define any technical terms. Be accurate and concrete.

Excerpt:
"${String(snippet).slice(0, 1000)}"`;
  const { text } = await callGoogleAI(
    [{ role: 'user', parts: [{ text: prompt }] }],
    { maxOutputTokens: 500, temperature: 0.4, thinkingConfig: { thinkingLevel: 'minimal' } },
    { modelName: modelFor(options), premium: options.premium }
  );
  return text;
}

async function extractTextFromImages(images = [], options = {}) {
  const usable = (Array.isArray(images) ? images : [])
    .filter((image) => image && image.data)
    .slice(0, 3);
  if (!usable.length) {
    const error = new Error('No images were provided for vision extraction.');
    error.statusCode = 400;
    throw error;
  }

  const parts = usable.map((image, index) => ({
    inlineData: {
      mimeType: image.mimeType || 'image/jpeg',
      data: String(image.data).replace(/^data:[^;]+;base64,/, ''),
    },
  }));
  parts.push({
    text: `These ${usable.length} image(s) are student study material (worksheet, notes, or slides).
Transcribe ALL readable text in reading order. Keep math, code, tables, and labels.
If handwriting is unclear, give your best reading and mark uncertain words with [?].
Do not summarize. Return plain text only.`,
  });

  const { text } = await callGoogleAI(
    [{ role: 'user', parts }],
    { temperature: 0.1, maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: 'minimal' } },
    { modelName: modelFor(options), timeoutMs: 90000 }
  );
  if (!text || text.replace(/\s+/g, ' ').trim().length < 8) {
    const error = new Error('Vision did not read enough text from the image(s).');
    error.statusCode = 502;
    throw error;
  }
  return text;
}

async function generatePracticeSet({ subject, topic, mode, difficulty, numQuestions }, options = {}) {
  const count = capQuestionCount(numQuestions || 7, options);
  const subjectLabel = String(subject || 'general').replace(/[_-]/g, ' ');
  const topicLabel = String(topic || subjectLabel).trim();
  const practiceMode = String(mode || 'concept-quiz');
  const level = ['easy', 'medium', 'hard'].includes(String(difficulty)) ? difficulty : 'medium';

  let typeGuide = 'Use multiple_choice and short_answer.';
  if (practiceMode === 'code-tracing') {
    typeGuide = 'Mostly coding_trace questions. Include a short codeSnippet and language (javascript, python, or sql). correctAnswer is the output or result. options may be empty.';
  } else if (practiceMode === 'worked-problems' || practiceMode === 'formula-drill') {
    typeGuide = 'Use numeric and worked_problem types. For numeric, correctAnswer is a number and numericTolerance is a small value like 0.01. For worked_problem, correctAnswer is the final result.';
  } else if (subject === 'computer-science' || subject === 'data-science') {
    typeGuide = 'Mix multiple_choice, short_answer, and coding_trace. Include codeSnippet when tracing code.';
  } else if (subject === 'calculus' || subject === 'statistics') {
    typeGuide = 'Mix multiple_choice, numeric, and worked_problem.';
  }

  const prompt = `Create exactly ${count} ${level} practice questions for a student.
Subject: ${subjectLabel}
Topic: ${topicLabel}
Mode: ${practiceMode}
${typeGuide}

Rules:
- Test understanding, not trivia
- Show enough context in the question to be answerable without extra material
- For code, keep snippets under 20 lines
- JSON fields: id, questionText, questionType, options, correctAnswer, briefExplanation, codeSnippet, language, numericTolerance
- questionType must be one of: multiple_choice, select_all, short_answer, numeric, coding_trace, worked_problem
- Never leave JSON unfinished`;

  const parsed = await generateJsonWithFallback(prompt, QUIZ_SCHEMA, {
    ...options,
    maxOutputTokens: 8192,
    temperature: 0.4,
  });
  const quiz = normalizeQuizQuestions(parsed, 'multiple_choice').slice(0, count);
  if (!quiz.length) {
    const error = new Error('Could not generate a practice set. Try a more specific topic.');
    error.statusCode = 502;
    throw error;
  }
  return quiz;
}

async function getFlashcardInteractionResponse(card, interactionType, userAnswer, userQuery, chatHistory = [], options = {}) {
  if (interactionType === 'submit_answer') {
    const prompt = `Flashcard term: "${card.term}"
Official definition: "${card.definition}"
Student answer: "${userAnswer || ''}"

Grade the student answer as correct, incorrect, or partial. Be generous with wording if the meaning matches. Feedback must be at most 50 words.`;
    try {
      const parsed = await generateJsonWithFallback(prompt, FEEDBACK_SCHEMA, {
        ...options,
        maxOutputTokens: 400,
      });
      const correctness = ['correct', 'incorrect', 'partial'].includes(parsed.correctness) ? parsed.correctness : 'incorrect';
      return { correctness, feedback: String(parsed.feedback || '').trim() || 'Checked.' };
    } catch (error) {
      console.warn('Flashcard feedback fallback:', error.message);
      const local = scoreLocally({ questionType: 'short_answer', correctAnswer: card.definition }, userAnswer);
      return { correctness: local.correctness, feedback: local.feedback };
    }
  }

  if (interactionType === 'request_explanation') {
    const prompt = `Explain this flashcard more fully for a student in at most 100 words.
Term: "${card.term}"
Definition: "${card.definition}"`;
    const { text } = await callGoogleAI(
      [{ role: 'user', parts: [{ text: prompt }] }],
      { maxOutputTokens: 280, thinkingConfig: { thinkingLevel: 'minimal' } },
      { modelName: modelFor(options), premium: options.premium }
    );
    return { explanation: text };
  }

  if (interactionType === 'chat_message') {
    const history = Array.isArray(chatHistory) ? chatHistory.slice(-8) : [];
    const contents = [
      ...history,
      { role: 'user', parts: [{ text: `Card term: ${card.term}\nDefinition: ${card.definition}\nStudent: ${userQuery}` }] },
    ];
    const { text } = await callGoogleAI(
      contents,
      { maxOutputTokens: 220, thinkingConfig: { thinkingLevel: 'minimal' } },
      { modelName: modelFor(options), premium: options.premium }
    );
    return {
      chatResponse: text,
      updatedChatHistory: [
        ...history,
        { role: 'user', parts: [{ text: userQuery }] },
        { role: 'model', parts: [{ text }] },
      ],
    };
  }

  const error = new Error('Unknown flashcard interaction type.');
  error.statusCode = 400;
  throw error;
}

async function getQuizAnswerFeedback(question, userAnswer, options = {}) {
  const local = scoreLocally(question, userAnswer);
  const prompt = `Question: "${question.questionText}"
Type: ${question.questionType}
Options: ${(question.options || []).join(' | ')}
Correct answer: ${Array.isArray(question.correctAnswer) ? question.correctAnswer.join(' | ') : question.correctAnswer}
Student answer: ${Array.isArray(userAnswer) ? userAnswer.join(' | ') : userAnswer}

Return correctness as correct, incorrect, or partial, plus brief encouraging feedback (max 40 words).`;
  try {
    const parsed = await generateJsonWithFallback(prompt, FEEDBACK_SCHEMA, {
      ...options,
      maxOutputTokens: 400,
    });
    const correctness = ['correct', 'incorrect', 'partial'].includes(parsed.correctness) ? parsed.correctness : local.correctness;
    return {
      correctness,
      feedback: String(parsed.feedback || '').trim() || local.feedback,
    };
  } catch (error) {
    console.warn('Quiz feedback fallback to local scoring:', error.message);
    return local;
  }
}

async function getQuizQuestionDetailedExplanation(question, options = {}) {
  const prompt = `Explain why this quiz answer is correct in at most 120 words. Teach the concept, do not just restate the answer.
Question: "${question.questionText}"
Correct answer: ${Array.isArray(question.correctAnswer) ? question.correctAnswer.join(', ') : question.correctAnswer}
Existing hint: ${question.briefExplanation || 'none'}`;
  const { text } = await callGoogleAI(
    [{ role: 'user', parts: [{ text: prompt }] }],
    { maxOutputTokens: 360, thinkingConfig: { thinkingLevel: 'minimal' } },
    { modelName: modelFor(options), premium: options.premium }
  );
  return { explanation: text };
}

async function chatAboutQuizQuestion(question, chatHistory, userQuery, options = {}) {
  const history = Array.isArray(chatHistory) ? chatHistory.slice(-8) : [];
  const contents = [
    ...history,
    {
      role: 'user',
      parts: [{
        text: `Quiz question: ${question.questionText}\nCorrect answer: ${Array.isArray(question.correctAnswer) ? question.correctAnswer.join(', ') : question.correctAnswer}\nStudent: ${userQuery}`,
      }],
    },
  ];
  const { text } = await callGoogleAI(
    contents,
    { maxOutputTokens: 220, thinkingConfig: { thinkingLevel: 'minimal' } },
    { modelName: modelFor(options), premium: options.premium }
  );
  return {
    chatResponse: text,
    updatedChatHistory: [
      ...history,
      { role: 'user', parts: [{ text: userQuery }] },
      { role: 'model', parts: [{ text }] },
    ],
  };
}

async function regenerateQuizQuestion(originalQuestion, textContext, difficultyHint, options = {}) {
  const source = truncateSource(textContext, options);
  const type = normalizeQuestionType(originalQuestion.questionType);
  const prompt = `Write ONE new ${type} question testing the same concept as the original, but worded differently.
Difficulty: ${difficultyHint || 'medium'}
Original: "${originalQuestion.questionText}"
If type is multiple_choice, provide 4 options.
If type is select_all, correctAnswer must be pipe-separated.
Use only this source:
${source}`;
  const parsed = await generateJsonWithFallback(prompt, SINGLE_QUESTION_SCHEMA, {
    ...options,
    maxOutputTokens: 1200,
  });
  const normalized = normalizeQuizQuestions([parsed], type);
  if (!normalized.length) {
    const error = new Error('Could not regenerate a valid replacement question.');
    error.statusCode = 502;
    throw error;
  }
  return normalized[0];
}

module.exports = {
  generateSummary,
  generateFlashcards,
  generateQuizWithOptions,
  explainTextSnippet,
  getFlashcardInteractionResponse,
  getQuizAnswerFeedback,
  getQuizQuestionDetailedExplanation,
  chatAboutQuizQuestion,
  regenerateQuizQuestion,
  extractTextFromImages,
  generatePracticeSet,
  isPremiumRequest,
  modelFor,
  FREE_MODEL,
  PREMIUM_MODEL,
};
