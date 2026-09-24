const { z } = require("zod");

const createTeamSchema = {
  body: z.object({
    name: z
      .string({ required_error: "Team name is required" })
      .trim()
      .min(1, "Team name cannot be empty")
      .max(120, "Team name cannot exceed 120 characters"),
    description: z.string().trim().optional(),
    teamAdminEmail: z
      .string({ required_error: "Team admin email is required" })
      .trim()
      .email("Invalid team admin email format")
      .max(190, "Email cannot exceed 190 characters"),
    departmentId: z.coerce
      .number({ required_error: "Department ID is required" })
      .int("Department ID must be an integer")
      .positive("Department ID must be a positive number"),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional().default("ACTIVE"),
  }),
};

const updateTeamSchema = {
  params: z.object({
    id: z.coerce
      .number({ required_error: "Team ID is mandatory" })
      .int("Team ID must be an integer")
      .positive("Team ID must be a positive number"),
  }),
  body: z
    .object({
      name: z
        .string()
        .trim()
        .min(1, "Team name cannot be empty")
        .max(120, "Team name cannot exceed 120 characters")
        .optional(),
      description: z.string().trim().nullable().optional(),
      teamAdminEmail: z
        .string()
        .trim()
        .email("Invalid team admin email format")
        .max(190, "Email cannot exceed 190 characters")
        .optional(),
      departmentId: z.coerce
        .number()
        .int("Department ID must be an integer")
        .positive("Department ID must be a positive number")
        .optional(),
      status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
    })
    .refine(
      (data) =>
        data.name !== undefined ||
        data.description !== undefined ||
        data.teamAdminEmail !== undefined ||
        data.departmentId !== undefined ||
        data.status !== undefined,
      { message: "At least one field must be provided for update" },
    ),
};

const teamParamIdSchema = {
  params: z.object({
    id: z.coerce
      .number({ required_error: "Team ID is mandatory" })
      .int("Team ID must be an integer")
      .positive("Team ID must be a positive number"),
  }),
};

const teamIdParamSchema = {
  params: z.object({
    teamId: z.coerce
      .number({
        required_error: "Team ID is mandatory",
        invalid_type_error: "Team ID must be a number",
      })
      .int("Team ID must be an integer")
      .positive("Team ID must be a positive number"),
  }),
};

const teamQuerySchema = {
  query: z.object({
    departmentId: z.coerce.number().int().positive().optional(),
    includeInactive: z
      .preprocess((val) => val === "true" || val === true, z.boolean())
      .optional(),
    myTeamsOnly: z
      .preprocess((val) => val === "true" || val === true, z.boolean())
      .optional(),
  }),
};

const addTeamMemberSchema = {
  params: z.object({
    userId: z.coerce
      .number({
        required_error: "User ID is mandatory",
        invalid_type_error: "User ID must be a number",
      })
      .int("User ID must be an integer")
      .positive("User ID must be a positive number"),
  }),
  body: z.object({
    teamId: z.coerce
      .number({
        required_error: "Team ID is mandatory",
        invalid_type_error: "Team ID must be a number",
      })
      .int("Team ID must be an integer")
      .positive("Team ID must be a positive number"),
  }),
};

const removeTeamMemberSchema = {
  params: z.object({
    userId: z.coerce
      .number({
        required_error: "User ID is mandatory",
        invalid_type_error: "User ID must be a number",
      })
      .int("User ID must be an integer")
      .positive("User ID must be a positive number"),
    teamId: z.coerce
      .number({
        required_error: "Team ID is mandatory",
        invalid_type_error: "Team ID must be a number",
      })
      .int("Team ID must be an integer")
      .positive("Team ID must be a positive number"),
  }),
};

const userTeamsQuerySchema = {
  params: z.object({
    userId: z.coerce
      .number({
        required_error: "User ID is mandatory",
        invalid_type_error: "User ID must be a number",
      })
      .int("User ID must be an integer")
      .positive("User ID must be a positive number"),
  }),
  query: z.object({
    includeHistory: z
      .preprocess((val) => val === "true" || val === true, z.boolean())
      .optional(),
  }),
};

const bulkAddTeamMembersSchema = {
  params: z.object({
    teamId: z.coerce
      .number({
        required_error: "Team ID is mandatory",
        invalid_type_error: "Team ID must be a number",
      })
      .int("Team ID must be an integer")
      .positive("Team ID must be a positive number"),
  }),
  body: z.object({
    userIds: z
      .array(
        z.coerce
          .number({
            invalid_type_error: "User ID must be a number",
          })
          .int("User ID must be an integer")
          .positive("User ID must be a positive number"),
        { required_error: "userIds array is required" }
      )
      .min(1, "At least one user ID must be provided"),
  }),
};

const bulkRemoveTeamMembersSchema = {
  params: z.object({
    teamId: z.coerce
      .number({
        required_error: "Team ID is mandatory",
        invalid_type_error: "Team ID must be a number",
      })
      .int("Team ID must be an integer")
      .positive("Team ID must be a positive number"),
  }),
  body: z.object({
    userIds: z
      .array(
        z.coerce
          .number({
            invalid_type_error: "User ID must be a number",
          })
          .int("User ID must be an integer")
          .positive("User ID must be a positive number"),
        { required_error: "userIds array is required" }
      )
      .min(1, "At least one user ID must be provided"),
  }),
};

module.exports = {
  createTeamSchema,
  updateTeamSchema,
  teamParamIdSchema,
  teamIdParamSchema,
  teamQuerySchema,
  addTeamMemberSchema,
  removeTeamMemberSchema,
  userTeamsQuerySchema,
  bulkAddTeamMembersSchema,
  bulkRemoveTeamMembersSchema,
};
