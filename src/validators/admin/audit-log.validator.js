const { z } = require("zod");

const auditLogQuerySchema = z
  .object({
    query: z
      .object({
        action: z
          .string()
          .max(40, "action cannot exceed 40 characters")
          .optional(),
        entityType: z
          .string()
          .max(40, "entityType cannot exceed 40 characters")
          .optional(),
        entityId: z.coerce
          .number({ invalid_type_error: "entityId must be a positive integer" })
          .int()
          .positive()
          .optional(),
        performedById: z.coerce
          .number({ invalid_type_error: "performedById must be a positive integer" })
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
  auditLogQuerySchema,
};
