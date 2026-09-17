const { z } = require("zod");
const { AppError } = require("../../utils/errors");
const { safeUnlink } = require("../../middlewares/upload");

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
 * Validates that Multer received a non-empty file
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

  next();
};

module.exports = {
  ticketAttachmentParamSchema,
  ticketAttachmentUploadParamSchema,
  validateUploadedFile,
};
