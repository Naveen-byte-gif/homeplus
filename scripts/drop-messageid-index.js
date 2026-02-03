// Script to drop the problematic messageId unique index
// Run this once: node scripts/drop-messageid-index.js

const mongoose = require('mongoose');

const dropIndex = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/apartment_sync');
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('communitychats');

    // Get all indexes
    const indexes = await collection.indexes();
    console.log('📋 Current indexes:', indexes.map(i => i.name));

    // Try to drop the problematic index
    try {
      await collection.dropIndex('messages.messageId_1');
      console.log('✅ Successfully dropped index: messages.messageId_1');
    } catch (error) {
      if (error.code === 27) {
        console.log('ℹ️ Index does not exist, skipping...');
      } else {
        console.error('❌ Error dropping index:', error.message);
      }
    }

    // List indexes again to confirm
    const updatedIndexes = await collection.indexes();
    console.log('📋 Updated indexes:', updatedIndexes.map(i => i.name));

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

dropIndex();

