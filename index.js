const AWS = require("aws-sdk");
const cors = require("cors");
const express = require("express");
const app = express();
const PORT = 3000;
const dotenv = require("dotenv");
app.use(cors());
app.use(express.json());
const connectDB = require("./config/db");
const User = require("./models/User");
const Question = require("./models/Question");
const Test = require("./models/Test");
const path = require("path");
const upload = require("./config/s3Config");
dotenv.config();



connectDB(); 


// AWS
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});
const s3 = new AWS.S3();



//post routes
app.post("/registerdb", async (req, res) => {
  const { name, email, sub: auth0ID, picture } = req.body;
  const phoneNo = "";
  const attemptedQuestions = [];
  const attemptedTests = [];
  const subscriptionId = "";
  const purchaseDate = "";
  const expiryDate = "";
  const amountPaid = 0;
  const paymentId = "";
  const currentChapterForWhatsapp = "";
  const currentCourseForWhatsapp = "";
  try {
    // Check if the user already exists
    let user = await User.findOne({ email });

    if (!user) {
      // Create a new user
      user = new User({ name, email, auth0ID, phoneNo,picture, attemptedQuestions, attemptedTests, subscriptionId, purchaseDate, expiryDate, paymentId, amountPaid, currentChapterForWhatsapp, currentCourseForWhatsapp });
      await user.save();
    }

    res.status(201).json({ user });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server Error", error });
  }
});

app.post(
  "/addquestion",
  upload.fields([
    { name: "questionImage", maxCount: 1 },
    { name: "optionImage1", maxCount: 1 },
    { name: "optionImage2", maxCount: 1 },
    { name: "optionImage3", maxCount: 1 },
    { name: "optionImage4", maxCount: 1 },
    { name: "explanationImage", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { body, files } = req;

      // Create a new question object
      const newQuestion = new Question({
        courses: Array.isArray(body.courses) ? body.courses : [body.courses],
        chapterName: body.chapter,
        questionStatement: body.questionStatement,
        questionImage: files.questionImage
          ? files.questionImage[0].location
          : null,
        options: {
          optionA: body.optionA,
          optionAImage: files.optionImage1
            ? files.optionImage1[0].location
            : null,
          optionB: body.optionB,
          optionBImage: files.optionImage2
            ? files.optionImage2[0].location
            : null,
          optionC: body.optionC,
          optionCImage: files.optionImage3
            ? files.optionImage3[0].location
            : null,
          optionD: body.optionD,
          optionDImage: files.optionImage4
            ? files.optionImage4[0].location
            : null,
        },
        rightAnswer: body.rightAnswer,
        explanation: body.explanation,
        explanationImage: files.explanationImage
          ? files.explanationImage[0].location
          : null,
        difficulty: body.difficulty,
        tags: body.tags ? JSON.parse(body.tags) : [],
      });

      // Save question to database
      await newQuestion.save();
      res.status(201).json(newQuestion);
    } catch (error) {
      console.error("Error adding question:", error);
      res.status(500).json({ error: error.message });
    }
  }
);


app.post('/getQuestionsByIds', async (req, res) => {
  try {
    const {ids}  = req.body; // Expecting an array of objects like [{ questionId, attemptedOption, timeTaken }, ...]
    console.log(req.body);
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid request. Please provide an array of question details.' });
    }

    // Step 1: Extract question IDs from the array of objects
    const questionIds = ids.map(item => item.questionId);

    // Step 2: Fetch questions in bulk using MongoDB's $in operator
    const questions = await Question.find({ _id: { $in: questionIds } });

    // Step 3: Create the response combining question details with the user's attempted data
    const result = ids.map(item => {
      const questionDetail = questions.find(q => q._id.toString() === item.questionId);
      if (questionDetail) {
        const verdict = item.attemptedOption === questionDetail.rightAnswer ? 'Right' : 'Wrong';
        return {
          ...questionDetail.toObject(), // Spread the question details
          attemptedOption: item.attemptedOption,
          timeTaken: item.timeTaken,
          verdict,
        };
      } else {
        return { error: `Question with ID ${item.questionId} not found.` };
      }
    });

    // Step 4: Send the response back to the client
    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({ error: 'An error occurred while fetching questions.' });
  }
});

app.post("/tests", async (req, res) => {
  try {
    const newTest = new Test(req.body);
    await newTest.save();
    res.status(201).json(newTest);
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});













//get routes

app.get("/user/:auth0ID", async (req, res) => {
  try {
    const { auth0ID } = req.params;

    // Find the user in the database
    const user = await User.findOne({ auth0ID });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Return the user details
    res.status(200).json(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/questions", async (req, res) => {
  try {
    const { ids } = req.query; // ids will be a comma-separated string
    let questions;
    if (ids) {
      const questionsArray = ids.split(","); // Split the ids into an array
      // Fetch only the questions that match the provided IDs
      questions = await Question.find({ _id: { $in: questionsArray } });
    } else {
      const { course, chapter } = req.query;
      const filter = {};

      if (course) filter.course = course;
      if (chapter) filter.chapterName = chapter;

      questions = await Question.find(filter);
    }
    res.status(200).json(questions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /tests - Fetch all tests
app.get("/tests", async (req, res) => {
  try {
    const tests = await Test.find();
    res.status(200).json(tests);
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// GET /tests/:id - Fetch a single test by ID
app.get("/tests/:id", async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }
    res.status(200).json(test);
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});
















//put routes

app.put("/user/:auth0ID/whatsapp", async (req, res) => {
  try {
    const { auth0ID } = req.params;
    const { phoneNo, currentChapterForWhatsapp, currentCourseForWhatsapp } = req.body;

    const updatedUser = await User.findOneAndUpdate(
      { auth0ID },
      { phoneNo, currentChapterForWhatsapp, currentCourseForWhatsapp },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Send welcome message via WhatsApp
    // const whatsappApiUrl = 'https://api.whatsapp.com/v1/messages';
    // const whatsappToken = process.env.WHATSAPP_API_TOKEN;

    // await axios.post(whatsappApiUrl, {
    //   to: phoneNo,
    //   type: 'text',
    //   text: {
    //     body: `Welcome to our service! You're now subscribed to ${currentCourseForWhatsapp} updates, starting from ${currentChapterForWhatsapp}.`
    //   }
    // }, {
    //   headers: {
    //     'Authorization': `Bearer ${whatsappToken}`,
    //     'Content-Type': 'application/json'
    //   }
    // });

    res.status(200).json(updatedUser);
  } catch (error) {
    console.error("Error updating user WhatsApp details:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});


app.put("/tests/:id", async (req, res) => {
  try {
    const updatedTest = await Test.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!updatedTest) {
      return res.status(404).json({ message: "Test not found" });
    }
    res.status(200).json(updatedTest);
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});


// Update a question
app.put("/question/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updatedQuestion = await Question.findByIdAndUpdate(id, req.body, {
      new: true,
    });
    res.status(200).json(updatedQuestion);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a question
app.delete("/question/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await Question.findByIdAndDelete(id);
    res.status(200).json({ message: "Question deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});









//delete routes

app.delete("/tests/:id", async (req, res) => {
  try {
    const deletedTest = await Test.findByIdAndDelete(req.params.id);
    if (!deletedTest) {
      return res.status(404).json({ message: "Test not found" });
    }
    res.status(200).json({ message: "Test deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
