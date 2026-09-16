const { z } = require("zod");

const createUserSchema = {
  body: z.object({
    name: z
      .string({ required_error: "Name is mandatory" })
      .min(1, "Name is mandatory")
      .max(150, "Name cannot exceed 150 characters")
      .trim(),
    username: z
      .string({ required_error: "Username is mandatory" })
      .min(3, "Username must be at least 3 characters long")
      .max(100, "Username cannot exceed 100 characters")
      .trim(),
    password: z
      .string({ required_error: "Password is mandatory" })
      .min(8, "Password must be at least 8 characters long")
      .max(100, "Password cannot exceed 100 characters"),
    email: z
      .string({ required_error: "Email is mandatory" })
      .email("Invalid email address")
      .max(190, "Email cannot exceed 190 characters")
      .trim(),
    departmentId: z.coerce
      .number({
        required_error: "Department is mandatory",
        invalid_type_error: "Department ID must be a number",
      })
      .int("Department ID must be an integer")
      .positive("Department ID must be a positive number"),
    roleId: z.coerce
      .number({
        required_error: "Role is mandatory",
        invalid_type_error: "Role ID must be a number",
      })
      .int("Role ID must be an integer")
      .positive("Role ID must be a positive number"),
    status: z
      .enum(["ACTIVE", "INACTIVE"], {
        errorMap: () => ({
          message: "Status must be either ACTIVE or INACTIVE",
        }),
      })
      .default("ACTIVE"),
  }),
};

const updateUserSchema = {
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
    departmentId: z.coerce
      .number({ invalid_type_error: "Department ID must be a number" })
      .int("Department ID must be an integer")
      .positive("Department ID must be a positive number")
      .optional(),
    roleId: z.coerce
      .number({ invalid_type_error: "Role ID must be a number" })
      .int("Role ID must be an integer")
      .positive("Role ID must be a positive number")
      .optional(),
    status: z
      .enum(["ACTIVE", "INACTIVE"], {
        errorMap: () => ({
          message: "Status must be either ACTIVE or INACTIVE",
        }),
      })
      .optional(),
    name: z
      .string()
      .min(1, "Name cannot be empty")
      .max(150, "Name cannot exceed 150 characters")
      .trim()
      .optional(),
    email: z
      .string()
      .email("Invalid email address")
      .max(190, "Email cannot exceed 190 characters")
      .trim()
      .optional(),
  }),
};

const userIdParamSchema = {
  params: z.object({
    userId: z.coerce
      .number({
        required_error: "User ID is mandatory",
        invalid_type_error: "User ID must be a number",
      })
      .int("User ID must be an integer")
      .positive("User ID must be a positive number"),
  }),
};

const listUsersQuerySchema = {
  query: z.object({
    departmentId: z.coerce
      .number({ invalid_type_error: "Department ID must be a number" })
      .int("Department ID must be an integer")
      .positive("Department ID must be a positive number")
      .optional(),
    roleId: z.coerce
      .number({ invalid_type_error: "Role ID must be a number" })
      .int("Role ID must be an integer")
      .positive("Role ID must be a positive number")
      .optional(),
    status: z
      .enum(["ACTIVE", "INACTIVE"], {
        errorMap: () => ({
          message: "Status must be either ACTIVE or INACTIVE",
        }),
      })
      .optional(),
    search: z.string().trim().optional(),
  }),
};

module.exports = {
  createUserSchema,
  updateUserSchema,
  userIdParamSchema,
  listUsersQuerySchema,
};
