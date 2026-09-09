const express = require("express");
const MbaTest = require("../models/mbaTest");
const MbaStudent = require("../models/mbaStudent");
const MbaQuestion = require("../models/mbaQuestion");
const router = express.Router();
const MbaAttempt = require("../models/mbaAttempt");

// Create a new test/assignment (starts as draft)
router.post("/", async (req, res) => {
  try {
        const { title, type, totalQuestions, timePerQuestionSeconds, tags, difficulty, questionSelectionMode, requiresFileSubmission } = req.body;
    if (!title || !type || !totalQuestions || !timePerQuestionSeconds) {
      return res.status(400).json({ error: "title, type, totalQuestions, and timePerQuestionSeconds are required" });
    }

    const tagList = tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
    const filter = {};
    if (tagList.length) filter.tags = { $in: tagList };
    if (difficulty) filter.difficulty = difficulty;

    const mode = questionSelectionMode === "fixed" ? "fixed" : "random";
    let fixedQuestionIds = [];

    if (mode === "fixed") {
      const picked = await MbaQuestion.aggregate([
        { $match: filter },
        { $sample: { size: totalQuestions } },
      ]);
      if (picked.length < totalQuestions) {
        return res.status(400).json({
          error: `Only ${picked.length} matching questions found in the bank, but ${totalQuestions} were requested.`,
        });
      }
      fixedQuestionIds = picked.map((q) => q._id);
    }

    const test = await MbaTest.create({
      title,
      type,
      totalQuestions,
      timePerQuestionSeconds,
      questionFilter: { tags: tagList, difficulty: difficulty || undefined },
      questionSelectionMode: mode,
      fixedQuestionIds,
      status: "draft",
      requiresFileSubmission: !!requiresFileSubmission,
    });
    res.status(201).json(test);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List all tests
router.get("/", async (req, res) => {
  try {
    const tests = await MbaTest.find().populate("allowedStudentIds", "username fullName");
    res.status(200).json(tests);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Publish / unpublish
router.patch("/:id/publish", async (req, res) => {
  try {
    const test = await MbaTest.findByIdAndUpdate(req.params.id, { status: "published" }, { new: true });
    if (!test) return res.status(404).json({ error: "Test not found" });
    res.status(200).json(test);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch("/:id/unpublish", async (req, res) => {
  try {
    const test = await MbaTest.findByIdAndUpdate(req.params.id, { status: "draft" }, { new: true });
    if (!test) return res.status(404).json({ error: "Test not found" });
    res.status(200).json(test);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Grant access to students by username
router.post("/:id/grant-access", async (req, res) => {
  try {
    const { usernames } = req.body;
    const students = await MbaStudent.find({ username: { $in: usernames } });
    if (!students.length) return res.status(404).json({ error: "No matching students found" });

    const test = await MbaTest.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { allowedStudentIds: { $each: students.map((s) => s._id) } } },
      { new: true }
    ).populate("allowedStudentIds", "username fullName");

    const foundUsernames = students.map((s) => s.username);
    const notFound = usernames.filter((u) => !foundUsernames.includes(u));

    res.status(200).json({ test, notFound });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Revoke access
router.post("/:id/revoke-access", async (req, res) => {
  try {
    const { usernames } = req.body;
    const students = await MbaStudent.find({ username: { $in: usernames } });

    const test = await MbaTest.findByIdAndUpdate(
      req.params.id,
      { $pull: { allowedStudentIds: { $in: students.map((s) => s._id) } } },
      { new: true }
    ).populate("allowedStudentIds", "username fullName");

    res.status(200).json(test);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Grant a retake to one student
router.post("/:id/grant-retake", async (req, res) => {
  try {
    const { username } = req.body;
    const student = await MbaStudent.findOne({ username });
    if (!student) return res.status(404).json({ error: "Student not found" });

    const test = await MbaTest.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { retakesAllowedFor: student._id } },
      { new: true }
    );
    res.status(200).json(test);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router.get("/:testId/dashboard", async (req, res) => {
  try {
    const test = await MbaTest.findById(req.params.testId).populate("allowedStudentIds", "username fullName");
    if (!test) return res.status(404).json({ error: "Test not found" });

    const allAttempts = await MbaAttempt.find({ testId: test._id, status: "submitted" })
      .populate("studentId", "username fullName")
      .sort({ attemptNumber: -1 });

    // Keep only each student's most recent submitted attempt
    const latestByStudent = {};
    allAttempts.forEach((a) => {
      if (!a.studentId) return;
      const key = a.studentId._id.toString();
      if (!latestByStudent[key]) latestByStudent[key] = a;
    });
    const attempts = Object.values(latestByStudent);

    const enrolled = test.allowedStudentIds.length;
    const participated = attempts.length;
    const scores = attempts.map((a) => a.score);

    const average = scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0;
    const sorted = [...scores].sort((a, b) => a - b);
    const median = sorted.length
      ? sorted.length % 2 === 0
        ? Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)
        : sorted[(sorted.length - 1) / 2]
      : 0;
    const highest = scores.length ? Math.max(...scores) : 0;
    const lowest = scores.length ? Math.min(...scores) : 0;

    const passingScore = test.passingScore ?? 50;
    const passCount = scores.filter((s) => s >= passingScore).length;
    const passRate = scores.length ? Math.round((passCount / scores.length) * 100) : 0;

    const buckets = { "0-50": 0, "51-70": 0, "71-85": 0, "86-100": 0 };
    scores.forEach((s) => {
      if (s <= 50) buckets["0-50"]++;
      else if (s <= 70) buckets["51-70"]++;
      else if (s <= 85) buckets["71-85"]++;
      else buckets["86-100"]++;
    });

    const getGrade = (score) => {
      if (score >= 90) return "A";
      if (score >= 80) return "B";
      if (score >= 70) return "C";
      if (score >= 60) return "D";
      return "F";
    };
    const gradeCounts = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    scores.forEach((s) => { gradeCounts[getGrade(s)]++; });

    const questionIds = new Set();
    attempts.forEach((a) => a.questionsServed.forEach((qs) => questionIds.add(qs.questionId.toString())));
    const questions = await MbaQuestion.find({ _id: { $in: Array.from(questionIds) } });
    const qMap = Object.fromEntries(questions.map((q) => [q._id.toString(), q]));

    const questionStats = {};
    attempts.forEach((a) => {
      a.questionsServed.forEach((qs) => {
        const qid = qs.questionId.toString();
        const q = qMap[qid];
        if (!q) return;
        if (!questionStats[qid]) {
          questionStats[qid] = { text: q.text, questionNumber: q.questionNumber, correct: 0, total: 0, tags: q.tags || [] };
        }
        questionStats[qid].total++;
        if (qs.answerGiven !== null && qs.answerGiven === q.correctOptionIndex) {
          questionStats[qid].correct++;
        }
      });
    });
    const questionHeatmap = Object.values(questionStats)
      .map((qs) => ({
        questionNumber: qs.questionNumber,
        text: qs.text,
        accuracy: qs.total ? Math.round((qs.correct / qs.total) * 100) : 0,
        totalAnswered: qs.total,
      }))
      .sort((a, b) => a.accuracy - b.accuracy);

    const topicStats = {};
    Object.values(questionStats).forEach((qs) => {
      (qs.tags.length ? qs.tags : ["untagged"]).forEach((tag) => {
        if (!topicStats[tag]) topicStats[tag] = { correct: 0, total: 0 };
        topicStats[tag].correct += qs.correct;
        topicStats[tag].total += qs.total;
      });
    });
    const topicMastery = Object.entries(topicStats)
      .map(([tag, s]) => ({ tag, accuracy: s.total ? Math.round((s.correct / s.total) * 100) : 0 }))
      .sort((a, b) => b.accuracy - a.accuracy);

        const roster = attempts.map((a) => ({
      studentId: a.studentId._id,
      fullName: a.studentId.fullName,
      username: a.studentId.username,
      score: a.score,
      totalCorrect: a.totalCorrect,
      totalQuestions: a.questionsServed.length,
      grade: getGrade(a.score),
      passed: a.score >= passingScore,
      attemptNumber: a.attemptNumber,
      autoSubmitted: a.autoSubmitted,
      submittedAt: a.submittedAt,
      submittedFile: a.submittedFile || null,
    }));

    res.status(200).json({
      testTitle: test.title,
      requiresFileSubmission: test.requiresFileSubmission,
      passingScore,
      enrolled,
      participated,
      average,
      median,
      highest,
      lowest,
      passRate,
      distribution: buckets,
      gradeCounts,
      questionHeatmap,
      topicMastery,
      roster,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a test — hard delete if never attempted, otherwise archive (preserves student records)
router.delete("/:id", async (req, res) => {
  try {
    const test = await MbaTest.findById(req.params.id);
    if (!test) return res.status(404).json({ error: "Test not found" });

    const attemptCount = await MbaAttempt.countDocuments({ testId: test._id });

    if (attemptCount === 0) {
      await MbaTest.findByIdAndDelete(test._id);
      return res.status(200).json({ message: "Test deleted (no student attempts existed).", archived: false });
    }

    test.status = "archived";
    await test.save();
    res.status(200).json({
      message: `Test archived instead of deleted — ${attemptCount} student attempt(s) exist and were preserved.`,
      archived: true,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bring an archived test back (as a draft, so it doesn't immediately go live)
router.patch("/:id/unarchive", async (req, res) => {
  try {
    const test = await MbaTest.findByIdAndUpdate(req.params.id, { status: "draft" }, { new: true });
    if (!test) return res.status(404).json({ error: "Test not found" });
    res.status(200).json(test);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
module.exports = router;
