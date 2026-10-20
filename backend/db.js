const mongoose = require("mongoose");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/festive-agent";

let isConnected = false;

async function connectDB() {
  if (isConnected) return;

  try {
    const conn = await Promise.race([
      mongoose.connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 1500,
        connectTimeoutMS: 1500,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Connection timed out after 1.5s")), 1500))
    ]);
    isConnected = true;
    console.log(`✅ MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
  } catch (err) {
    console.warn(`⚠️  MongoDB service offline (${err.message}). Using persistent file storage mode (data/creative_learnings.json).`);
  }
}

function getConnectionStatus() {
  return {
    connected: mongoose.connection.readyState === 1,
    state: ["disconnected", "connected", "connecting", "disconnecting"][mongoose.connection.readyState] || "unknown",
    host: mongoose.connection.host || null,
    db: mongoose.connection.name || null,
    storageMode: mongoose.connection.readyState === 1 ? "MongoDB Database" : "Persistent File Storage (creative_learnings.json)",
  };
}

module.exports = { connectDB, getConnectionStatus };
