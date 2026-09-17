const { z } = require("zod");

const TicketStatusBehaviors = [
  "OPEN",
  "IN_PROGRESS",
  "ON_HOLD",
  "RESOLVED",
  "CLOSED",
];

const createTicketStatusSchema = {
  body: z.object({
    label: z
      .string({ required_error: "Ticket status label is required" })
      .trim()
      .min(1, "Ticket status label cannot be empty")
      .max(60, "Ticket status label cannot exceed 60 characters"),
    description: z.string().trim().optional(),
    behavior: z.enum(TicketStatusBehaviors, {
      required_error: "Behavior is required",
      invalid_type_error: `Invalid behavior. Must be one of: ${TicketStatusBehaviors.join(", ")}`,
    }),
    teamId: z.coerce
      .number()
      .int("Team ID must be an integer")
      .positive("Team ID must be a positive number")
      .nullable()
      .optional(),
    sortOrder: z.coerce.number().int().optional().default(0),
  }),
};

const updateTicketStatusSchema = {
  params: z.object({
    id: z.coerce
      .number({ required_error: "Ticket status ID is mandatory" })
      .int("Ticket status ID must be an integer")
      .positive("Ticket status ID must be a positive number"),
  }),
  body: z
    .object({
      label: z
        .string()
        .trim()
        .min(1, "Ticket status label cannot be empty")
        .max(60, "Ticket status label cannot exceed 60 characters")
        .optional(),
      description: z.string().trim().nullable().optional(),
      behavior: z
        .enum(TicketStatusBehaviors, {
          invalid_type_error: `Invalid behavior. Must be one of: ${TicketStatusBehaviors.join(", ")}`,
        })
        .optional(),
      sortOrder: z.coerce.number().int().optional(),
      status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
    })
    .refine(
      (data) =>
        data.label !== undefined ||
        data.description !== undefined ||
        data.behavior !== undefined ||
        data.sortOrder !== undefined ||
        data.status !== undefined,
      { message: "At least one field must be provided for update" },
    ),
};

const ticketStatusIdParamSchema = {
  params: z.object({
    id: z.coerce
      .number({ required_error: "Ticket status ID is mandatory" })
      .int("Ticket status ID must be an integer")
      .positive("Ticket status ID must be a positive number"),
  }),
};

const ticketStatusQuerySchema = {
  query: z.object({
    teamId: z.coerce.number().int().positive().optional(),
    includeInactive: z
      .preprocess((val) => val === "true" || val === true, z.boolean())
      .optional(),
  }),
};

module.exports = {
  TicketStatusBehaviors,
  createTicketStatusSchema,
  updateTicketStatusSchema,
  ticketStatusIdParamSchema,
  ticketStatusQuerySchema,
};
