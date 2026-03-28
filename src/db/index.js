import mongoose from "mongoose";

const connectDB = async () => {
  try {
    const connectionInstance = await mongoose.connect(
      `${process.env.MONGODB_URI}`,
      {
        maxPoolSize: 20,      // Up to 20 concurrent connections
        minPoolSize: 5,       // Keep at least 5 connections warm
        serverSelectionTimeoutMS: 5000,  // Fail fast if DB unreachable
        socketTimeoutMS: 45000,
      }
    );
    console.log(
      `\n MongoDB connected !! DB HOST ${connectionInstance.connection.host}`
    );
  } catch (error) {
    console.log("MONGODB connection Failed", error);
    process.exit(1);
  }
};

export default connectDB;
