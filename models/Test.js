const mongoose = require("mongoose");

const testSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    questions: { type: Number, required: true },
    marks: { type: Number, required: true },
    time: { type: Number, required: true },
    status: { type: String, default: "not attempted" }, // Can be 'attempted', 'not attempted'
    usersAttempted: { type: Number, default: 0 },
    averageScore: { type: Number, default: 0 },
    free: { type: Boolean, default: true },
    questionsList: [{ type: mongoose.Schema.Types.ObjectId, ref: "Question" }],
    tags: { type: [String] },
  },
  { timestamps: true }
);

const Test = mongoose.model("Test", testSchema);

module.exports = Test;
