
const express = require("express");
const MbaTest = require("../models/mbaTest");
const MbaAttempt = require("../models/mbaAttempt");
const router = express.Router();
const MbaQuestion = require("../models/mbaQuestion");
const multer = require("multer");
const multerS3 = require("multer-s3");
const { S3Client } = require("@aws-sdk/client-s3");

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

        let usedRetake = false;
    if (existing && existing.status === "submitted") {
      const hasRetake = test.retakesAllowedFor.some((id) => id.toString() === studentId);
      if (!hasRetake) {
        return res.status(403).json({ error: "You've already completed this test. Ask your admin for a retake." });
      }
      usedRetake = true;
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
    if (usedRetake) {
      await MbaTest.findByIdAndUpdate(test._id, { $pull: { retakesAllowedFor: studentId } });
    }
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
async function finalizeAttempt(attempt, autoSubmitted) {
  const questions = await MbaQuestion.find({ _id: { $in: attempt.questionsServed.map((q) => q.questionId) } });
  const qMap = Object.fromEntries(questions.map((q) => [q._id.toString(), q]));
  let totalCorrect = 0;
  attempt.questionsServed.forEach((qs) => {
    const q = qMap[qs.questionId.toString()];
    if (q && qs.answerGiven !== null && qs.answerGiven === q.correctOptionIndex) {
      totalCorrect++;
    }
  });
  attempt.totalCorrect = totalCorrect;
  attempt.score = Math.round((totalCorrect / attempt.questionsServed.length) * 100);
  attempt.status = "submitted";
  attempt.submittedAt = new Date();
  attempt.autoSubmitted = !!autoSubmitted;
  await attempt.save();
  return attempt;
}

// Save an answer / mark for review / mark visited
router.post("/attempts/:attemptId/answer", async (req, res) => {
  try {
    const studentId = req.mbaStudent.id;
    const { questionId, answerGiven, markedForReview } = req.body;
    const attempt = await MbaAttempt.findOne({ _id: req.params.attemptId, studentId });
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });
    if (attempt.status !== "in_progress") return res.status(400).json({ error: "This attempt is no longer active" });

    const qs = attempt.questionsServed.find((q) => q.questionId.toString() === questionId);
    if (!qs) return res.status(400).json({ error: "Question not part of this attempt" });

    qs.visited = true;
    if (answerGiven !== undefined) qs.answerGiven = answerGiven;
    if (markedForReview !== undefined) qs.markedForReview = markedForReview;

    await attempt.save();
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Timer heartbeat — client reports elapsed seconds, server is the source of truth
router.post("/attempts/:attemptId/sync", async (req, res) => {
  try {
    const studentId = req.mbaStudent.id;
    const { elapsedSec } = req.body;
    const attempt = await MbaAttempt.findOne({ _id: req.params.attemptId, studentId });
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });
    if (attempt.status !== "in_progress") {
      return res.status(200).json({ timeRemainingSec: 0, status: attempt.status });
    }

    attempt.timeRemainingSec = Math.max(0, attempt.timeRemainingSec - (elapsedSec || 0));

    if (attempt.timeRemainingSec <= 0) {
      await finalizeAttempt(attempt, true);
      return res.status(200).json({ timeRemainingSec: 0, status: "submitted", autoSubmitted: true });
    }

    await attempt.save();
    res.status(200).json({ timeRemainingSec: attempt.timeRemainingSec, status: "in_progress" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manual submit
router.post("/attempts/:attemptId/submit", async (req, res) => {
  try {
    const studentId = req.mbaStudent.id;
    const attempt = await MbaAttempt.findOne({ _id: req.params.attemptId, studentId });
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });
    if (attempt.status !== "in_progress") {
      return res.status(400).json({ error: "This attempt has already been submitted" });
    }
    await finalizeAttempt(attempt, false);
    res.status(200).json({ success: true, attemptId: attempt._id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Full results with answer review
router.get("/attempts/:attemptId/results", async (req, res) => {
  try {
    const studentId = req.mbaStudent.id;
    const attempt = await MbaAttempt.findOne({ _id: req.params.attemptId, studentId });
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });
    if (attempt.status !== "submitted") return res.status(400).json({ error: "This attempt has not been submitted yet" });

    const questions = await MbaQuestion.find({ _id: { $in: attempt.questionsServed.map((q) => q.questionId) } });
    const qMap = Object.fromEntries(questions.map((q) => [q._id.toString(), q]));

    const review = attempt.questionsServed
      .sort((a, b) => a.order - b.order)
      .map((qs) => {
        const q = qMap[qs.questionId.toString()];
        return {
          text: q.text,
          options: q.options,
          questionImage: q.questionImage,
          optionImages: q.optionImages,
          correctOptionIndex: q.correctOptionIndex,
          solution: q.solution,
          answerGiven: qs.answerGiven,
          isCorrect: qs.answerGiven !== null && qs.answerGiven === q.correctOptionIndex,
        };
      });

    res.status(200).json({
      score: attempt.score,
      totalCorrect: attempt.totalCorrect,
      totalQuestions: attempt.questionsServed.length,
      autoSubmitted: attempt.autoSubmitted,
      review,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// A student's own recent performance history (last 5 submitted attempts, any test)
// A student's own recent performance history, any test
router.get("/attempts/history", async (req, res) => {
  try {
    const studentId = req.mbaStudent.id;
    const limit = Math.min(parseInt(req.query.limit) || 5, 50);
    const attempts = await MbaAttempt.find({ studentId, status: "submitted" })
      .populate("testId", "title type")
      .sort({ submittedAt: -1 })
      .limit(limit);

    const history = attempts
      .filter((a) => a.testId)
      .map((a) => ({
        attemptId: a._id,
        testTitle: a.testId.title,
        testType: a.testId.type,
        score: a.score,
        totalCorrect: a.totalCorrect,
        totalQuestions: a.questionsServed.length,
        submittedAt: a.submittedAt,
      }))
      .reverse(); // oldest to newest, so a trend chart reads left-to-right chronologically

    res.status(200).json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Document upload (Excel/Word working files) — separate from the image uploader
const s3ClientForDocs = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
const ALLOWED_DOC_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/msword", // .doc
];
const uploadDoc = multer({
  storage: multerS3({
    s3: s3ClientForDocs,
    bucket: process.env.AWS_BUCKET_NAME,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, `submissions/${unique}-${file.originalname}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    if (ALLOWED_DOC_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only Excel (.xlsx, .xls) or Word (.docx, .doc) files are allowed."), false);
  },
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

// Submit a working file for an already-submitted attempt
router.post("/attempts/:attemptId/submit-file", (req, res) => {
  uploadDoc.single("file")(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    try {
      const studentId = req.mbaStudent.id;
      const attempt = await MbaAttempt.findOne({ _id: req.params.attemptId, studentId });
      if (!attempt) return res.status(404).json({ error: "Attempt not found" });
      if (attempt.status !== "submitted") {
        return res.status(400).json({ error: "Submit your test answers first, then upload your working file." });
      }
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      const url = `https://s3.${process.env.AWS_REGION}.amazonaws.com/${process.env.AWS_BUCKET_NAME}/${req.file.key}`;
      attempt.submittedFile = {
        url,
        filename: req.file.originalname,
        uploadedAt: new Date(),
      };
      await attempt.save();

      res.status(200).json({ success: true, submittedFile: attempt.submittedFile });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
});
module.exports = router;
