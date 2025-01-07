// filepath: /mnt/d/BigData/test/code_stream_clone_detector/Containers/MonitorTool/monitor.ts
import mongoose from "mongoose";
import express from "express";
import HTMLPage from "./page";

const dbHost = process.env.DBHOST || "localhost";
const dbPort = process.env.DBPORT || "27017";
const dbName = process.env.DBNAME || "cloneDetector";

const dbUri = `mongodb://${dbHost}:${dbPort}/${dbName}`;

// Connect to the database
mongoose
  .connect(dbUri)
  .then(() => console.log("Database connected successfully"))
  .catch((err) => console.error("Database connection error:", err));

// Fetch statistics from the database
type ProcessedData = {
  timestamp: Date;
  chunks: number;
};

const processedData: ProcessedData[] = [];
let filesCount = 0;
let chunksCount = 0;
let candidatesCount = 0;
let clonesCount = 0;
let startTime = new Date();

const fetchStatistics = async () => {
  try {
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("Database connection is not established");
    }

    // Fetches the number of documents in each collection and status updates
    filesCount = await db.collection("files").countDocuments();
    chunksCount = await db.collection("chunks").countDocuments();
    candidatesCount = await db.collection("candidates").countDocuments();
    clonesCount = await db.collection("clones").countDocuments();
    const statusUpdates = await db
      .collection("statusUpdates")
      .find()
      .sort({ timestamp: -1 })
      .toArray();

    console.log("Current Statistics: \n");
    console.log(`Files: ${filesCount} \n`);
    console.log(`Chunks: ${chunksCount} \n`);
    console.log(`Candidates: ${candidatesCount} \n`);
    console.log(`Clones: ${clonesCount} \n`);
    console.log("Recent Status Updates: \n");
    statusUpdates.forEach((update) => {
      console.log(`${update.timestamp}: ${update.message} \n`);
    });

    processedData.push({
      timestamp: new Date(),
      chunks: chunksCount,
    });
  } catch (err) {
    console.error("Error fetching statistics:", err);
  }
};

setInterval(fetchStatistics, 10000); // Fetch statistics every 10 seconds

const app = express();
const PORT = process.env.PORT || 3001;

app.get("/", async (req, res, next) => {
  const db = mongoose.connection.db;
  const page = new HTMLPage();
  if (!db) {
    page.addParagraphs("Could not connect to database, try reloading the page");
    res.send(page.get());
    return;
  }

  page.addParagraphs(
    `Files: ${filesCount}`,
    `Chunks: ${chunksCount}`,
    `Candidates: ${candidatesCount}`,
    `Clones: ${clonesCount}`
  );
  const chunksContraTime = {
    graphId: "processedGraph",
    label: "Data visualization",
    xLabel: "Time (s)",
    yLabel: "Chunks",
    xScale: { type: "linear" },
    data: processedData.map(({ timestamp, chunks }) => ({
      x: (timestamp.getTime() - startTime.getTime()) / 1000,
      y: chunks,
    })),
  };
  const newChunksPerInterval = {
    graphId: "newChunksVsTime",
    label: "New chunks",
    xLabel: "Time (s)",
    yLabel: "Chunks",
    xScale: { type: "linear" },
    data: processedData.map(({ timestamp, chunks }, i) => {
      const prevChunks = processedData[i - 1]?.chunks || 0;
      return {
        x: (timestamp.getTime() - startTime.getTime()) / 1000,
        y: chunks - prevChunks,
      };
    }),
  };
  const processingTime = {
    graphId: "processingTimeGraph",
    label: "Processing time per chunks (ms)",
    xLabel: "Total chunks",
    yLabel: "Processing time (ms)",
    xScale: { type: "linear" },
    data: processedData.map(({ timestamp, chunks }, i) => {
      // Not 100% accurate due to starting order of containers
      const prevTime =
        processedData[i - 1]?.timestamp.getTime() || startTime.getTime();
      const newChunks = chunks - (processedData[i - 1]?.chunks || 0);
      const interval = timestamp.getTime() - prevTime;
      return {
        y: interval / (newChunks || 1), // chunks per interval
        x: chunks,
      };
    }),
  };
  page.addTitle("Chunks growth over time");
  page.addGraph(chunksContraTime);
  page.addTitle("Chunks generated per interval");
  page.addParagraphs("First value is inaccurate due to start up");
  page.addGraph(newChunksPerInterval);
  page.addTitle(
    "Processing time per chunk compared to total amount of processed chunks"
  );
  page.addParagraphs("First value is inaccurate due to start up");
  page.addGraph(processingTime);
  res.send(page.get());
});

app.listen(PORT, () => {
  console.log("Visualization available on port", PORT);
});
