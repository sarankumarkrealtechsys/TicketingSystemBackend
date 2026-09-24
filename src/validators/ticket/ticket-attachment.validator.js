const path = require("path");
const { z } = require("zod");
const { AppError } = require("../../utils/errors");
const {
  safeUnlink,
  MAX_FILE_SIZE,
  ALLOWED_EXTENSIONS,
} = require("../../middlewares/upload");

const ticketAttachmentParamSchema = {
  params: z.object({
    id: z.coerce
      .number({ required_error: "Ticket ID is required" })
      .int("Ticket ID must be an integer")
      .positive("Ticket ID must be a positive number"),
    attachmentId: z.coerce
      .number({ required_error: "Attachment ID is required" })
      .int("Attachment ID must be an integer")
      .positive("Attachment ID must be a positive number"),
  }),
};

const ticketAttachmentUploadParamSchema = {
  params: z.object({
    id: z.coerce
      .number({ required_error: "Ticket ID is required" })
      .int("Ticket ID must be an integer")
      .positive("Ticket ID must be a positive number"),
  }),
};

/**
 * Validates that Multer received a non-empty file within size and extension limits
 */
const validateUploadedFile = (req, _res, next) => {
  if (!req.file) {
    return next(new AppError("File is required. Please upload a valid file.", 400));
  }

  if (!req.file.size || req.file.size <= 0) {
    safeUnlink(req.file.path);
    return next(
      new AppError(
        "File size must be greater than 0 bytes. Empty files are not allowed.",
        400,
      ),
    );
  }

  if (req.file.size > MAX_FILE_SIZE) {
    safeUnlink(req.file.path);
    return next(
      new AppError(
        `File size exceeds maximum allowed limit of ${Math.round(MAX_FILE_SIZE / (1024 * 1024))} MB.`,
        400,
      ),
    );
  }

  const ext = path.extname(req.file.originalname || "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    safeUnlink(req.file.path);
    return next(
      new AppError(
        `File extension "${ext || "unknown"}" is not permitted. Supported formats include Excel (.xlsx, .xls), PDF, photos/images (.png, .jpg, .webp), and documents.`,
        400,
      ),
    );
  }

  next();
};

module.exports = {
  ticketAttachmentParamSchema,
  ticketAttachmentUploadParamSchema,
  validateUploadedFile,
};
