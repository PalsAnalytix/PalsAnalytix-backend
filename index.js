const AWS = require("aws-sdk");
const cors = require("cors");
const express = require("express");
const app = express();
const PORT = 3000;
const dotenv = require("dotenv");
const multer = require("multer");
const XLSX = require("xlsx");
const bcrypt = require("bcrypt");
const twilio = require("twilio");
const rateLimit = require("express-rate-limit");
const uploadxlsx = multer({ dest: "uploads/" });
const jwt = require("jsonwebtoken");

const Dev = "Pankaj";

const connectDB = require("./config/db");
const User = require("./models/User");
const Question = require("./models/Question");
const Test = require("./models/Test");
const path = require("path");
const upload = require("./config/s3Config");
const { signupLimiter, otpLimiter } = require("./middleware/ratelimiter");
app.use(express.json());

dotenv.config();

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const TWILIO_MESSAGING_SID = process.env.TWILIO_MESSAGING_SID;
const JWT_SECRET = process.env.JWT_SECRET;

app.use(cors());
connectDB();

// Handle all routes and redirect them to index.html


// AWS
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const { error } = require("console");
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});
const s3 = new AWS.S3();

// Initialize Twilio client
const twilioClient = new twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Assign the decoded user ID to req.userId
    req.userId = decoded.userId || decoded.id; // adjust based on your JWT structure

    next();
  } catch (error) {
    console.error("Auth Middleware Error:", error.message);
    return res.status(401).json({ message: "Invalid token" });
  }
};

//post routes
app.post("/registerdb", async (req, res) => {
  const { name, email, picture } = req.body;
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
    let user = await User.findOne({ email, phoneNumber });

    if (!user) {
      // Create a new user
      user = new User({
        name,
        email,
        phoneNo,
        picture,
        attemptedQuestions,
        attemptedTests,
        subscriptionId,
        purchaseDate,
        expiryDate,
        paymentId,
        amountPaid,
        currentChapterForWhatsapp,
        currentCourseForWhatsapp,
      });
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

app.post("/getQuestionsByIds", async (req, res) => {
  try {
    const { ids } = req.body; // Expecting an array of objects like [{ questionId, attemptedOption, timeTaken }, ...]
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        error: "Invalid request. Please provide an array of question details.",
      });
    }

    // Step 1: Extract question IDs from the array of objects
    const questionIds = ids.map((item) => item.questionId);

    // Step 2: Fetch questions in bulk using MongoDB's $in operator
    const questions = await Question.find({ _id: { $in: questionIds } });

    // Step 3: Create the response combining question details with the user's attempted data
    const result = ids.map((item) => {
      const questionDetail = questions.find(
        (q) => q._id.toString() === item.questionId
      );
      if (questionDetail) {
        const verdict =
          item.attemptedOption === questionDetail.rightAnswer
            ? "Right"
            : "Wrong";
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
    console.error("Error fetching questions:", error);
    res
      .status(500)
      .json({ error: "An error occurred while fetching questions." });
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

app.post("/uploadxlsx", uploadxlsx.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  try {
    // Fetch all questions before the upload starts
    const questionsBeforeUpload = await Question.find();
    const questionStatementsBeforeUpload = questionsBeforeUpload.map(
      (q) => q.questionStatement
    );

    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);

    const questions = jsonData.map((row) => ({
      courses: row.courses.split(",").map((course) => course.trim()),
      chapterName: row.chapterName,
      questionStatement: row.questionStatement.trim().toLowerCase(), // Normalize the question statement
      questionImage: row.questionImage || null,
      options: {
        optionA: row.optionA,
        optionAImage: row.optionAImage || null,
        optionB: row.optionB,
        optionBImage: row.optionBImage || null,
        optionC: row.optionC,
        optionCImage: row.optionCImage || null,
        optionD: row.optionD,
        optionDImage: row.optionDImage || null,
      },
      rightAnswer: row.rightAnswer,
      explanation: row.explanation,
      explanationImage: row.explanationImage || null,
      difficulty: row.difficulty,
      tags: row.tags ? row.tags.split(",").map((tag) => tag.trim()) : [],
    }));

    let insertedCount = 0;
    let ignoredCount = 0;

    for (const question of questions) {
      // Check if the question already exists in the database
      const existingQuestion = await Question.findOne({
        questionStatement: question.questionStatement,
      });

      if (!existingQuestion) {
        await Question.create(question);
        insertedCount++;
      } else {
        ignoredCount++;
      }
    }

    // Fetch all questions again after the upload is complete
    const questionsAfterUpload = await Question.find();
    const newQuestions = questionsAfterUpload.filter(
      (q) => !questionStatementsBeforeUpload.includes(q.questionStatement)
    );

    res.status(200).json({
      message: `Upload complete. ${insertedCount} questions inserted, ${ignoredCount} questions ignored (already exist).`,
      newQuestions, // Send only the newly added questions in the response
    });
  } catch (error) {
    console.error("Error processing XLSX file:", error);
    res.status(500).json({ error: "Error processing XLSX file" });
  }
});

const pendingSignups = new Map();

app.post("/signup", signupLimiter, async (req, res) => {
  console.log("🚀 Starting signup process...");
  try {
    const { name, email, phone, password } = req.body;
    console.log("📝 Received signup data:", { name, email, phone });

    // Check if user already exists
    console.log("🔍 Checking for existing user...");
    const existingUser = await User.findOne({
      $or: [{ email }, { phoneNumber: phone }],
    });

    if (existingUser) {
      console.log("❌ User already exists");
      return res.status(400).json({ message: "User already exists" });
    }

    // Generate verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000);
    console.log("🎲 Generated verification code:", verificationCode);

    // Hash password
    console.log("🔒 Hashing password...");
    const hashedPassword = await bcrypt.hash(password, 10);

    // Store user data temporarily
    const userData = {
      username: name,
      email,
      phoneNumber: phone,
      password: hashedPassword,
      verificationCode,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    };

    // Format phone number (ensure it starts with '+')
    const formattedPhone = phone.startsWith("+") ? phone : `+${phone}`;
    console.log("📱 Formatted phone number:", formattedPhone);

    // Store in temporary storage
    pendingSignups.set(formattedPhone, userData);
    console.log(
      "💾 Stored in pending signups. Current pending signups:",
      pendingSignups
    );

    // Set cleanup timeout
    setTimeout(() => {
      console.log("🧹 Cleaning up expired signup data for:", formattedPhone);
      pendingSignups.delete(formattedPhone);
    }, 10 * 60 * 1000);

    // Send verification code via Twilio
    console.log("📤 Attempting to send SMS via Twilio to:", formattedPhone);
    try {
      const resp = await twilioClient.messages.create({
        body: `Your PalsAnalytix verification code is: ${verificationCode}`,
        to: formattedPhone,
        messagingServiceSid: TWILIO_MESSAGING_SID,
      });
      console.log("✅ Twilio response:", resp.sid);
    } catch (twilioError) {
      console.error("❌ Twilio Error:", twilioError);
      throw new Error("Failed to send verification code");
    }

    res.status(200).json({
      message: "Verification code sent",
      phone: formattedPhone,
    });
  } catch (error) {
    console.error("❌ Signup Error:", error);
    res.status(500).json({
      message: error.message || "Error during signup process",
    });
  }
});

async function getSampleQuestions() {
  return await Question.aggregate([
    { $match: { tags: "sample question" } },
    {
      $project: {
        questionStatement: 1,
        courses: 1,
        chapterName: 1,
        difficulty: 1,
        options: 1,
        rightAnswer: 1,
        explanation: 1,
        tags: 1
      }
    }
  ]);
}

app.post("/verify-otp", async (req, res) => {
  console.log("🚀 Starting OTP verification process...");
  try {
    const { phone, code } = req.body;
    console.log("📝 Received verification data:", { phone, code });

    // Format phone number consistently
    const formattedPhone = phone.startsWith("+") ? phone : `+${phone}`;
    console.log("📱 Formatted phone number:", formattedPhone);

    // Get pending signup data
    const userData = pendingSignups.get(formattedPhone);
    console.log("🔍 Retrieved user data:", userData ? "Found" : "Not found");
    console.log("📊 Current pending signups:", pendingSignups);

    // Check if signup request exists
    if (!userData) {
      console.log("❌ No pending signup found");
      return res.status(400).json({
        message: "No pending signup found or verification timeout",
        action: "RETRY_SIGNUP",
      });
    }

    // Log verification attempt details
    console.log("🔄 Verification attempt:", {
      receivedCode: parseInt(code),
      storedCode: userData.verificationCode,
      expiryTime: userData.expiresAt,
      currentTime: new Date(),
    });

    // Check if OTP matches
    if (userData.verificationCode !== parseInt(code)) {
      console.log("❌ Invalid verification code");
      return res.status(400).json({
        message: "Invalid verification code",
        action: "RETRY_OTP",
      });
    }

    // Check if OTP has expired
    if (userData.expiresAt < new Date()) {
      console.log("❌ Verification code expired");
      pendingSignups.delete(formattedPhone);
      return res.status(400).json({
        message: "Verification code expired",
        action: "RETRY_SIGNUP",
      });
    }

    console.log("✅ OTP verified successfully, creating user...");

    // Get sample questions
    const sampleQuestions = await getSampleQuestions();

    console.log(sampleQuestions);
    
    const user = new User({
      username: userData.username,
      email: userData.email,
      phoneNumber: userData.phoneNumber,
      password: userData.password,
      isVerified: true,
      currentSubscriptionPlan: "FREE",
      questions: sampleQuestions.map(question => ({
        // Preserve all original question fields
        question: {
          _id: question._id,
          courses: question.courses,
          chapterName: question.chapterName,
          questionStatement: question.questionStatement,
          questionImage: question.questionImage,
          options: {
            optionA: question.options.optionA,
            optionAImage: question.options.optionAImage,
            optionB: question.options.optionB,
            optionBImage: question.options.optionBImage,
            optionC: question.options.optionC,
            optionCImage: question.options.optionCImage,
            optionD: question.options.optionD,
            optionDImage: question.options.optionDImage,
          },
          rightAnswer: question.rightAnswer,
          explanation: question.explanation,
          explanationImage: question.explanationImage,
          difficulty: question.difficulty,
          tags: question.tags
        },
        // Add attempt tracking fields
        attempted: false,
        attemptDetails: {
          attemptedOption: null,
          isCorrect: false,
          attemptedAt: null,
          timeSpent: 0
        },
        assignedDate: new Date(),
        isSampleQuestion: true
      }))
    });

    await user.save();
    console.log("✅ User saved successfully");

    // Clean up temporary data
    pendingSignups.delete(formattedPhone);
    console.log("🧹 Cleaned up pending signup data");

    // Generate JWT token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "24h",
    });
    console.log("🎫 Generated JWT token");

    // Return success with token
    res.status(201).json({
      message: "User created successfully",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        phoneNumber: user.phoneNumber,
      },
    });
  } catch (error) {
    console.error("❌ OTP Verification Error:", error);
    res.status(500).json({
      message: "Error during verification process",
      action: "RETRY_SIGNUP",
    });
  }
});
// Add a helper endpoint to check pending signups (for debugging)
app.get("/debug/pending-signups", (req, res) => {
  const pendingSignupsData = Array.from(pendingSignups.entries()).map(
    ([phone, data]) => ({
      phone,
      verificationCode: data.verificationCode,
      expiresAt: data.expiresAt,
    })
  );

  res.json({
    count: pendingSignups.size,
    pendingSignups: pendingSignupsData,
  });
});

const addSampleQuestionsToUser = async (user) => {
  const sampleQuestions = await getSampleQuestions();
  const questionsToAdd = sampleQuestions.map(question => ({
    question: question._id,
    attempted: false,
    attemptDetails: {
      attemptedOption: null,
      isCorrect: false,
      attemptedAt: null,
      timeSpent: 0
    },
    assignedDate: new Date(),
    isSampleQuestion: true
  }));
  
  user.questions = [...(user.questions || []), ...questionsToAdd];
  await user.save();
  return user;
};

app.post("/login", async (req, res) => {
  try {
    const { phone, password } = req.body;

    // Handle admin login
    const ADMIN_PHONE = "91123456789";
    const ADMIN_PASSWORD = "123456789";
    if (phone === ADMIN_PHONE && password === ADMIN_PASSWORD) {
      const token = jwt.sign({ userId: "admin", isAdmin: true }, JWT_SECRET, {
        expiresIn: "24h"
      });
      return res.json({
        token,
        user: {
          _id: "admin",
          phoneNumber: ADMIN_PHONE,
          isAdmin: true,
        },
      });
    }

    let user = await User.findOne({
      phoneNumber: phone
    });

    if (!user || !user.isVerified) {
      return res
        .status(400)
        .json({ message: "Invalid credentials or unverified account" });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ message: "Invalid credentials" });
    }


    const token = jwt.sign({ userId: user._id }, JWT_SECRET, {
      expiresIn: "24h"
    });
    res.json({
      token,
      user: {
        _id: user._id,
        isAdmin: false,
        currentSubscriptionPlan: user.currentSubscriptionPlan
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

//get routes

// to keep render backend up cron job
app.get("/keep-alive", (req, res) => {
  res.status(200).send("Server is alive!");
});

app.get("/user/profile", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
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



//daily questions routes
const shouldReceiveQuestions = (user) => {
  // Check if user has an active subscription
  if (user.currentSubscriptionPlan === "FREE") {
    return false;
  }

  // Check if user has valid subscription date
  if (!user.subscriptionExpiryDate || new Date(user.subscriptionExpiryDate) < new Date()) {
    return false;
  }

  return true;
};

// Helper function to get questions for user based on their preferences
const getQuestionsForUser = async (user) => {
  try {
    // Get questions from user's current chapter and course
    const questions = await Question.find({
      courses: user.currentCourseForWhatsapp,
      chapterName: user.currentChapterForWhatsapp,
    }).limit(3); // Limit to 3 questions per day

    return questions;
  } catch (error) {
    console.error('Error getting questions:', error);
    return [];
  }
};

// Endpoint to get user's questions
app.get("/api/user/questions", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get all questions assigned to this user
    const questions = await Question.find({
      _id: { $in: user.attemptedQuestions.map(q => q.questionId) }
    });

    // Format questions with attempt status
    const formattedQuestions = questions.map(question => ({
      ...question.toObject(),
      isAttempted: user.attemptedQuestions.some(
        q => q.questionId.toString() === question._id.toString() && q.attempted
      ),
      assignedDate: user.attemptedQuestions.find(
        q => q.questionId.toString() === question._id.toString()
      ).assignedDate
    }));

    res.json(formattedQuestions);
  } catch (error) {
    console.error('Error fetching user questions:', error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Cron job endpoint to assign daily questions
app.post("/api/assign-daily-questions", async (req, res) => {
  try {
    // Get all users
    const users = await User.find();
    
    for (const user of users) {
      if (shouldReceiveQuestions(user)) {
        // Get questions for this user
        const newQuestions = await getQuestionsForUser(user);
        
        // Add questions to user's attempted questions array
        const questionsToAdd = newQuestions.map(question => ({
          questionId: question._id,
          attempted: false,
          assignedDate: new Date()
        }));

        await User.findByIdAndUpdate(user._id, {
          $push: { 
            attemptedQuestions: { 
              $each: questionsToAdd 
            }
          }
        });
      }
    }

    res.json({ message: "Daily questions assigned successfully" });
  } catch (error) {
    console.error('Error assigning daily questions:', error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/random-questions", authMiddleware, async (req, res) => {
  try {
    // Get 5 random questions with "sample question" tag using MongoDB aggregation
    const questions = await Question.aggregate([
      { $match: { tags: "sample question" } },  // Add match stage to filter by tag
      { $sample: { size: 5 } },
      {
        $project: {
          questionStatement: 1,
          courses: 1,
          chapterName: 1,
          difficulty: 1,
          options: 1,
          rightAnswer: 1,
          explanation: 1,
          tags: 1  // Include tags in projection
        }
      }
    ]);

    // Get user's attempted questions
    const user = await User.findById(req.userId);
    const attemptedQuestionIds = user.attemptedQuestions.map(q => q.question_id.toString());

    // Add attempt status to each question
    const questionsWithStatus = questions.map(question => ({
      ...question,
      isAttempted: attemptedQuestionIds.includes(question._id.toString()),
      assignedDate: new Date()
    }));

    res.status(200).json({
      success: true,
      data: questionsWithStatus
    });
  } catch (error) {
    console.error('Error fetching random questions:', error);
    res.status(500).json({
      success: false,
      message: "Error fetching questions",
      error: error.message
    });
  }
});
//put routes

app.put('/api/user/attemptQuestion/:questionId', authMiddleware, async (req, res) => {
  try {
    const { questionId } = req.params;
    const { attemptDetails } = req.body;
    
    const userId = req.userId; // Assuming you have authentication middleware
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const questionIndex = user.questions.findIndex(q => q._id.toString() === questionId);
    if (questionIndex === -1) {
      return res.status(404).json({ message: 'Question not found' });
    }
    
    // Update the question with attempt details
    user.questions[questionIndex].attempted = true;
    user.questions[questionIndex].attemptDetails = {
      ...attemptDetails,
      attemptedAt: new Date()
    };

    await user.save();

    res.json(user); // Send the entire updated user object
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});



app.put("/update_preference_Chapter/:id", async (req, res) => {
  try {
    const userId = req.params.id;
    const { currentChapterForWhatsapp, currentCourseForWhatsapp } = req.body;

    // Validate inputs
    if (!currentChapterForWhatsapp || !currentCourseForWhatsapp) {
      return res.status(400).json({
        success: false,
        message: "Please provide both chapter and course"
      });
    }

    // Find user and update
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          currentChapterForWhatsapp,
          currentCourseForWhatsapp
        }
      },
      { new: true } // This option returns the updated document
    );

    // Check if user exists
    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Preferences updated successfully",
      data : updatedUser,
    });

  } catch (error) {
    console.error("Error updating preferences:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
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

//delete routes
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

app.use(express.static(path.join(__dirname, 'client/build')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

app.listen(PORT, "0.0.0.0", () =>
  console.log(`Server running on port ${PORT}`)
);
