const { z } = require("zod");

const createPrioritySchema = {
  body: z.object({
    label: z
      .string({ required_error: "Priority label is required" })
      .trim()
      .min(1, "Priority label cannot be empty")
      .max(50, "Priority label cannot exceed 50 characters"),
    sortOrder: z.coerce.number().int().optional().default(0),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional().default("ACTIVE"),
  }),
};

const updatePrioritySchema = {
  params: z.object({
    id: z.coerce
      .number({ required_error: "Priority ID is mandatory" })
      .int("Priority ID must be an integer")
      .positive("Priority ID must be a positive number"),
  }),
  body: z
    .object({
      label: z
        .string()
        .trim()
        .min(1, "Priority label cannot be empty")
        .max(50, "Priority label cannot exceed 50 characters")
        .optional(),
      sortOrder: z.coerce.number().int().optional(),
      status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
    })
    .refine(
      (data) =>
        data.label !== undefined ||
        data.sortOrder !== undefined ||
        data.status !== undefined,
      { message: "At least one field must be provided for update" },
    ),
};

const priorityIdParamSchema = {
  params: z.object({
    id: z.coerce
      .number({ required_error: "Priority ID is mandatory" })
      .int("Priority ID must be an integer")
      .positive("Priority ID must be a positive number"),
  }),
};

const priorityQuerySchema = {
  query: z.object({
    includeInactive: z
      .preprocess((val) => val === "true" || val === true, z.boolean())
      .optional(),
  }),
};

module.exports = {
  createPrioritySchema,
  updatePrioritySchema,
  priorityIdParamSchema,
  priorityQuerySchema,
};
