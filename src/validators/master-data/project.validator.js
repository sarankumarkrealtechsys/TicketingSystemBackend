const { z } = require("zod");

const createProjectSchema = {
  body: z.object({
    name: z
      .string({ required_error: "Project name is required" })
      .trim()
      .min(1, "Project name cannot be empty")
      .max(150, "Project name cannot exceed 150 characters"),
    description: z.string().trim().optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional().default("ACTIVE"),
  }),
};

const updateProjectSchema = {
  params: z.object({
    id: z.coerce
      .number({ required_error: "Project ID is mandatory" })
      .int("Project ID must be an integer")
      .positive("Project ID must be a positive number"),
  }),
  body: z
    .object({
      name: z
        .string()
        .trim()
        .min(1, "Project name cannot be empty")
        .max(150, "Project name cannot exceed 150 characters")
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

const projectIdParamSchema = {
  params: z.object({
    id: z.coerce
      .number({ required_error: "Project ID is mandatory" })
      .int("Project ID must be an integer")
      .positive("Project ID must be a positive number"),
  }),
};

const projectQuerySchema = {
  query: z.object({
    includeInactive: z
      .preprocess((val) => val === "true" || val === true, z.boolean())
      .optional(),
  }),
};

module.exports = {
  createProjectSchema,
  updateProjectSchema,
  projectIdParamSchema,
  projectQuerySchema,
};
