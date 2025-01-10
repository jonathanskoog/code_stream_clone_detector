// filepath: /mnt/d/BigData/test/code_stream_clone_detector/Containers/MonitorTool/monitor.ts
import mongoose from "mongoose";
import express from "express";
import HTMLPage from "./page";

const PROCESSING_CHUNKS_DONE = "Identifying Clone Candidates...";
const EXPANDING_CANDIDATES_DONE = "Summary";
const IDENTIFY_CANDIDATES_DONE = /Found\d+candidates/;
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

const processedChunks: ProcessedData[] = [];
const identifiedCandidates: {
  timestamp: Date;
  candidates: number;
}[] = [];
const identifiedClones: {
  timestamp: Date;
  clones: number;
}[] = [];

let filesCount = 0;
let chunksCount = 0;
let candidatesCount = 0;
let clonesCount = 0;
let startTime = new Date();
let dbClones: {
  _id: any;
  numberOfInstances: number;
  instances: {
    fileName: string;
    startLine: number;
    endLine: number;
  }[];
}[] = [];
let statusUpdates: {
  _id: any;
  timestamp: string;
  message: string;
}[] = [];

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

    dbClones = (await db.collection("clones").find({}).toArray()) as any;
    clonesCount = dbClones.length;

    statusUpdates = (await db
      .collection("statusUpdates")
      .find()
      .sort({ timestamp: -1 })
      .toArray()) as any;

    // console.log("Current Statistics: \n");
    // console.log(`Files: ${filesCount} \n`);
    // console.log(`Chunks: ${chunksCount} \n`);
    // console.log(`Candidates: ${candidatesCount} \n`);
    // console.log(`Clones: ${clonesCount} \n`);
    // console.log("Recent Status Updates: \n");
    // statusUpdates.forEach((update) => {
    //   console.log(`${update.timestamp}: ${update.message} \n`);
    // });

    const processingChunksDone = Boolean(
      statusUpdates.find(({ message }) =>
        (message as string).startsWith(PROCESSING_CHUNKS_DONE)
      )
    );

    const identifyCandidatesDone = Boolean(
      statusUpdates.find(({ message }) =>
        IDENTIFY_CANDIDATES_DONE.test(message)
      )
    );

    const expandingCandidatesDone = Boolean(
      statusUpdates.find(({ message }) => message === EXPANDING_CANDIDATES_DONE)
    );

    const now = new Date();

    if (chunksCount && !processingChunksDone) {
      processedChunks.push({
        timestamp: new Date(now),
        chunks: chunksCount,
      });
    }
    if (clonesCount && identifyCandidatesDone && !expandingCandidatesDone) {
      identifiedCandidates.push({
        timestamp: new Date(now),
        candidates: candidatesCount,
      });
      identifiedClones.push({
        timestamp: new Date(now),
        clones: clonesCount,
      });
    }
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

  const processTimePerChunk = processedChunks.map(
    ({ timestamp, chunks }, i) => {
      // Not 100% accurate due to starting order of containers
      const prevTime =
        processedChunks[i - 1]?.timestamp.getTime() || startTime.getTime();
      const newChunks = chunks - (processedChunks[i - 1]?.chunks || 0);
      const interval = timestamp.getTime() - prevTime;
      return {
        y: interval / (newChunks || 1), // chunks per interval
        x: chunks,
      };
    }
  );

  const expandTimePerCandidate = identifiedClones.map(
    ({ timestamp, clones }, i) => {
      // Not 100% accurate due to starting order of containers
      const prevTime =
        processedChunks[i - 1]?.timestamp.getTime() || startTime.getTime();
      const newClones = clones - (identifiedClones[i - 1]?.clones || 0);
      const interval = timestamp.getTime() - prevTime;
      return {
        y: interval / (newClones || 1), // chunks per interval
        x: clones,
      };
    }
  );

  const chunksContraTime = {
    graphId: "processedGraph",
    label: "Data visualization",
    xLabel: "Time (s)",
    yLabel: "Chunks",
    xScale: { type: "linear" },
    data: processedChunks.map(({ timestamp, chunks }) => ({
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
    data: processedChunks.map(({ timestamp, chunks }, i) => {
      const prevChunks = processedChunks[i - 1]?.chunks || 0;
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
    data: processTimePerChunk,
  };
  const expandedClones = {
    graphId: "expandedClonesGraph",
    label: "New clones compared to candidates",
    xLabel: "Candidates",
    yLabel: "New clones created for interval",
    xScale: { type: "linear" },
    data: identifiedClones.map(({ timestamp, clones }, i) => {
      // Not 100% accurate due to starting order of containers
      // nya clones / nya candidates
      const newClones = clones - (identifiedClones[i - 1]?.clones || 0);
      return {
        y: newClones, // chunks per interval
        x: identifiedCandidates[i]?.candidates || 0,
      };
    }),
  };

  const expandedTimePerCandidate = {
    graphId: "expandedTimePerCandidate",
    label: "Time to expand candidate, (time to process vs clones)",
    xLabel: "Clones",
    yLabel: "Expand time per candidate (ms)",
    xScale: { type: "linear" },
    data: expandTimePerCandidate,
  };

  const candidates =
    statusUpdates
      .find(({ message }) => IDENTIFY_CANDIDATES_DONE.test(message))
      ?.message.match(/\d+/)?.[0] || "0";

  const avgCloneSize =
    dbClones.reduce((avg, { instances }) => {
      const { startLine, endLine } = instances[0];
      return avg + (endLine - startLine);
    }, 0) / (clonesCount || 1);

  const avgCandidateExpand =
    expandTimePerCandidate.reduce((sum, curr) => sum + curr.y, 0) /
    (expandTimePerCandidate.length || 1);

  const accurateProcessed = processTimePerChunk.slice(1);
  const avgChunkProcessingTime =
    accurateProcessed.reduce((sum, curr) => sum + curr.y, 0) /
    (accurateProcessed.length || 1);

  page.addParagraphs(
    `Files: ${filesCount}`,
    `Chunks: ${chunksCount}`,
    `Candidates: ${candidatesCount}`,
    `Clones: ${clonesCount}`,
    `Average number of chunks per file: ${chunksCount / (filesCount || 1)}`,
    `Average clone size: ${avgCloneSize}`
  );

  page.addTitle("Chunks growth over time");
  page.addGraph(chunksContraTime);
  page.addTitle("Chunks generated per interval");
  page.addParagraphs("First value is inaccurate due to start up");
  page.addGraph(newChunksPerInterval);
  page.addTitle(
    "Processing time per chunk compared to total amount of processed chunks"
  );
  page.addParagraphs(
    "First value is inaccurate due to start up",
    `Average time to process one chunk: ${avgChunkProcessingTime} ms`
  );
  page.addGraph(processingTime);
  page.addTitle("Expanded candidates vs remaining candidates");
  page.addParagraphs(`Total number of candidates: ${candidates}`);
  page.addGraph(expandedClones);
  page.addParagraphs(
    `Average expand time per candidate: ${avgCandidateExpand} ms`
  );
  page.addGraph(expandedTimePerCandidate);

  const processChunksRows = chunksContraTime.data.slice(0, 100).map((d, i) => {
    return [d.y, processTimePerChunk[i]?.x || "N/A", d.x];
  });

  const expandCandidatesRows = expandTimePerCandidate
    .slice(0, 100)
    .map((d, i) => {
      const { candidates, timestamp } = identifiedCandidates[i];
      const clones = identifiedClones[i]?.clones;
      return [
        candidates === undefined ? "N/A" : candidates,
        clones === undefined ? "N/A" : clones,
        d.y,
        timestamp,
      ];
    });
  page.addTitle("Table for process chunks step");

  page.addTable(
    ["Chunks", "Process time per chunk (ms)", "Seconds since start"],
    [processChunksRows]
  );
  page.addTitle("Table for expand candidates step");
  page.addTable(
    [
      "Candidates",
      "Clones",
      "Time to expand candidate (ms)",
      "Seconds since start",
    ],
    [expandCandidatesRows]
  );

  res.send(page.get());
});

app.listen(PORT, () => {
  console.log("Visualization available on port", PORT);
});
