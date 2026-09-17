const fs = require("fs");
const ticketAttachmentService = require("../../services/ticket/ticket-attachment.service");
const notificationService = require("../../services/notification/notification.service");

const uploadAttachment = async (req, res, next) => {
  try {
    const ticketId = Number(req.params.id);
    const data = await ticketAttachmentService.uploadAttachment(
      ticketId,
      req.file,
      req.user,
    );

    notificationService.notifyAttachmentAdded(ticketId, data, req.user);

    return res.status(201).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

const downloadAttachment = async (req, res, next) => {
  try {
    const ticketId = Number(req.params.id);
    const attachmentId = Number(req.params.attachmentId);

    const { attachment, absolutePath } =
      await ticketAttachmentService.getAttachmentForDownload(
        ticketId,
        attachmentId,
      );

    const safeFilename = attachment.originalFileName.replace(/["\r\n]/g, "_");
    res.setHeader(
      "Content-Type",
      attachment.mimeType || "application/octet-stream",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(safeFilename)}"`,
    );
    res.setHeader("Content-Length", attachment.fileSizeBytes);

    const stream = fs.createReadStream(absolutePath);
    stream.on("error", (err) => next(err));
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
};

const deleteAttachment = async (req, res, next) => {
  try {
    const ticketId = Number(req.params.id);
    const attachmentId = Number(req.params.attachmentId);

    const data = await ticketAttachmentService.softDeleteAttachment(
      ticketId,
      attachmentId,
      req.user,
    );

    notificationService.notifyAttachmentRemoved(ticketId, data, req.user);

    return res.status(200).json({
      status: "success",
      message: "Attachment deleted successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  uploadAttachment,
  downloadAttachment,
  deleteAttachment,
};

