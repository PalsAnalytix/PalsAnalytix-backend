const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const MbaQuestion = require("../models/mbaQuestion");
const router = express.Router();

const upload = multer({ dest: "/tmp/uploads/" });

// Add one question manually
router.post("/", async (req, res) => {
  try {
    const { text, options, correctOptionIndex, tags, difficulty } = req.body;
    if (!text || !options || options.length !== 4 || correctOptionIndex === undefined) {
      return res.status(400).json({ error: "text, 4 options, and correctOptionIndex are required" });
    }
    const question = await MbaQuestion.create({
      text,
      options,
      correctOptionIndex,
      tags: tags || [],
      difficulty: difficulty || "medium",
    });
    res.status(201).json(question);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List all questions
router.get("/", async (req, res) => {
  try {
    const questions = await MbaQuestion.find();
    res.status(200).json(questions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk upload via Excel/CSV
router.post("/bulk-upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    const letterToIndex = { A: 0, B: 1, C: 2, D: 3 };
    let inserted = 0;
    const skipped = [];

    for (const row of rows) {
      const text = (row.questionText || "").toString().trim();
      const { optionA, optionB, optionC, optionD } = row;
      const correctLetter = (row.correctOption || "").toString().trim().toUpperCase();

      if (!text || !optionA || !optionB || !optionC || !optionD || !(correctLetter in letterToIndex)) {
        skipped.push({ row, reason: "Missing or invalid required fields" });
        continue;
      }

      await MbaQuestion.create({
        text,
        options: [optionA, optionB, optionC, optionD],
        correctOptionIndex: letterToIndex[correctLetter],
        tags: row.tags ? row.tags.toString().split(",").map((t) => t.trim()) : [],
        difficulty: row.difficulty || "medium",
      });
      inserted++;
    }

    res.status(200).json({
      message: `${inserted} question(s) added, ${skipped.length} skipped.`,
      skipped,
    });
  } catch (error) {
    res.status(500).json({ error: "Error processing file: " + error.message });
  }
});

module.exports = router;
