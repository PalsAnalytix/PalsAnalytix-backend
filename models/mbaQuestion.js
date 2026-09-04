const mongoose = require("mongoose");
const mbaQuestionSchema = new mongoose.Schema({
  text: { type: String, required: true },
  options: { type: [String], validate: v => v.length === 4 },
  correctOptionIndex: { type: Number, required: true },
  tags: [String],
  difficulty: { type: String, enum: ["easy", "medium", "hard"], default: "medium" },
  createdBy: { type: String },
}, { timestamps: true });

module.exports = mongoose.model("MbaQuestion", mbaQuestionSchema);
