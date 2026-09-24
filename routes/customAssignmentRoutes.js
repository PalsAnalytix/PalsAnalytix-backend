const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Question = require('../models/Question');
const CustomAssignment = require('../models/CustomAssignment');
const { authenticateUser } = require('../middleware/auth');

const rightAnswerMap = { 1: 'A', 2: 'B', 3: 'C', 4: 'D' };

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildQuestionQuery({ course, chapters, difficulty }) {
  const query = { courses: course };

  if (chapters && chapters.length > 0) {
    query.chapterName = {
      $in: chapters.map((c) => new RegExp(`^${escapeRegex(c)}$`, 'i')),
    };
  }

  if (difficulty && difficulty !== 'mixed') {
    query.difficulty = new RegExp(`^${escapeRegex(difficulty)}$`, 'i');
  }

  return query;
}

// GET /api/assignments/available-count?course=CFA&chapters=Ethics,Quant&difficulty=medium
router.get('/available-count', authenticateUser, async (req, res) => {
  try {
    const { course, difficulty } = req.query;
    const chapters = req.query.chapters
      ? req.query.chapters.split(',').map((c) => c.trim()).filter(Boolean)
      : [];

    if (!course) {
      return res.status(400).json({ message: 'course is required' });
    }

    const query = buildQuestionQuery({ course, chapters, difficulty });
    const count = await Question.countDocuments(query);

    res.json({ count });
  } catch (err) {
    console.error('available-count error:', err);
    res.status(500).json({ message: 'Server error checking available questions' });
  }
});

// POST /api/assignments  { course, chapters: [], difficulty, numQuestions }
router.post('/', authenticateUser, async (req, res) => {
  try {
    const { course, chapters = [], difficulty = 'mixed', numQuestions } = req.body;

    if (!course || !numQuestions || numQuestions < 1) {
      return res.status(400).json({ message: 'course and numQuestions are required' });
    }

    const query = buildQuestionQuery({ course, chapters, difficulty });
    const availableCount = await Question.countDocuments(query);

    if (availableCount === 0) {
      return res.status(400).json({
        message:
          'No questions match that selection. Try a different chapter or difficulty.',
      });
    }

    const sampleSize = Math.min(numQuestions, availableCount);

    const questions = await Question.aggregate([
      { $match: query },
      { $sample: { size: sampleSize } },
    ]);

    const timeLimitSeconds = sampleSize * 90; // 90 seconds per question

    const assignment = await CustomAssignment.create({
      student: req.userId,
      course,
      chapters,
      difficulty,
      numQuestions: sampleSize,
      timeLimitSeconds,
      questions: questions.map((q) => q._id),
      answers: questions.map((q) => ({ question: q._id })),
      status: 'in-progress',
    });

    // Strip correct answers/explanations before sending to the student
    const safeQuestions = questions.map((q) => ({
      _id: q._id,
      chapterName: q.chapterName,
      questionStatement: q.questionStatement,
      questionImage: q.questionImage,
      options: {
        optionA: q.options.optionA,
        optionAImage: q.options.optionAImage,
        optionB: q.options.optionB,
        optionBImage: q.options.optionBImage,
        optionC: q.options.optionC,
        optionCImage: q.options.optionCImage,
        optionD: q.options.optionD,
        optionDImage: q.options.optionDImage,
      },
      difficulty: q.difficulty,
    }));

    res.status(201).json({
      assignmentId: assignment._id,
      course,
      chapters,
      difficulty,
      numQuestions: sampleSize,
      requestedNumQuestions: numQuestions,
      timeLimitSeconds,
      questions: safeQuestions,
    });
  } catch (err) {
    console.error('create assignment error:', err);
    res.status(500).json({ message: 'Server error creating assignment' });
  }
});

// GET /api/assignments/history?course=CFA
router.get('/history', authenticateUser, async (req, res) => {
  try {
    const filter = { student: req.userId, status: 'completed' };
    if (req.query.course) filter.course = req.query.course;

    const history = await CustomAssignment.find(filter)
      .sort({ submittedAt: -1 })
      .select('course chapters difficulty numQuestions score totalTimeSpent submittedAt');

    res.json({ history });
  } catch (err) {
    console.error('assignment history error:', err);
    res.status(500).json({ message: 'Server error fetching history' });
  }
});

// GET /api/assignments/:id  (resume an in-progress assignment)
router.get('/:id', authenticateUser, async (req, res) => {
  try {
    const assignment = await CustomAssignment.findById(req.params.id).populate('questions');

    if (!assignment) return res.status(404).json({ message: 'Assignment not found' });
    if (String(assignment.student) !== String(req.userId)) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    if (assignment.status !== 'in-progress') {
      return res.status(400).json({ message: 'This assignment has already been submitted' });
    }

    const elapsedSeconds = Math.floor((Date.now() - assignment.startedAt.getTime()) / 1000);
    const remainingSeconds = Math.max(assignment.timeLimitSeconds - elapsedSeconds, 0);

    const safeQuestions = assignment.questions.map((q) => ({
      _id: q._id,
      chapterName: q.chapterName,
      questionStatement: q.questionStatement,
      questionImage: q.questionImage,
      options: {
        optionA: q.options.optionA,
        optionAImage: q.options.optionAImage,
        optionB: q.options.optionB,
        optionBImage: q.options.optionBImage,
        optionC: q.options.optionC,
        optionCImage: q.options.optionCImage,
        optionD: q.options.optionD,
        optionDImage: q.options.optionDImage,
      },
      difficulty: q.difficulty,
    }));

    res.json({
      assignmentId: assignment._id,
      course: assignment.course,
      chapters: assignment.chapters,
      difficulty: assignment.difficulty,
      numQuestions: assignment.numQuestions,
      timeLimitSeconds: assignment.timeLimitSeconds,
      remainingSeconds,
      questions: safeQuestions,
      answers: assignment.answers.map((a) => ({
        question: a.question,
        selectedOption: a.selectedOption,
        markedForReview: a.markedForReview,
      })),
    });
  } catch (err) {
    console.error('fetch assignment error:', err);
    res.status(500).json({ message: 'Server error fetching assignment' });
  }
});

// POST /api/assignments/:id/submit  { answers: [{ questionId, selectedOption, timeSpent }], totalTimeSpent }
router.post('/:id/submit', authenticateUser, async (req, res) => {
  try {
    const assignment = await CustomAssignment.findById(req.params.id).populate('questions');

    if (!assignment) return res.status(404).json({ message: 'Assignment not found' });
    if (String(assignment.student) !== String(req.userId)) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    if (assignment.status !== 'in-progress') {
      return res.status(400).json({ message: 'This assignment has already been submitted' });
    }

    const { answers = [], totalTimeSpent = 0 } = req.body;
    const answerMap = new Map(answers.map((a) => [String(a.questionId), a]));

    let score = 0;
    const gradedAnswers = assignment.questions.map((q) => {
      const submitted = answerMap.get(String(q._id));
      const selectedOption = submitted?.selectedOption || null;
      const correctLetter = rightAnswerMap[q.rightAnswer];
      const isCorrect = !!selectedOption && selectedOption === correctLetter;
      if (isCorrect) score += 1;

      return {
        question: q._id,
        selectedOption,
        isCorrect,
        timeSpent: submitted?.timeSpent || 0,
        markedForReview: submitted?.markedForReview || false,
      };
    });

    assignment.answers = gradedAnswers;
    assignment.score = score;
    assignment.totalTimeSpent = totalTimeSpent;
    assignment.status = 'completed';
    assignment.submittedAt = new Date();
    await assignment.save();

    res.json({
      assignmentId: assignment._id,
      score,
      numQuestions: assignment.numQuestions,
      totalTimeSpent,
    });
  } catch (err) {
    console.error('submit assignment error:', err);
    res.status(500).json({ message: 'Server error submitting assignment' });
  }
});

// GET /api/assignments/:id/review  (full breakdown after completion)
router.get('/:id/review', authenticateUser, async (req, res) => {
  try {
    const assignment = await CustomAssignment.findById(req.params.id).populate('questions');

    if (!assignment) return res.status(404).json({ message: 'Assignment not found' });
    if (String(assignment.student) !== String(req.userId)) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    if (assignment.status !== 'completed') {
      return res.status(400).json({ message: 'This assignment has not been submitted yet' });
    }

    const answerByQuestionId = new Map(
      assignment.answers.map((a) => [String(a.question), a])
    );

    const review = assignment.questions.map((q) => {
      const a = answerByQuestionId.get(String(q._id)) || {};
      return {
        _id: q._id,
        chapterName: q.chapterName,
        questionStatement: q.questionStatement,
        questionImage: q.questionImage,
        options: q.options,
        difficulty: q.difficulty,
        correctOption: rightAnswerMap[q.rightAnswer],
        explanation: q.explanation,
        explanationImage: q.explanationImage,
        selectedOption: a.selectedOption || null,
        isCorrect: !!a.isCorrect,
        timeSpent: a.timeSpent || 0,
      };
    });

    res.json({
      assignmentId: assignment._id,
      course: assignment.course,
      chapters: assignment.chapters,
      difficulty: assignment.difficulty,
      score: assignment.score,
      numQuestions: assignment.numQuestions,
      totalTimeSpent: assignment.totalTimeSpent,
      submittedAt: assignment.submittedAt,
      review,
    });
  } catch (err) {
    console.error('assignment review error:', err);
    res.status(500).json({ message: 'Server error fetching review' });
  }
});

module.exports = router;
