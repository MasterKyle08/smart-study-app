/**
 * @file backend/routes/premade.js
 * @description Routes for managing premade quizzes.
 */

const express = require('express');
const authenticateToken = require('../middleware/auth');
const premadeService = require('../services/premade');
const aiJob = require('../services/aiJob');
const { aiInput } = require('../utils/input');

const router = express.Router();
router.use(aiInput, aiJob.attachSignal);

router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    const quizzes = await premadeService.listPremadeQuizzes({ search });
    res.status(200).json({ quizzes });
  } catch (error) {
    console.error('[GET /api/premade] Error:', error.message);
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to load premade quizzes.' });
  }
});

router.get('/mine/list', authenticateToken, async (req, res) => {
  try {
    const quizzes = await premadeService.listMine(req.user.id);
    res.status(200).json({ quizzes });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to load your quizzes.' });
  }
});

router.get('/:slug', async (req, res) => {
  try {
    const { userFromRequest } = require('../middleware/auth');
    const requester = await userFromRequest(req);
    const userId = requester ? requester.id : null;
    const quiz = await premadeService.getPremadeQuiz(req.params.slug, { userId });
    if (!quiz) {
      return res.status(404).json({ message: 'Premade quiz not found.' });
    }
    res.status(200).json({ quiz });
  } catch (error) {
    console.error(`[GET /api/premade/${req.params.slug}] Error:`, error.message);
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to load premade quiz.' });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const quiz = await aiJob.run(req, async ({ premium }) => {
      const created = await premadeService.createPremadeQuiz({
      userId: req.user.id,
      title: req.body.title,
      description: req.body.description,
      topic: req.body.topic,
      tags: req.body.tags,
      quizOptions: req.body.quizOptions,
      sourceText: req.body.sourceText,
      customInstructions: req.body.customInstructions,
      premium,
      isPublic: req.body.isPublic === true,
    });
      return created;
    }, { action: true });
    res.status(201).json({ quiz });
  } catch (error) {
    console.error('[POST /api/premade] Error:', error.message);
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to create premade quiz.', usage: error.usage });
  }
});

router.put('/:slug', authenticateToken, async (req, res) => {
  try {
    const quiz = await premadeService.updatePremadeQuiz(req.params.slug, req.user.id, {
      title: req.body.title,
      description: req.body.description,
      topic: req.body.topic,
      tags: req.body.tags,
      isPublic: req.body.isPublic,
    });
    res.status(200).json({ quiz });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to update quiz.' });
  }
});

router.delete('/:slug', authenticateToken, async (req, res) => {
  try {
    await premadeService.deletePremadeQuiz(req.params.slug, req.user.id);
    res.status(200).json({ message: 'Quiz deleted.' });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to delete quiz.' });
  }
});

module.exports = router;
