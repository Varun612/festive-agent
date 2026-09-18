const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

async function startMongo() {
  console.log('🚀 Starting MongoDB Server instance on port 27018...');
  
  const dbDir = path.join(__dirname, '../data/db');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  try {
    const mongod = await MongoMemoryServer.create({
      instance: {
        port: 27018,
        dbName: 'festive-agent',
        dbPath: dbDir,
        storageEngine: 'wiredTiger'
      }
    });

    console.log('');
    console.log('================================================================');
    console.log('🎉 MongoDB SERVER IS RUNNING & READY FOR COMPASS!');
    console.log(`📡 Local Port: 27018`);
    console.log(`🔗 Compass URI: mongodb://127.0.0.1:27018/festive-agent`);
    console.log('================================================================');
    console.log('');

    // Connect Mongoose to populate initial data
    await mongoose.connect('mongodb://127.0.0.1:27018/festive-agent');
    console.log('✅ Connected Mongoose to local instance on port 27018.');

    // Seed default business profile
    const BusinessProfile = require('../models/BusinessProfile');
    const existing = await BusinessProfile.findOne({ isDefault: true });
    if (!existing) {
      await BusinessProfile.create({
        businessName: "Kandhari Tent & Caterers",
        tagline: "Making Your Celebrations Memorable",
        industry: "events",
        phoneNumbers: ["9305465848", "9307908994", "7355059566"],
        address: "Lucknow",
        city: "Lucknow",
        services: ["WEDDING", "TENT HOUSE", "EVENT DECORATION", "LAWN BOOKING", "CATERING"],
        branding: { primaryColor: "#d4af37", secondaryColor: "#1a0a2e", fontFamily: "Cinzel" },
        isDefault: true,
      });
      console.log('✅ Seeded default business profile into MongoDB!');
    }

  } catch (err) {
    console.error('❌ Failed to start local MongoDB:', err.message);
  }
}

startMongo();
