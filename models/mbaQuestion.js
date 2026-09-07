const mongoose = require("mongoose");
const mbaQuestionSchema = new mongoose.Schema({
  questionNumber: { type: Number },
  text: { type: String, required: true },
  options: { type: [String], validate: v => v.length === 3 },
  correctOptionIndex: { type: Number, required: true },
  questionImage: { type: String },
  optionImages: {
    A: { type: String },
    B: { type: String },
    C: { type: String },
  },
  solution: { type: String },
  tags: [String],
  difficulty: { type: String, enum: ["easy", "medium", "hard"], default: "medium" },
  createdBy: { type: String },
}, { timestamps: true });

module.exports = mongoose.model("MbaQuestion", mbaQuestionSchema);
