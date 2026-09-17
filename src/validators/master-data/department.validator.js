const { z } = require("zod");

const createDepartmentSchema = {
  body: z.object({
    name: z
      .string({ required_error: "Department name is required" })
      .trim()
      .min(1, "Department name cannot be empty")
      .max(120, "Department name cannot exceed 120 characters"),
    description: z.string().trim().optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional().default("ACTIVE"),
  }),
};

const updateDepartmentSchema = {
  params: z.object({
    id: z.coerce
      .number({ required_error: "Department ID is mandatory" })
      .int("Department ID must be an integer")
      .positive("Department ID must be a positive number"),
  }),
  body: z
    .object({
      name: z
        .string()
        .trim()
        .min(1, "Department name cannot be empty")
        .max(120, "Department name cannot exceed 120 characters")
        .optional(),
      description: z.string().trim().nullable().optional(),
      status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
    })
    .refine(
      (data) =>
        data.name !== undefined ||
        data.description !== undefined ||
        data.status !== undefined,
      { message: "At least one field must be provided for update" },
    ),
};

const departmentIdParamSchema = {
  params: z.object({
    id: z.coerce
      .number({ required_error: "Department ID is mandatory" })
      .int("Department ID must be an integer")
      .positive("Department ID must be a positive number"),
  }),
};

const departmentQuerySchema = {
  query: z.object({
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
    includeInactive: z
      .preprocess((val) => val === "true" || val === true, z.boolean())
      .optional(),
  }),
};

module.exports = {
  createDepartmentSchema,
  updateDepartmentSchema,
  departmentIdParamSchema,
  departmentQuerySchema,
};
