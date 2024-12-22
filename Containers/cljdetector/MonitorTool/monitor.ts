// filepath: /mnt/d/BigData/test/code_stream_clone_detector/Containers/MonitorTool/monitor.ts
import mongoose from 'mongoose';

const dbHost = process.env.DBHOST || 'localhost';
const dbPort = process.env.DBPORT || '27017';
const dbName = process.env.DBNAME || 'cloneDetector';

const dbUri = `mongodb://${dbHost}:${dbPort}/${dbName}`;

// Connect to the database
mongoose.connect(dbUri)
  .then(() => console.log('Database connected successfully'))
  .catch(err => console.error('Database connection error:', err));

// Fetch statistics from the database
const fetchStatistics = async () => {
  try {

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection is not established');
    }

    // Fetches the number of documents in each collection and status updates
    const filesCount = await db.collection('files').countDocuments();
    const chunksCount = await db.collection('chunks').countDocuments();
    const candidatesCount = await db.collection('candidates').countDocuments();
    const clonesCount = await db.collection('clones').countDocuments();
    const statusUpdates = await db.collection('statusUpdates').find().sort({ timestamp: -1 }).toArray();

    console.log('Current Statistics: \n');
    console.log(`Files: ${filesCount} \n`);
    console.log(`Chunks: ${chunksCount} \n`);
    console.log(`Candidates: ${candidatesCount} \n`);
    console.log(`Clones: ${clonesCount} \n`);
    console.log('Recent Status Updates: \n');
    statusUpdates.forEach(update => {
      console.log(`${update.timestamp}: ${update.message} \n`);
    });
  } catch (err) {
    console.error('Error fetching statistics:', err);
  }
};

setInterval(fetchStatistics, 10000); // Fetch statistics every 10 seconds