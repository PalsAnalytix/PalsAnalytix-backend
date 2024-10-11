const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  courses: { type: [String], required: true }, // SCR, FRM, CFA
  chapterName: { type: String, required: true },
  questionStatement: { type: String, required: true },
  questionImage: { type: String }, // Optional image
  options: {
    optionA: { type: String, required: true },
    optionAImage: { type: String }, // Optional image
    optionB: { type: String, required: true },
    optionBImage: { type: String }, // Optional image
    optionC: { type: String, required: true },
    optionCImage: { type: String }, // Optional image
    optionD: { type: String, required: true },
    optionDImage: { type: String }, // Optional image
  },
  rightAnswer: { type: String, required: true },
  explanation: { type: String, required: true },
  explanationImage: { type: String }, // Optional image
  difficulty: { type: String, required: true },
  tags: { type: [String], default: [] } // New tags field
});

const Question = mongoose.model('Question', questionSchema);
module.exports = Question;
