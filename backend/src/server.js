import cors from "cors";
import express from "express";
import multer from "multer";
import path from "path";
import sqlite3 from "sqlite3";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import fs from "fs";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../../");

const app = express();
const PORT = process.env.PORT || 5000;
const PYTHON_BIN = process.env.PYTHON_BIN || "python";
const PYTHON_SCRIPT = path.join(rootDir, "python", "ppe_video_system.py");
const DB_PATH = path.join(rootDir, "ppe.db");
const frontendDistDir = path.join(rootDir, "frontend", "dist");
const frontendIndexHtml = path.join(frontendDistDir, "index.html");
const corsOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const uploadDir = path.join(rootDir, "backend", "uploads");
const outputDir = path.join(rootDir, "backend", "output");

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext).replace(/\s+/g, "-").toLowerCase();
    cb(null, `${name}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const mimeOk = /video\/(mp4|quicktime|x-msvideo|x-matroska|mpeg)/.test(file.mimetype);
    const extOk = /\.(mp4|avi|mov|mkv|mpeg)$/i.test(file.originalname || "");
    const ok = mimeOk || extOk;
    cb(ok ? null : new Error("Only video files are allowed."), ok);
  },
});

app.use(
  cors({
    origin: corsOrigins.length > 0 ? corsOrigins : true,
  }),
);
app.use(express.json());
app.use(
  "/output",
  express.static(outputDir, {
    setHeaders: (res, filePath) => {
      if (filePath.toLowerCase().endsWith(".mp4")) {
        res.setHeader("Content-Type", "video/mp4");
        res.setHeader("Cache-Control", "no-store");
      }
    },
  }),
);

if (fs.existsSync(frontendIndexHtml)) {
  app.use(express.static(frontendDistDir));
}

function ensureWorkerTable() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) return reject(err);

      db.run(
        `CREATE TABLE IF NOT EXISTS worker_ppe (
          worker_id TEXT,
          helmet TEXT,
          vest TEXT,
          time TEXT
        )`,
        (runErr) => {
          db.close();
          if (runErr) return reject(runErr);
          resolve();
        },
      );
    });
  });
}

function runPython(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [PYTHON_SCRIPT, inputPath, outputPath, DB_PATH];
    const child = spawn(PYTHON_BIN, args, { cwd: rootDir });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to start Python process: ${err.message}`));
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Python process failed with code ${code}: ${stderr || stdout}`));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

function transcodeToWebMp4(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-i",
      inputPath,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-an",
      outputPath,
    ];

    const child = spawn(ffmpegInstaller.path, args, { cwd: rootDir });

    let stderr = "";
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to start ffmpeg: ${err.message}`));
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg failed with code ${code}: ${stderr}`));
      } else {
        resolve();
      }
    });
  });
}

app.post("/api/process-video", upload.single("video"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No video file uploaded." });
    }

    await ensureWorkerTable();

    const inputPath = req.file.path;
    const timestamp = Date.now();
    const rawFilename = `processed-${timestamp}-raw.mp4`;
    const finalFilename = `processed-${timestamp}.mp4`;
    const rawPath = path.join(outputDir, rawFilename);
    const finalPath = path.join(outputDir, finalFilename);

    await runPython(inputPath, rawPath);
    await transcodeToWebMp4(rawPath, finalPath);

    if (fs.existsSync(rawPath)) {
      fs.unlinkSync(rawPath);
    }

    if (!fs.existsSync(finalPath) || fs.statSync(finalPath).size === 0) {
      throw new Error("Processed output video is empty.");
    }

    return res.json({
      videoUrl: `/output/${finalFilename}`,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/workers", async (_req, res) => {
  try {
    await ensureWorkerTable();
    const db = new sqlite3.Database(DB_PATH);

    db.all(
      `SELECT worker_id, helmet, vest, time
       FROM worker_ppe
       ORDER BY rowid DESC`,
      (err, rows) => {
        db.close();
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        return res.json(rows);
      },
    );
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/status", async (_req, res) => {
  try {
    await ensureWorkerTable();
    const db = new sqlite3.Database(DB_PATH);

    db.all("SELECT helmet, vest FROM worker_ppe", (err, rows) => {
      db.close();
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      const totalWorkers = rows.length;
      const safeWorkers = rows.filter((r) => r.helmet === "Yes" && r.vest === "Yes").length;
      const unsafeWorkers = totalWorkers - safeWorkers;

      return res.json({ totalWorkers, safeWorkers, unsafeWorkers });
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

if (fs.existsSync(frontendIndexHtml)) {
  app.get(/^(?!\/api\/|\/output\/).*/, (_req, res) => {
    res.sendFile(frontendIndexHtml);
  });
}

app.use((err, _req, res, _next) => {
  return res.status(400).json({ error: err.message || "Request failed" });
});

const server = app.listen(PORT, () => {
  console.log("=====================================");
  console.log("🚀 SMART PPE STARTED");
  console.log(`👉 Server running at: http://localhost:${PORT}`);
  console.log("=====================================\n");
});

server.on("error", (error) => {
  if (error.syscall !== "listen") {
    throw error;
  }

  const bind = typeof PORT === "string" ? `Pipe ${PORT}` : `Port ${PORT}`;

  if (error.code === "EADDRINUSE") {
    console.error(`Error: ${bind} is already in use. Please stop the process using it or set a different PORT.`);
    process.exit(1);
  }

  throw error;
});