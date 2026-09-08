const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const MbaQuestion = require("../models/mbaQuestion");
const router = express.Router();

const upload = multer({ dest: "/tmp/uploads/" });

// Add one question manually
router.post("/", async (req, res) => {
  try {
    const { text, options, correctOptionIndex, tags, difficulty, solution } = req.body;
    if (!text || !options || options.length !== 3 || correctOptionIndex === undefined) {
      return res.status(400).json({ error: "text, 3 options, and correctOptionIndex are required" });
    }
    const questionNumber = (await MbaQuestion.countDocuments()) + 1;
    const question = await MbaQuestion.create({
      questionNumber,
      text,
      options,
      correctOptionIndex,
      solution,
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

  const difficultyMap = {
    easy: "easy", simple: "easy", low: "easy",
    medium: "medium", moderate: "medium", average: "medium", med: "medium",
    hard: "hard", difficult: "hard", high: "hard",
  };

  try {
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

        const letterToIndex = { A: 0, B: 1, C: 2 };
    let inserted = 0;
    const skipped = [];
    let nextNumber = (await MbaQuestion.countDocuments()) + 1;

    for (const row of rows) {
      const text = (row.questionText || "").toString().trim();
      const { optionA, optionB, optionC } = row;
      const correctLetter = (row.correctOption || "").toString().trim().toUpperCase();

      if (!text || !optionA || !optionB || !optionC || !(correctLetter in letterToIndex)) {
        skipped.push({ row, reason: "Missing or invalid required fields" });
        continue;
      }

      const rawDifficulty = (row.difficulty || "").toString().trim().toLowerCase();
      const difficulty = difficultyMap[rawDifficulty] || "medium";

      try {
          await MbaQuestion.create({
          questionNumber: nextNumber++,
          text,
          options: [optionA, optionB, optionC],
          correctOptionIndex: letterToIndex[correctLetter],
          questionImage: row.questionImage || undefined,
          optionImages: {
            A: row.optionAImage || undefined,
            B: row.optionBImage || undefined,
            C: row.optionCImage || undefined,
          },
          solution: row.solution || undefined,
          tags: row.tags ? row.tags.toString().split(",").map((t) => t.trim()) : [],
          difficulty,
        });
        inserted++;
      } catch (rowError) {
        skipped.push({ row, reason: rowError.message });
      }
    }

    res.status(200).json({
      message: `${inserted} question(s) added, ${skipped.length} skipped.`,
      skipped,
    });
  } catch (error) {
    res.status(500).json({ error: "Error processing file: " + error.message });
  }
});
// One-time cleanup: renumber every question sequentially by creation order
router.post("/renumber", async (req, res) => {
  try {
    const questions = await MbaQuestion.find().sort({ createdAt: 1 });
    for (let i = 0; i < questions.length; i++) {
      questions[i].questionNumber = i + 1;
      await questions[i].save();
    }
    res.status(200).json({ message: `Renumbered ${questions.length} questions.` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a question
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await MbaQuestion.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Question not found" });
    res.status(200).json({ message: "Question deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
module.exports = router;
