const cron = require('node-cron');
const axios = require('axios'); // Using axios instead of node-fetch

// Function to keep the server alive
async function pingServer() {
  try {
    const response = await axios.get('https://palsanalytix-backend.onrender.com/api/keep-alive');
    console.log('Server ping successful:', new Date().toISOString());
  } catch (error) {
    console.error('Server ping failed:', error.message);
  }
}

// Function to assign daily questions
async function assignDailyQuestions() {
  try {
    const response = await axios.post(
      'https://palsanalytix-backend.onrender.com/api/assign-daily-questions',
      {},
      { headers: { 'x-internal-cron-secret': process.env.INTERNAL_CRON_SECRET } }
    );
    console.log('Daily questions assigned successfully:', new Date().toISOString());
  } catch (error) {
    console.error('Failed to assign daily questions:', error.message);
  }
}

// Function to send the daily WhatsApp Quiz messages
async function sendWhatsAppQuiz() {
  try {
    const response = await axios.post(
      'https://palsanalytix-backend.onrender.com/api/whatsapp-quiz/send-daily',
      {},
      { headers: { 'x-internal-cron-secret': process.env.INTERNAL_CRON_SECRET } }
    );
    console.log('WhatsApp quiz sent successfully:', new Date().toISOString());
  } catch (error) {
    console.error('Failed to send WhatsApp quiz:', error.message);
  }
}

// Initialize cron jobs
function initializeCronJobs() {
  // Keep alive cron job - runs every 15 minutes
  cron.schedule('*/15 * * * *', pingServer, {
    scheduled: true,
    timezone: "Asia/Kolkata" // Adjust timezone as needed
  });

  // Assign daily questions - runs at 1 AM daily
  cron.schedule('0 1 * * *', assignDailyQuestions, {
    scheduled: true,
    timezone: "Asia/Kolkata" // Adjust timezone as needed
  });

  // Send WhatsApp Quiz - runs at 9 AM daily
  cron.schedule('0 9 * * *', sendWhatsAppQuiz, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });

  console.log('Cron jobs initialized successfully');
}

module.exports = { initializeCronJobs };
