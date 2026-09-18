const { z } = require("zod");

const createTicketSchema = {
  body: z.object({
    projectId: z.coerce
      .number({ required_error: "Project ID is required" })
      .int("Project ID must be an integer")
      .positive("Project ID must be a positive number"),
    teamId: z.coerce
      .number({ required_error: "Team ID is required" })
      .int("Team ID must be an integer")
      .positive("Team ID must be a positive number"),
    summary: z
      .string({ required_error: "Summary is required" })
      .trim()
      .min(1, "Summary cannot be empty")
      .max(255, "Summary cannot exceed 255 characters"),
    description: z
      .string({ required_error: "Description is required" })
      .trim()
      .min(1, "Description cannot be empty"),
    assigneeIds: z
      .array(
        z.coerce
          .number()
          .int("Assignee ID must be an integer")
          .positive("Assignee ID must be a positive number"),
        { required_error: "At least one assignee is required" },
      )
      .min(1, "At least one assignee is required"),
    priorityId: z.coerce
      .number({ required_error: "Priority ID is required" })
      .int("Priority ID must be an integer")
      .positive("Priority ID must be a positive number"),
    statusId: z.coerce
      .number()
      .int("Status ID must be an integer")
      .positive("Status ID must be a positive number")
      .optional(),
    parentTicketId: z.coerce
      .number()
      .int("Parent Ticket ID must be an integer")
      .positive("Parent Ticket ID must be a positive number")
      .nullable()
      .optional(),
    remarks: z.string().trim().optional(),
    attachments: z
      .array(
        z
          .object({
            originalFileName: z.string().trim().min(1).max(255).optional(),
            fileName: z.string().trim().min(1).max(255).optional(),
            storageKey: z.string().trim().min(1).max(500).optional(),
            mimeType: z.string().trim().min(1).max(150),
            fileSizeBytes: z.coerce
              .number()
              .positive("Attachment file size must be greater than 0 bytes"),
            fileExtension: z.string().trim().max(20).optional(),
            checksum: z.string().trim().max(128).optional(),
          })
          .refine((data) => data.originalFileName || data.fileName, {
            message: "Either originalFileName or fileName must be provided",
          }),
      )
      .optional(),
    customFields: z
      .array(
        z.object({
          fieldDefinitionId: z.coerce
            .number({ required_error: "fieldDefinitionId is required" })
            .int()
            .positive(),
          value: z.any({ required_error: "value is required" }),
        }),
      )
      .optional(),
  }),
};

const ticketQuerySchema = {
  query: z.object({
    teamId: z.coerce.number().int().positive().optional(),
    statusId: z.coerce.number().int().positive().optional(),
    priorityId: z.coerce.number().int().positive().optional(),
    projectId: z.coerce.number().int().positive().optional(),
    assigneeId: z.coerce.number().int().positive().optional(),
    createdById: z.coerce.number().int().positive().optional(),
    scope: z.enum(["all", "personal", "created", "assigned"]).optional(),
    search: z.string().trim().optional(),
    startDate: z.string().refine((v) => !isNaN(Date.parse(v)), { message: "startDate must be a valid date string" }).optional(),
    endDate: z.string().refine((v) => !isNaN(Date.parse(v)), { message: "endDate must be a valid date string" }).optional(),
    createdAfter: z.string().refine((v) => !isNaN(Date.parse(v)), { message: "createdAfter must be a valid date string" }).optional(),
    createdBefore: z.string().refine((v) => !isNaN(Date.parse(v)), { message: "createdBefore must be a valid date string" }).optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
};

const ticketIdParamSchema = {
  params: z.object({
    id: z.coerce
      .number({ required_error: "Ticket ID is mandatory" })
      .int("Ticket ID must be an integer")
      .positive("Ticket ID must be a positive number"),
  }),
};

const addAssigneeSchema = {
  params: z.object({
    id: z.coerce
      .number({ required_error: "Ticket ID is required" })
      .int("Ticket ID must be an integer")
      .positive("Ticket ID must be a positive number"),
  }),
  body: z.object({
    userId: z.coerce
      .number({ required_error: "User ID is required" })
      .int("User ID must be an integer")
      .positive("User ID must be a positive number"),
    teamId: z.coerce
      .number()
      .int("Team ID must be an integer")
      .positive("Team ID must be a positive number")
      .nullable()
      .optional(),
  }),
};

const removeAssigneeSchema = {
  params: z.object({
    id: z.coerce
      .number({ required_error: "Ticket ID is required" })
      .int("Ticket ID must be an integer")
      .positive("Ticket ID must be a positive number"),
    userId: z.coerce
      .number({ required_error: "User ID is required" })
      .int("User ID must be an integer")
      .positive("User ID must be a positive number"),
  }),
};

const reassignTicketSchema = {
  params: z.object({
    id: z.coerce
      .number({ required_error: "Ticket ID is required" })
      .int("Ticket ID must be an integer")
      .positive("Ticket ID must be a positive number"),
  }),
  body: z.object({
    assigneeIds: z
      .array(
        z.coerce
          .number()
          .int("Assignee ID must be an integer")
          .positive("Assignee ID must be a positive number"),
        { required_error: "At least one assignee is required" },
      )
      .min(1, "At least one assignee is required"),
    teamId: z.coerce
      .number()
      .int("Team ID must be an integer")
      .positive("Team ID must be a positive number")
      .nullable()
      .optional(),
    remarks: z.string().trim().optional(),
  }),
};

const addCollaboratingTeamSchema = {
  params: z.object({
    id: z.coerce
      .number({ required_error: "Ticket ID is required" })
      .int("Ticket ID must be an integer")
      .positive("Ticket ID must be a positive number"),
  }),
  body: z.object({
    teamId: z.coerce
      .number({ required_error: "Team ID is required" })
      .int("Team ID must be an integer")
      .positive("Team ID must be a positive number"),
  }),
};

const removeCollaboratingTeamSchema = {
  params: z.object({
    id: z.coerce
      .number({ required_error: "Ticket ID is required" })
      .int("Ticket ID must be an integer")
      .positive("Ticket ID must be a positive number"),
    teamId: z.coerce
      .number({ required_error: "Team ID is required" })
      .int("Team ID must be an integer")
      .positive("Team ID must be a positive number")
      .optional(),
  }),
  body: z
    .object({
      teamId: z.coerce
        .number()
        .int("Team ID must be an integer")
        .positive("Team ID must be a positive number")
        .optional(),
    })
    .optional(),
};

const changeStatusSchema = {
  params: z.object({
    id: z.coerce
      .number({ required_error: "Ticket ID is required" })
      .int("Ticket ID must be an integer")
      .positive("Ticket ID must be a positive number"),
  }),
  body: z.object({
    statusId: z.coerce
      .number({ required_error: "Status ID is required" })
      .int("Status ID must be an integer")
      .positive("Status ID must be a positive number"),
    remarks: z.string().trim().optional(),
  }),
};

const closeTicketSchema = {
  params: z.object({
    id: z.coerce
      .number({ required_error: "Ticket ID is required" })
      .int("Ticket ID must be an integer")
      .positive("Ticket ID must be a positive number"),
  }),
  body: z
    .object({
      remarks: z.string().trim().optional(),
    })
    .optional()
    .default({}),
};

const changePrioritySchema = {
  params: z.object({
    id: z.coerce
      .number({ required_error: "Priority ID is required" })
      .int("Priority ID must be an integer")
      .positive("Priority ID must be a positive number"),
  }),
  body: z.object({
    priorityId: z.coerce
      .number({ required_error: "Priority ID is required" })
      .int("Priority ID must be an integer")
      .positive("Priority ID must be a positive number"),
    remarks: z.string().trim().optional(),
  }),
};

const createSubTicketSchema = {
  params: z.object({
    id: z.coerce
      .number({ required_error: "Parent Ticket ID is required" })
      .int("Parent Ticket ID must be an integer")
      .positive("Parent Ticket ID must be a positive number"),
  }),
  body: createTicketSchema.body.omit({ parentTicketId: true }),
};

const addRemarkSchema = {
  params: z.object({
    id: z.coerce
      .number({ required_error: "Ticket ID is required" })
      .int("Ticket ID must be an integer")
      .positive("Ticket ID must be a positive number"),
  }),
  body: z.object({
    remarks: z
      .string({ required_error: "Remarks are required" })
      .trim()
      .min(1, "Remarks cannot be empty"),
  }),
};

const updateTicketSchema = {
  params: z.object({
    id: z.coerce
      .number({ required_error: "Ticket ID is required" })
      .int("Ticket ID must be an integer")
      .positive("Ticket ID must be a positive number"),
  }),
  body: z.object({
    summary: z
      .string()
      .trim()
      .min(1, "Summary cannot be empty")
      .max(255, "Summary cannot exceed 255 characters")
      .optional(),
    description: z
      .string()
      .trim()
      .min(1, "Description cannot be empty")
      .optional(),
    version: z.coerce
      .number()
      .int("Version must be an integer")
      .positive("Version must be a positive number")
      .optional(),
    remarks: z.string().trim().optional(),
    customFields: z
      .array(
        z.object({
          fieldDefinitionId: z.coerce
            .number({ required_error: "fieldDefinitionId is required" })
            .int()
            .positive(),
          value: z.any({ required_error: "value is required" }),
        }),
      )
      .optional(),
  }),
};

module.exports = {
  createTicketSchema,
  updateTicketSchema,
  ticketQuerySchema,
  ticketIdParamSchema,
  addAssigneeSchema,
  removeAssigneeSchema,
  reassignTicketSchema,
  addCollaboratingTeamSchema,
  removeCollaboratingTeamSchema,
  changeStatusSchema,
  closeTicketSchema,
  changePrioritySchema,
  createSubTicketSchema,
  addRemarkSchema,
};
