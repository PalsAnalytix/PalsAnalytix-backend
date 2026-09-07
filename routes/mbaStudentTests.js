const express = require("express");
const MbaTest = require("../models/mbaTest");
const MbaAttempt = require("../models/mbaAttempt");
const router = express.Router();

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

module.exports = router;
