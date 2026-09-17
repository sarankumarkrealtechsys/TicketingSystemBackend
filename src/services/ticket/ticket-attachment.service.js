const path = require("path");
const fs = require("fs");
const { prisma } = require("../../lib/prisma");
const { env } = require("../../config/env");
const { AppError } = require("../../utils/errors");
const { computeChecksum, safeUnlink } = require("../../middlewares/upload");
const { handleTicketDbErrors } = require("./ticket-common.service");

const uploadBaseDir = path.resolve(env.UPLOAD_DIR);

/**
 * Uploads a ticket attachment, saves metadata in database, and creates a TicketHistory entry.
 */
const uploadAttachment = async (ticketId, file, user) => {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      status: { select: { behavior: true } },
    },
  });

  if (!ticket) {
    safeUnlink(file.path);
    throw new AppError("Ticket not found", 404);
  }

  if (ticket.status?.behavior === "CLOSED") {
    safeUnlink(file.path);
    throw new AppError("Cannot upload attachments to a closed ticket", 400);
  }

  let checksum = null;
  try {
    checksum = await computeChecksum(file.path);
  } catch (err) {
    safeUnlink(file.path);
    throw new AppError(`Failed to compute file checksum: ${err.message}`, 500);
  }

  // Prevent duplicate active attachment on this ticket (same checksum or identical filename)
  const existingActiveAttachment = await prisma.ticketAttachment.findFirst({
    where: {
      ticketId,
      deletedAt: null,
      OR: [
        { checksum: checksum },
        { originalFileName: file.originalname },
      ],
    },
    select: { id: true, originalFileName: true },
  });

  if (existingActiveAttachment) {
    safeUnlink(file.path);
    throw new AppError(
      `An attachment with this file name or identical content already exists on this ticket ("${existingActiveAttachment.originalFileName}")`,
      409,
    );
  }

  const relativeStorageKey = path
    .join("tickets", ticketId.toString(), path.basename(file.path))
    .replace(/\\/g, "/");

  const ext = path.extname(file.originalname).toLowerCase().slice(0, 20);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const attachment = await tx.ticketAttachment.create({
        data: {
          ticketId,
          uploadedById: user.id,
          originalFileName: file.originalname,
          storageKey: relativeStorageKey,
          mimeType: file.mimetype,
          fileExtension: ext || null,
          fileSizeBytes: BigInt(file.size),
          checksum,
        },
        select: {
          id: true,
          ticketId: true,
          originalFileName: true,
          storageKey: true,
          mimeType: true,
          fileExtension: true,
          fileSizeBytes: true,
          checksum: true,
          createdAt: true,
          uploadedById: true,
          uploadedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      await tx.ticketHistory.create({
        data: {
          ticketId,
          action: "ATTACHMENT_ADDED",
          newValue: JSON.stringify({
            attachmentId: attachment.id,
            originalFileName: attachment.originalFileName,
            fileSizeBytes: Number(attachment.fileSizeBytes),
            mimeType: attachment.mimeType,
          }),
          updatedById: user.id,
        },
      });

      return attachment;
    });

    return {
      ...result,
      fileSizeBytes: Number(result.fileSizeBytes),
    };
  } catch (error) {
    safeUnlink(file.path);
    handleTicketDbErrors(error);
  }
};

/**
 * Retrieves attachment metadata and verified disk file path for streaming download.
 * Returns 404 if attachment is soft-deleted or binary is missing.
 */
const getAttachmentForDownload = async (ticketId, attachmentId) => {
  const attachment = await prisma.ticketAttachment.findFirst({
    where: {
      id: attachmentId,
      ticketId,
      deletedAt: null, // Soft-deleted attachments cannot be downloaded
    },
  });

  if (!attachment) {
    throw new AppError("Attachment not found", 404);
  }

  const absolutePath = path.resolve(uploadBaseDir, attachment.storageKey);

  if (!fs.existsSync(absolutePath)) {
    throw new AppError("Attachment file not found on storage disk", 404);
  }

  return {
    attachment: {
      ...attachment,
      fileSizeBytes: Number(attachment.fileSizeBytes),
    },
    absolutePath,
  };
};

/**
 * Soft deletes an attachment record and records a TicketHistory entry.
 * Retains physical file on disk for audit trail integrity.
 */
const softDeleteAttachment = async (ticketId, attachmentId, user) => {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, status: { select: { behavior: true } } },
  });

  if (!ticket) {
    throw new AppError("Ticket not found", 404);
  }

  if (ticket.status?.behavior === "CLOSED") {
    throw new AppError("Cannot delete attachments from a closed ticket", 400);
  }

  const attachment = await prisma.ticketAttachment.findFirst({
    where: {
      id: attachmentId,
      ticketId,
      deletedAt: null,
    },
  });

  if (!attachment) {
    throw new AppError("Attachment not found", 404);
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.ticketAttachment.update({
        where: { id: attachmentId },
        data: {
          deletedAt: new Date(),
          deletedById: user.id,
        },
        select: {
          id: true,
          ticketId: true,
          originalFileName: true,
          deletedAt: true,
          deletedById: true,
        },
      });

      await tx.ticketHistory.create({
        data: {
          ticketId,
          action: "ATTACHMENT_REMOVED",
          previousValue: JSON.stringify({
            attachmentId: attachment.id,
            originalFileName: attachment.originalFileName,
            fileSizeBytes: Number(attachment.fileSizeBytes),
          }),
          updatedById: user.id,
        },
      });

      return updated;
    });

    return result;
  } catch (error) {
    handleTicketDbErrors(error);
  }
};

module.exports = {
  uploadAttachment,
  getAttachmentForDownload,
  softDeleteAttachment,
};
