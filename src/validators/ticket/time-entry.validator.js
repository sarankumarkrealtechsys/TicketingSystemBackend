const { z } = require("zod");

const TIME_ENTRY_WORK_TYPES = [
  "INVESTIGATION",
  "DEVELOPMENT",
  "BUG_FIX",
  "TESTING",
  "CODE_REVIEW",
  "DEPLOYMENT",
  "COMMUNICATION",
  "DOCUMENTATION",
  "OTHER",
];

const createTimeEntrySchema = {
  body: z
    .object({
      minutesSpent: z
        .number({
          required_error: "minutesSpent is required",
          invalid_type_error: "minutesSpent must be a number",
        })
        .int("minutesSpent must be an integer")
        .positive("minutesSpent must be greater than 0"),
      workType: z.enum(TIME_ENTRY_WORK_TYPES, {
        errorMap: () => ({
          message: `workType must be one of: ${TIME_ENTRY_WORK_TYPES.join(", ")}`,
        }),
      }),
      workDate: z
        .string({ required_error: "workDate is required" })
        .datetime({ message: "workDate must be a valid ISO-8601 date string" }),
      startTime: z
        .string()
        .datetime({ message: "startTime must be a valid ISO-8601 date string" })
        .optional()
        .nullable(),
      endTime: z
        .string()
        .datetime({ message: "endTime must be a valid ISO-8601 date string" })
        .optional()
        .nullable(),
      note: z.string().max(2000, "note cannot exceed 2000 characters").optional().nullable(),
      billable: z.boolean().default(false),
    })
    .strict({ message: "Unrecognized field in request body. Note that userId is not allowed." })
    .refine(
      (data) => {
        if (data.startTime && data.endTime) {
          return new Date(data.endTime) > new Date(data.startTime);
        }
        return true;
      },
      {
        message: "endTime must be strictly greater than startTime",
        path: ["endTime"],
      },
    ),
};

const ticketTimeSummaryQuerySchema = {
  query: z
    .object({
      workType: z
        .enum(TIME_ENTRY_WORK_TYPES, {
          errorMap: () => ({
            message: `workType must be one of: ${TIME_ENTRY_WORK_TYPES.join(", ")}`,
          }),
        })
        .optional(),
      billable: z.coerce.boolean().optional(),
      startDate: z
        .string()
        .datetime({ message: "startDate must be a valid ISO-8601 date string" })
        .optional(),
      endDate: z
        .string()
        .datetime({ message: "endDate must be a valid ISO-8601 date string" })
        .optional(),
    })
    .strict()
    .refine(
      (data) => {
        if (data.startDate && data.endDate) {
          return new Date(data.endDate) >= new Date(data.startDate);
        }
        return true;
      },
      {
        message: "endDate must be greater than or equal to startDate",
        path: ["endDate"],
      },
    ),
};

const ticketTimeEntriesQuerySchema = {
  query: z
    .object({
      workType: z
        .enum(TIME_ENTRY_WORK_TYPES, {
          errorMap: () => ({
            message: `workType must be one of: ${TIME_ENTRY_WORK_TYPES.join(", ")}`,
          }),
        })
        .optional(),
      billable: z.coerce.boolean().optional(),
      startDate: z
        .string()
        .datetime({ message: "startDate must be a valid ISO-8601 date string" })
        .optional(),
      endDate: z
        .string()
        .datetime({ message: "endDate must be a valid ISO-8601 date string" })
        .optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
    })
    .strict()
    .refine(
      (data) => {
        if (data.startDate && data.endDate) {
          return new Date(data.endDate) >= new Date(data.startDate);
        }
        return true;
      },
      {
        message: "endDate must be greater than or equal to startDate",
        path: ["endDate"],
      },
    ),
};

const userTimeSummaryQuerySchema = {
  query: z
    .object({
      workType: z
        .enum(TIME_ENTRY_WORK_TYPES, {
          errorMap: () => ({
            message: `workType must be one of: ${TIME_ENTRY_WORK_TYPES.join(", ")}`,
          }),
        })
        .optional(),
      billable: z.coerce.boolean().optional(),
      startDate: z
        .string()
        .datetime({ message: "startDate must be a valid ISO-8601 date string" })
        .optional(),
      endDate: z
        .string()
        .datetime({ message: "endDate must be a valid ISO-8601 date string" })
        .optional(),
    })
    .strict({ message: "Unrecognized query parameter. Note that querying another userId is not allowed." })
    .refine(
      (data) => {
        if (data.startDate && data.endDate) {
          return new Date(data.endDate) >= new Date(data.startDate);
        }
        return true;
      },
      {
        message: "endDate must be greater than or equal to startDate",
        path: ["endDate"],
      },
    ),
};

module.exports = {
  TIME_ENTRY_WORK_TYPES,
  createTimeEntrySchema,
  ticketTimeSummaryQuerySchema,
  ticketTimeEntriesQuerySchema,
  userTimeSummaryQuerySchema,
};
