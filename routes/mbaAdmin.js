const express = require("express");
const bcrypt = require("bcrypt");
const MbaStudent = require("../models/mbaStudent");
const router = express.Router();
const MbaAttempt = require("../models/mbaAttempt");
const MbaTest = require("../models/mbaTest");

// Create a new student account
router.post("/students", async (req, res) => {
  try {
    const { username, fullName, password } = req.body;

    if (!username || !fullName || !password) {
      return res.status(400).json({ error: "username, fullName, and password are all required" });
    }

    const existing = await MbaStudent.findOne({ username });
    if (existing) {
      return res.status(400).json({ error: "That username is already taken" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const student = await MbaStudent.create({
      username,
      fullName,
      passwordHash,
      status: "active",
    });

    res.status(201).json({
      id: student._id,
      username: student.username,
      fullName: student.fullName,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List all students
router.get("/students", async (req, res) => {
  try {
    const students = await MbaStudent.find().select("-passwordHash");
    res.status(200).json(students);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a student
router.delete("/students/:id", async (req, res) => {
  try {
    const deleted = await MbaStudent.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Student not found" });
    res.status(200).json({ message: "Student deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
const { S3Client, PutBucketPolicyCommand, PutPublicAccessBlockCommand } = require("@aws-sdk/client-s3");

// One-time fix: make the S3 bucket's images publicly viewable
router.post("/fix-bucket-permissions", async (req, res) => {
  try {
    const s3Client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    const bucket = process.env.AWS_BUCKET_NAME;

    await s3Client.send(new PutPublicAccessBlockCommand({
      Bucket: bucket,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: false,
        IgnorePublicAcls: false,
        BlockPublicPolicy: false,
        RestrictPublicBuckets: false,
      },
    }));

    const policy = {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "PublicReadGetObject",
          Effect: "Allow",
          Principal: "*",
          Action: "s3:GetObject",
          Resource: `arn:aws:s3:::${bucket}/*`,
        },
      ],
    };

    await s3Client.send(new PutBucketPolicyCommand({
      Bucket: bucket,
      Policy: JSON.stringify(policy),
    }));

    res.status(200).json({ message: `Bucket "${bucket}" is now publicly readable.` });
  } catch (error) {
    res.status(500).json({ error: error.message, code: error.name });
  }
});

// Performance across all students, all tests
router.get("/performance", async (req, res) => {
  try {
    const attempts = await MbaAttempt.find({ status: "submitted" })
      .populate("studentId", "username fullName")
      .populate("testId", "title type")
      .sort({ submittedAt: -1 });

    const results = attempts
      .filter((a) => a.studentId && a.testId)
      .map((a) => ({
        attemptId: a._id,
        studentUsername: a.studentId.username,
        studentFullName: a.studentId.fullName,
        testTitle: a.testId.title,
        testType: a.testId.type,
        score: a.score,
        totalCorrect: a.totalCorrect,
        totalQuestions: a.questionsServed.length,
        attemptNumber: a.attemptNumber,
        autoSubmitted: a.autoSubmitted,
        submittedAt: a.submittedAt,
      }));

    res.status(200).json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
