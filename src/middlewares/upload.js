const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { env } = require("../config/env");
const { AppError } = require("../utils/errors");

const uploadBaseDir = path.resolve(env.UPLOAD_DIR);

const ALLOWED_MIME_TYPES = new Set([
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  // Videos
  "video/mp4",
  "video/webm",
  "video/quicktime",
  // PDFs
  "application/pdf",
  // Documents
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/csv",
  // Spreadsheets
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const ticketId = req.params.id || "general";
    const destDir = path.join(uploadBaseDir, "tickets", ticketId.toString());
    try {
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      cb(null, destDir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const baseName = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 100);
    const uniquePrefix = crypto.randomUUID();
    const finalName = `${uniquePrefix}-${baseName}${ext}`;
    cb(null, finalName);
  },
});

const fileFilter = (_req, file, cb) => {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new AppError(
        `File type ${file.mimetype} is not allowed. Allowed types include standard images, videos, documents, PDFs, and spreadsheets.`,
        400,
      ),
      false,
    );
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter,
});

/**
 * Computes SHA-256 checksum of a file on disk
 */
const computeChecksum = (filePath) => {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (data) => hash.update(data));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", (err) => reject(err));
  });
};

/**
 * Safely unlinks a file without throwing uncaught exceptions
 */
const safeUnlink = (filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (_err) {
    // Ignore cleanup error
  }
};

module.exports = {
  upload,
  computeChecksum,
  safeUnlink,
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES,
};
