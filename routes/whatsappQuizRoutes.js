const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const User = require('../models/User');
const Question = require('../models/Question');
const { authenticateUser } = require('../middleware/auth');

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const DIFFICULTY_VALUES = ['easy', 'medium', 'hard', 'mixed'];
const COURSE_VALUES = ['CFA', 'FRM', 'SCR', 'EXCEL', 'ADVANCED_EXCEL', 'EXCEL_FOR_FINANCE'];

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

function isCoursePremiumActive(user, course) {
  const entry = user.coursePremium?.find((c) => c.course === course);
  return !!(entry && entry.status === 'ACTIVE' && new Date(entry.expiryDate) > new Date());
}

// GET /api/whatsapp-quiz/:course — get this student's preference for a course
router.get('/:course', authenticateUser, async (req, res) => {
  try {
    const { course } = req.params;
    if (!COURSE_VALUES.includes(course)) {
      return res.status(400).json({ message: 'Invalid course' });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const pref = user.whatsappQuizPreferences?.find((p) => p.course === course);

    res.json({
      course,
      chapters: pref?.chapters || [],
      difficulty: pref?.difficulty || 'mixed',
      questionsPerDay: pref?.questionsPerDay || 3,
      active: pref?.active || false,
      phoneNumber: user.phoneNumber,
    });
  } catch (err) {
    console.error('get whatsapp quiz preference error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/whatsapp-quiz/:course — create/update this student's preference
router.put('/:course', authenticateUser, async (req, res) => {
  try {
    const { course } = req.params;
    if (!COURSE_VALUES.includes(course)) {
      return res.status(400).json({ message: 'Invalid course' });
    }

    const { chapters = [], difficulty = 'mixed', questionsPerDay = 3, active = true } = req.body;

    if (!DIFFICULTY_VALUES.includes(difficulty)) {
      return res.status(400).json({ message: 'Invalid difficulty' });
    }
    const count = Number(questionsPerDay);
    if (!count || count < 1 || count > 10) {
      return res.status(400).json({ message: 'questionsPerDay must be between 1 and 10' });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!isCoursePremiumActive(user, course)) {
      return res.status(403).json({ message: 'You do not have active access to this course' });
    }

    if (!user.whatsappQuizPreferences) user.whatsappQuizPreferences = [];
    const existingIndex = user.whatsappQuizPreferences.findIndex((p) => p.course === course);

    const updated = {
      course,
      chapters,
      difficulty,
      questionsPerDay: count,
      active: !!active,
      lastSentDate: existingIndex >= 0 ? user.whatsappQuizPreferences[existingIndex].lastSentDate : null,
    };

    if (existingIndex >= 0) {
      user.whatsappQuizPreferences[existingIndex] = updated;
    } else {
      user.whatsappQuizPreferences.push(updated);
    }

    await user.save();
    res.json({ message: 'Preference saved', preference: updated });
  } catch (err) {
    console.error('save whatsapp quiz preference error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// INTERNAL/CRON ENDPOINT — sends the day's WhatsApp quiz questions to every
// student with an active preference. Protected the same way as the existing
// /api/assign-daily-questions route: a shared secret header, not user auth.
router.post('/send-daily', async (req, res) => {
  if (req.headers['x-internal-cron-secret'] !== process.env.INTERNAL_CRON_SECRET) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const users = await User.find({ 'whatsappQuizPreferences.0': { $exists: true } });
    const results = [];

    for (const user of users) {
      for (const pref of user.whatsappQuizPreferences || []) {
        if (!pref.active) continue;
        if (!isCoursePremiumActive(user, pref.course)) continue;

        try {
          const query = buildQuestionQuery({
            course: pref.course,
            chapters: pref.chapters,
            difficulty: pref.difficulty,
          });

          const questions = await Question.aggregate([
            { $match: query },
            { $sample: { size: pref.questionsPerDay } },
          ]);

          if (questions.length === 0) {
            results.push({ userId: user._id, course: pref.course, status: 'no_questions' });
            continue;
          }

          const rightAnswerMap = { 1: 'A', 2: 'B', 3: 'C', 4: 'D' };
          const toNumber = user.phoneNumber.startsWith('+')
            ? user.phoneNumber
            : `+${user.phoneNumber}`;

          for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            const correctLetter = rightAnswerMap[q.rightAnswer] || q.rightAnswer;
            const messageBody =
              `📘 ${pref.course} Daily Practice — Question ${i + 1}/${questions.length}\n\n` +
              `${q.questionStatement}\n\n` +
              `A. ${q.options.optionA}\n` +
              `B. ${q.options.optionB}\n` +
              `C. ${q.options.optionC}\n` +
              `D. ${q.options.optionD}\n\n` +
              `✅ Answer: ${correctLetter}\n` +
              `📝 ${q.explanation}`;

            await twilioClient.messages.create({
              from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
              to: `whatsapp:${toNumber}`,
              body: messageBody,
            });
          }

          pref.lastSentDate = new Date();
          results.push({ userId: user._id, course: pref.course, status: 'sent', count: questions.length });
        } catch (sendErr) {
          console.error(`Failed to send WhatsApp quiz to ${user._id} for ${pref.course}:`, sendErr.message);
          results.push({ userId: user._id, course: pref.course, status: 'failed', error: sendErr.message });
        }
      }
      await user.save();
    }

    res.json({ message: 'WhatsApp quiz send complete', results });
  } catch (err) {
    console.error('send-daily whatsapp quiz error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
