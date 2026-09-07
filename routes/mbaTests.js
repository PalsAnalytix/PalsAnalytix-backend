const express = require("express");
const MbaTest = require("../models/mbaTest");
const MbaStudent = require("../models/mbaStudent");
const MbaQuestion = require("../models/mbaQuestion");
const router = express.Router();

// Create a new test/assignment (starts as draft)
router.post("/", async (req, res) => {
  try {
    const { title, type, totalQuestions, timePerQuestionSeconds, tags, difficulty, questionSelectionMode } = req.body;
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

module.exports = router;
