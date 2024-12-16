const express = require("express");
const formidable = require("formidable");
const fs = require("fs/promises");
const app = express();
const PORT = 3000;

const Timer = require("./Timer");
const CloneDetector = require("./CloneDetector");
const CloneStorage = require("./CloneStorage");
const FileStorage = require("./FileStorage");
const EventEmitter = require("events");

EventEmitter.defaultMaxListeners = 100000;
// Increase the limit to 20 or any other number

const processingTimes = []; // Array to store the overall processing times
const matchDetectTimes = []; // Array to store the match detection times
const fileNames = []; // Array to store the filenames
const lineCounts = []; // Array to store the number of lines in each file

// Express and Formidable stuff to receice a file for further processing
// --------------------
const form = formidable({ multiples: false });

app.post("/", fileReceiver);
function fileReceiver(req, res, next) {
  form.parse(req, (err, fields, files) => {
    fs.readFile(files.data.filepath, { encoding: "utf8" }).then((data) => {
      return processFile(fields.name, data);
    });
  });
  return res.end("");
}

app.get("/", viewClones);
app.get("/timers", viewTimers);

const server = app.listen(PORT, () => {
  console.log("Listening for files on port", PORT);
});

// Page generation for viewing current progress
// --------------------
function getStatistics() {
  let cloneStore = CloneStorage.getInstance();
  let fileStore = FileStorage.getInstance();
  let output =
    "Processed " +
    fileStore.numberOfFiles +
    " files containing " +
    cloneStore.numberOfClones +
    " clones.";
  return output;
}

function lastFileTimersHTML() {
  if (!lastFile) return "";
  output = "<p>Timers for last file processed:</p>\n<ul>\n";
  let timers = Timer.getTimers(lastFile);
  for (t in timers) {
    output += "<li>" + t + ": " + timers[t] / 1000n + " µs\n";
  }
  output += "</ul>\n";
  return output;
}

function listClonesHTML() {
  let cloneStore = CloneStorage.getInstance();
  let output = "";

  cloneStore.clones.forEach((clone) => {
    output += "<hr>\n";
    output += "<h2>Source File: " + clone.sourceName + "</h2>\n";
    output +=
      "<p>Starting at line: " +
      clone.sourceStart +
      " , ending at line: " +
      clone.sourceEnd +
      "</p>\n";
    output += "<ul>";
    clone.targets.forEach((target) => {
      output +=
        "<li>Found in " +
        target.name +
        " starting at line " +
        target.startLine +
        "\n";
    });
    output += "</ul>\n";
    output += "<h3>Contents:</h3>\n<pre><code>\n";
    output += clone.originalCode;
    output += "</code></pre>\n";
  });

  return output;
}

function listProcessedFilesHTML() {
  let fs = FileStorage.getInstance();
  let output = "<HR>\n<H2>Processed Files</H2>\n";
  output += fs.filenames.reduce((out, name) => {
    out += "<li>" + name + "\n";
    return out;
  }, "<ul>\n");
  output += "</ul>\n";
  return output;
}

function viewClones(req, res, next) {
  let page = "<HTML><HEAD><TITLE>CodeStream Clone Detector</TITLE></HEAD>\n";
  page += "<BODY><H1>CodeStream Clone Detector</H1>\n";
  page += "<P>" + getStatistics() + "</P>\n";
  page += lastFileTimersHTML() + "\n";
  page += listClonesHTML() + "\n";
  page += listProcessedFilesHTML() + "\n";
  page += "</BODY></HTML>";
  res.send(page);
}

function viewTimers(req, res, next) {
  // Normalize the processing times and match detection times
  const normalizedProcessingTimes = processingTimes.map((time, index) =>
    (time / lineCounts[index]).toFixed(1)
  );
  const normalizedMatchDetectTimes = matchDetectTimes.map((time, index) =>
    (time / lineCounts[index]).toFixed(1)
  );

  let page = "<HTML><HEAD><TITLE>CodeStream Clone Detector times</TITLE>\n";

  page += "<script src='https://cdn.jsdelivr.net/npm/chart.js'></script>\n";

  page += "</HEAD>\n";

  page += "<BODY><H1>CodeStream Clone Detector Time Statistics</H1>\n";
  page += "<P>" + getStatistics() + "</P>\n";

  page += "<h2>Overall Processing Times</h2>\n<ul>\n";
  processingTimes.forEach((time, index) => {
    page += "<li>File " + fileNames[index] + ": " + time + " ms\n";
  });
  page += "</ul>\n";

  page += "<h2>Match Detection Times</h2>\n<ul>\n";
  matchDetectTimes.forEach((time, index) => {
    page += "<li>File " + fileNames[index] + ": " + time + " ms\n";
  });
  page += "</ul>\n";

  // Add average times
  page += "<h2>Average Times</h2>\n";
  page +=
    "<p>Average time per file: " +
    calculateAverage(processingTimes) +
    " ms</p>\n";
  page +=
    "<p>Average match detection time per file: " +
    calculateAverage(matchDetectTimes) +
    " ms</p>\n";
  page +=
    "<p>Average time per last 100 files: " +
    calculateAverage(processingTimes.slice(-100)) +
    " ms</p>\n";
  page +=
    "<p>Average match detection time per last 100 files: " +
    calculateAverage(matchDetectTimes.slice(-100)) +
    " ms</p>\n";
  page +=
    "<p>Average time per last 1000 files: " +
    calculateAverage(processingTimes.slice(-1000)) +
    " ms</p>\n";
  page +=
    "<p>Average match detection time per last 1000 files: " +
    calculateAverage(matchDetectTimes.slice(-1000)) +
    " ms</p>\n";

  page +=
    "<h2>Overall Processing Times Graph Per File (Normalised to nr lines)</h2>\n ";
  page +=
    "<canvas id='processingTimesChart' width='800' height='400'></canvas>";
  page +=
    "<h2>Match Detection Times Graph Per File (Normalised to nr lines)</h2>";
  page +=
    "<canvas id='matchDetectTimesChart' width='800' height='400'></canvas>";
  page += "<script>";
  page +=
    "const processingTimes = " +
    JSON.stringify(normalizedProcessingTimes) +
    ";";
  page +=
    "const matchDetectTimes = " +
    JSON.stringify(normalizedMatchDetectTimes) +
    ";";
  page += "const labels = " + JSON.stringify(fileNames) + ";";
  page +=
    "const processingTimesCtx = document.getElementById('processingTimesChart').getContext('2d');";
  page +=
    "const matchDetectTimesCtx = document.getElementById('matchDetectTimesChart').getContext('2d');";
  page +=
    "const processingTimesChart = new Chart(processingTimesCtx, {type: 'line', data: {labels: labels, datasets: [{label: 'Processing Time (ms/line)', data: processingTimes, borderColor: 'rgba(75, 192, 192, 1)', borderWidth: 1, fill: false, }, ], }, options: { scales: { x: { title: {display: true, text: 'Filename', }, }, y: { title: { display: true, text: 'Time (ms/line)', }, }, }, }, });";
  page +=
    "const matchDetectTimesChart = new Chart(matchDetectTimesCtx, {type: 'line', data: {labels: labels, datasets: [{label: 'Match Detection Time (ms/line)', data: matchDetectTimes, borderColor: 'rgba(153, 102, 255, 1)', borderWidth: 1, fill: false, }, ], }, options: { scales: { x: { title: {display: true, text: 'Filename', }, }, y: { title: { display: true, text: 'Time (ms/line)', }, }, }, }, });";
  page += "</script>";

  page += "</BODY></HTML>";
  res.send(page);
}

// Helper function to calculate average
function calculateAverage(times) {
  if (times.length === 0) return 0;
  const sum = times.reduce((a, b) => a + b, 0);
  return (sum / times.length).toFixed(2);
}

// Some helper functions
// --------------------
// PASS is used to insert functions in a Promise stream and pass on all input parameters untouched.
PASS = (fn) => (d) => {
  try {
    fn(d);
    return d;
  } catch (e) {
    throw e;
  }
};

const STATS_FREQ = 100;
const URL = process.env.URL || "http://localhost:8080/";
var lastFile = null;

function maybePrintStatistics(file, cloneDetector, cloneStore) {
  if (0 == cloneDetector.numberOfProcessedFiles % STATS_FREQ) {
    console.log(
      "Processed",
      cloneDetector.numberOfProcessedFiles,
      "files and found",
      cloneStore.numberOfClones,
      "clones."
    );
    let timers = Timer.getTimers(file);
    let str = "Timers for last file processed: ";
    for (t in timers) {
      str += t + ": " + timers[t] / 1000n + " µs ";
    }
    console.log(str);
    console.log("List of found clones available at", URL);
  }

  return file;
}

function storeTimers(file) {
  let timers = Timer.getTimers(file);
  const lineCount = file.lineCount; // Count the number of lines using file.lines
  processingTimes.push(Number(timers["total"]) / 1000); // Normalize by the number of lines
  matchDetectTimes.push(Number(timers["match"]) / 1000); // Normalize by the number of lines
  fileNames.push(file.name); // Store the filename
  lineCounts.push(lineCount); // Store the number of lines in the file
}

// Processing of the file
// --------------------
function processFile(filename, contents) {
  let cd = new CloneDetector();
  let cloneStore = CloneStorage.getInstance();

  return (
    Promise.resolve({ name: filename, contents: contents })
      //   .then( PASS( (file) => console.log('Processing file:', file.name) ))
      .then((file) => Timer.startTimer(file, "total"))
      .then((file) => cd.preprocess(file))
      .then((file) => cd.transform(file))

      .then((file) => Timer.startTimer(file, "match"))
      .then((file) => cd.matchDetect(file))
      .then((file) => cloneStore.storeClones(file))
      .then((file) => Timer.endTimer(file, "match"))

      .then((file) => cd.storeFile(file))
      .then((file) => Timer.endTimer(file, "total"))
      .then(PASS((file) => (lastFile = file)))
      .then(PASS((file) => maybePrintStatistics(file, cd, cloneStore)))
      .then(PASS((file) => storeTimers(file))) // Store the timers for each file
      // TODO Store the timers from every file (or every 10th file), create a new landing page /timers
      // and display more in depth statistics there. Examples include:
      // average times per file, average times per last 100 files, last 1000 files.
      // Perhaps throw in a graph over all files.

      .catch(console.log)
  );
}

/*
1. Preprocessing: Remove uninteresting code, determine source and comparison units/granularities
2. Transformation: One or more extraction and/or transformation techniques are applied to the preprocessed code to obtain an intermediate representation of the code.
3. Match Detection: Transformed units (and/or metrics for those units) are compared to find similar source units.
4. Formatting: Locations of identified clones in the transformed units are mapped to the original code base by file location and line number.
5. Post-Processing and Filtering: Visualisation of clones and manual analysis to filter out false positives
6. Aggregation: Clone pairs are aggregated to form clone classes or families, in order to reduce the amount of data and facilitate analysis.
*/
