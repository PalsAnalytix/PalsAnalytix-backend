const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema(
  {
    question: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
    selectedOption: { type: String, default: null }, // "A" / "B" / "C" / "D" or null if unanswered
    isCorrect: { type: Boolean, default: false },
    timeSpent: { type: Number, default: 0 }, // seconds
    markedForReview: { type: Boolean, default: false },
  },
  { _id: false }
);

const customAssignmentSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    course: { type: String, required: true }, // CFA, FRM, SCR, EXCEL, ADVANCED_EXCEL, EXCEL_FOR_FINANCE
    chapters: { type: [String], default: [] }, // empty array = no chapter filter (all chapters)
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard', 'mixed'],
      default: 'mixed',
    },
    numQuestions: { type: Number, required: true },
    timeLimitSeconds: { type: Number, required: true },
    questions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],
    answers: { type: [answerSchema], default: [] },
    status: { type: String, enum: ['in-progress', 'completed'], default: 'in-progress' },
    score: { type: Number, default: 0 }, // number of correct answers
    totalTimeSpent: { type: Number, default: 0 }, // seconds
    startedAt: { type: Date, default: Date.now },
    submittedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CustomAssignment', customAssignmentSchema);
