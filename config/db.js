const mongoose = require("mongoose")
require('dotenv').config();
// const db = import.meta.env.VITE_MONGO_URI;
const db = process.env.MONGO_URI;

const connectDB = async()=>{
    try{
        await mongoose.connect(db);
        console.log("MongoDB connected.");
    }
    catch{
        console.log("Failed to connect with MongoDB.");
    }
};

module.exports = connectDB;