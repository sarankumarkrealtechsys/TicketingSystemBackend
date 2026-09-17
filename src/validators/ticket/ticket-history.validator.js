const { z } = require("zod");

const TICKET_HISTORY_ACTIONS = [
  "CREATED",
  "STATUS_CHANGED",
  "ASSIGNEE_ADDED",
  "ASSIGNEE_REMOVED",
  "REASSIGNED",
  "PRIORITY_CHANGED",
  "REMARK_ADDED",
  "SUB_TICKET_CREATED",
  "TIME_LOGGED",
  "ATTACHMENT_ADDED",
  "ATTACHMENT_REMOVED",
  "CUSTOM_FIELD_CHANGED",
  "TEAM_ADDED",
  "TEAM_REMOVED",
];

const ticketHistoryQuerySchema = z
  .object({
    query: z
      .object({
        action: z
          .enum(TICKET_HISTORY_ACTIONS, {
            errorMap: () => ({
              message: `Action must be one of: ${TICKET_HISTORY_ACTIONS.join(", ")}`,
            }),
          })
          .optional(),
        updatedById: z.coerce
          .number({ invalid_type_error: "updatedById must be a positive integer" })
          .int()
          .positive()
          .optional(),
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
  });

module.exports = {
  ticketHistoryQuerySchema,
};
