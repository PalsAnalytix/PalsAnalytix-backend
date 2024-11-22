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
const TWILIO_PHONE_NUMBER  = process.env.TWILIO_PHONE_NUMBER;
const TWILIO_MESSAGING_SID = process.env.TWILIO_MESSAGING_SID;
const JWT_SECRET = process.env.JWT_SECRET;

app.use(cors());
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
      user = new User({
        name,
        email,
        auth0ID,
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
      return res
        .status(400)
        .json({
          error:
            "Invalid request. Please provide an array of question details.",
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
  console.log('🚀 Starting signup process...');
  try {
    const { name, email, phone, password } = req.body;
    console.log('📝 Received signup data:', { name, email, phone });

    // Check if user already exists
    console.log('🔍 Checking for existing user...');
    const existingUser = await User.findOne({
      $or: [{ email }, { phoneNumber: phone }],
    });

    if (existingUser) {
      console.log('❌ User already exists');
      return res.status(400).json({ message: "User already exists" });
    }

    // Generate verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000);
    console.log('🎲 Generated verification code:', verificationCode);

    // Hash password
    console.log('🔒 Hashing password...');
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
    const formattedPhone = phone.startsWith('+') ? phone : `+${phone}`;
    console.log('📱 Formatted phone number:', formattedPhone);

    // Store in temporary storage
    pendingSignups.set(formattedPhone, userData);
    console.log('💾 Stored in pending signups. Current pending signups:', pendingSignups);

    // Set cleanup timeout
    setTimeout(() => {
      console.log('🧹 Cleaning up expired signup data for:', formattedPhone);
      pendingSignups.delete(formattedPhone);
    }, 10 * 60 * 1000);

    // Send verification code via Twilio
    console.log('📤 Attempting to send SMS via Twilio to:', formattedPhone);
    try {
      const resp = await twilioClient.messages.create({
        body: `Your PalsAnalytix verification code is: ${verificationCode}`,
        to: formattedPhone,
        messagingServiceSid: TWILIO_MESSAGING_SID,
      });
      console.log('✅ Twilio response:', resp.sid);
    } catch (twilioError) {
      console.error('❌ Twilio Error:', twilioError);
      throw new Error('Failed to send verification code');
    }

    res.status(200).json({ 
      message: "Verification code sent",
      phone: formattedPhone
    });

  } catch (error) {
    console.error('❌ Signup Error:', error);
    res.status(500).json({ 
      message: error.message || "Error during signup process" 
    });
  }
});

app.post("/verify-otp", async (req, res) => {
  console.log('🚀 Starting OTP verification process...');
  try {
    const { phone, code } = req.body;
    console.log('📝 Received verification data:', { phone, code });

    // Format phone number consistently
    const formattedPhone = phone.startsWith('+') ? phone : `+${phone}`;
    console.log('📱 Formatted phone number:', formattedPhone);

    // Get pending signup data
    const userData = pendingSignups.get(formattedPhone);
    console.log('🔍 Retrieved user data:', userData ? 'Found' : 'Not found');
    console.log('📊 Current pending signups:', pendingSignups);

    // Check if signup request exists
    if (!userData) {
      console.log('❌ No pending signup found');
      return res.status(400).json({ 
        message: "No pending signup found or verification timeout",
        action: "RETRY_SIGNUP"
      });
    }

    // Log verification attempt details
    console.log('🔄 Verification attempt:', {
      receivedCode: parseInt(code),
      storedCode: userData.verificationCode,
      expiryTime: userData.expiresAt,
      currentTime: new Date()
    });

    // Check if OTP matches
    if (userData.verificationCode !== parseInt(code)) {
      console.log('❌ Invalid verification code');
      return res.status(400).json({ 
        message: "Invalid verification code",
        action: "RETRY_OTP"
      });
    }

    // Check if OTP has expired
    if (userData.expiresAt < new Date()) {
      console.log('❌ Verification code expired');
      pendingSignups.delete(formattedPhone);
      return res.status(400).json({ 
        message: "Verification code expired",
        action: "RETRY_SIGNUP"
      });
    }

    console.log('✅ OTP verified successfully, creating user...');

    // Create new user
    const user = new User({
      username: userData.username,
      email: userData.email,
      phoneNumber: userData.phoneNumber,
      password: userData.password,
      isVerified: true,
    });

    await user.save();
    console.log('✅ User saved successfully');

    // Clean up temporary data
    pendingSignups.delete(formattedPhone);
    console.log('🧹 Cleaned up pending signup data');

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    console.log('🎫 Generated JWT token');

    // Return success with token
    res.status(201).json({
      message: "User created successfully",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        phoneNumber: user.phoneNumber,
      }
    });

  } catch (error) {
    console.error('❌ OTP Verification Error:', error);
    res.status(500).json({ 
      message: "Error during verification process",
      action: "RETRY_SIGNUP"
    });
  }
});

// Add a helper endpoint to check pending signups (for debugging)
app.get("/debug/pending-signups", (req, res) => {
  const pendingSignupsData = Array.from(pendingSignups.entries()).map(([phone, data]) => ({
    phone,
    verificationCode: data.verificationCode,
    expiresAt: data.expiresAt,
  }));
  
  res.json({
    count: pendingSignups.size,
    pendingSignups: pendingSignupsData
  });
});

app.post("/login", async (req, res) => {
  try {
    const { phone, password } = req.body; // identifier can be email or phone

    console.log(req.body);

    const ADMIN_PHONE = "91123456789";
    const ADMIN_PASSWORD = "123456789";
    if (phone === ADMIN_PHONE && password === ADMIN_PASSWORD) {
      const token = jwt.sign({ userId: 'admin', isAdmin: true }, JWT_SECRET, { expiresIn: "24h" });
      return res.json({
        token,
        user: {
          _id: 'admin',
          phoneNumber: ADMIN_PHONE,
          isAdmin: true
        }
      });
    }

    const user = await User.findOne({
      $or: [{ phoneNumber: phone }],
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
      expiresIn: "24h",
    });
    res.json({ token,
      user : {
        isAdmin : false
      }
     });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

//get routes

app.get("/user/profile", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ 
      success: false,
      message: "Internal server error" 
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

//put routes

// app.put("/user/:auth0ID/whatsapp", async (req, res) => {
//   try {
//     const { auth0ID } = req.params;
//     const { phoneNo, currentChapterForWhatsapp, currentCourseForWhatsapp } =
//       req.body;

//     const updatedUser = await User.findOneAndUpdate(
//       { auth0ID },
//       { phoneNo, currentChapterForWhatsapp, currentCourseForWhatsapp },
//       { new: true }
//     );

//     if (!updatedUser) {
//       return res.status(404).json({ message: "User not found" });
//     }


//     res.status(200).json(updatedUser);
//   } catch (error) {
//     console.error("Error updating user WhatsApp details:", error);
//     res.status(500).json({ message: "Internal server error" });
//   }
// });

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

app.listen(PORT, "0.0.0.0", () =>
  console.log(`Server running on port ${PORT}`)
);
