const { AppError } = require("../../utils/errors");
const userBulkService = require("../../services/user/user-bulk.service");

/**
 * GET /api/users/bulk-upload/template
 * Downloads the sample Excel spreadsheet with proper headers, sample records, and reference tabs
 */
const downloadTemplate = async (_req, res, next) => {
  try {
    const buffer = await userBulkService.generateUserUploadTemplate();

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="users_bulk_upload_sample.xlsx"',
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Length", buffer.length);

    return res.end(buffer);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/users/bulk-upload
 * Parses the uploaded spreadsheet buffer and creates valid user accounts
 */
const bulkUploadUsers = async (req, res, next) => {
  try {
    if (!req.file || !req.file.buffer) {
      throw new AppError(
        "Please select and upload a valid Excel (.xlsx, .xls) or CSV file.",
        400,
      );
    }

    const { defaultPassword } = req.body;
    const result = await userBulkService.processBulkUserUpload(
      req.file.buffer,
      defaultPassword,
    );

    return res.status(200).json({
      success: true,
      message: `Bulk user processing completed: ${result.successfulCount} created, ${result.failedCount} failed.`,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  downloadTemplate,
  bulkUploadUsers,
};
