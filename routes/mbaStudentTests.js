
const express = require("express");
const MbaTest = require("../models/mbaTest");
const MbaAttempt = require("../models/mbaAttempt");
const router = express.Router();
const MbaQuestion = require("../models/mbaQuestion");

// List tests this student is allowed to take
router.get("/", async (req, res) => {
  try {
    const studentId = req.mbaStudent.id;
    const tests = await MbaTest.find({
      status: "published",
      allowedStudentIds: studentId,
    }).select("-questionFilter");

    // For each test, check if the student already has an attempt
    const testsWithStatus = await Promise.all(
      tests.map(async (test) => {
        const attempts = await MbaAttempt.find({ testId: test._id, studentId }).sort({ attemptNumber: -1 });
        const latest = attempts[0];
        const hasRetake = test.retakesAllowedFor.some((id) => id.toString() === studentId);
        const canStart =
          !latest ||
          latest.status === "in_progress" ||
          (latest.status === "submitted" && hasRetake);

        return {
          _id: test._id,
          title: test.title,
          type: test.type,
          totalQuestions: test.totalQuestions,
          timePerQuestionSeconds: test.timePerQuestionSeconds,
          latestAttemptStatus: latest ? latest.status : null,
          latestAttemptId: latest ? latest._id : null,
          canStart,
        };
      })
    );

    res.status(200).json(testsWithStatus);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sanitizeQuestion(q) {
  return {
    _id: q._id,
    questionNumber: q.questionNumber,
    text: q.text,
    options: q.options,
    questionImage: q.questionImage,
    optionImages: q.optionImages,
  };
}

// Start (or resume) an attempt for a test
router.post("/:testId/start", async (req, res) => {
  try {
    const studentId = req.mbaStudent.id;
    const test = await MbaTest.findById(req.params.testId);
    if (!test || test.status !== "published") {
      return res.status(404).json({ error: "Test not found or not published" });
    }
    if (!test.allowedStudentIds.some((id) => id.toString() === studentId)) {
      return res.status(403).json({ error: "You don't have access to this test" });
    }

    const existing = await MbaAttempt.findOne({ testId: test._id, studentId }).sort({ attemptNumber: -1 });

    if (existing && existing.status === "in_progress") {
      const questions = await MbaQuestion.find({ _id: { $in: existing.questionsServed.map((q) => q.questionId) } });
      const qMap = Object.fromEntries(questions.map((q) => [q._id.toString(), q]));
      return res.status(200).json({
        attemptId: existing._id,
        timeRemainingSec: existing.timeRemainingSec,
        questions: existing.questionsServed
          .sort((a, b) => a.order - b.order)
          .map((qs) => ({
            ...sanitizeQuestion(qMap[qs.questionId.toString()]),
            order: qs.order,
            answerGiven: qs.answerGiven,
            markedForReview: qs.markedForReview,
            visited: qs.visited,
          })),
      });
    }

    if (existing && existing.status === "submitted") {
      const hasRetake = test.retakesAllowedFor.some((id) => id.toString() === studentId);
      if (!hasRetake) {
        return res.status(403).json({ error: "You've already completed this test. Ask your admin for a retake." });
      }
    }

    let questionIds;
    if (test.questionSelectionMode === "fixed") {
      questionIds = shuffle(test.fixedQuestionIds);
    } else {
      const filter = {};
      if (test.questionFilter?.tags?.length) filter.tags = { $in: test.questionFilter.tags };
      if (test.questionFilter?.difficulty) filter.difficulty = test.questionFilter.difficulty;
      const picked = await MbaQuestion.aggregate([{ $match: filter }, { $sample: { size: test.totalQuestions } }]);
      if (picked.length < test.totalQuestions) {
        return res.status(400).json({ error: "Not enough questions available for this test right now." });
      }
      questionIds = picked.map((q) => q._id);
    }

    const attemptNumber = existing ? existing.attemptNumber + 1 : 1;

    const attempt = await MbaAttempt.create({
      testId: test._id,
      studentId,
      attemptNumber,
      status: "in_progress",
      timeRemainingSec: test.totalQuestions * test.timePerQuestionSeconds,
      startedAt: new Date(),
      questionsServed: questionIds.map((qid, i) => ({
        questionId: qid,
        order: i,
        answerGiven: null,
        markedForReview: false,
        visited: false,
      })),
    });

    const questions = await MbaQuestion.find({ _id: { $in: questionIds } });
    const qMap = Object.fromEntries(questions.map((q) => [q._id.toString(), q]));

    res.status(201).json({
      attemptId: attempt._id,
      timeRemainingSec: attempt.timeRemainingSec,
      questions: attempt.questionsServed
        .sort((a, b) => a.order - b.order)
        .map((qs) => ({
          ...sanitizeQuestion(qMap[qs.questionId.toString()]),
          order: qs.order,
          answerGiven: qs.answerGiven,
          markedForReview: qs.markedForReview,
          visited: qs.visited,
        })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
module.exports = router;
