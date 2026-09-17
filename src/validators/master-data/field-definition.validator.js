const { z } = require("zod");

const TicketFieldTypes = [
  "TEXT",
  "LONG_TEXT",
  "NUMBER",
  "DECIMAL",
  "BOOLEAN",
  "DATE",
  "DATETIME",
  "SELECT",
  "MULTI_SELECT",
  "EMAIL",
  "URL",
];

const optionSchema = z.object({
  label: z
    .string({ required_error: "Option label is required" })
    .trim()
    .min(1, "Option label cannot be empty"),
  value: z
    .string({ required_error: "Option value is required" })
    .trim()
    .min(1, "Option value cannot be empty"),
});

const createFieldDefinitionSchema = {
  body: z
    .object({
      name: z
        .string({ required_error: "Field name is required" })
        .trim()
        .min(1, "Field name cannot be empty")
        .max(100, "Field name cannot exceed 100 characters"),
      description: z.string().trim().optional(),
      fieldType: z.enum(TicketFieldTypes, {
        required_error: "Field type is required",
        invalid_type_error: `Invalid field type. Must be one of: ${TicketFieldTypes.join(", ")}`,
      }),
      isRequired: z.boolean().optional().default(false),
      sortOrder: z.coerce.number().int().optional().default(0),
      teamId: z.coerce
        .number()
        .int("Team ID must be an integer")
        .positive("Team ID must be a positive number")
        .nullable()
        .optional(),
      options: z.array(optionSchema).optional().nullable(),
    })
    .superRefine((data, ctx) => {
      if (data.fieldType === "SELECT" || data.fieldType === "MULTI_SELECT") {
        if (
          !data.options ||
          !Array.isArray(data.options) ||
          data.options.length === 0
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["options"],
            message: `Options are required for ${data.fieldType} fields and must contain at least one { label, value } pair`,
          });
        }
      }
    }),
};

const updateFieldDefinitionSchema = {
  params: z.object({
    id: z.coerce
      .number({ required_error: "Field definition ID is mandatory" })
      .int("Field definition ID must be an integer")
      .positive("Field definition ID must be a positive number"),
  }),
  body: z
    .object({
      name: z
        .string()
        .trim()
        .min(1, "Field name cannot be empty")
        .max(100, "Field name cannot exceed 100 characters")
        .optional(),
      description: z.string().trim().nullable().optional(),
      fieldType: z.enum(TicketFieldTypes).optional(),
      isRequired: z.boolean().optional(),
      sortOrder: z.coerce.number().int().optional(),
      options: z.array(optionSchema).optional().nullable(),
      status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
    })
    .refine(
      (data) =>
        data.name !== undefined ||
        data.description !== undefined ||
        data.fieldType !== undefined ||
        data.isRequired !== undefined ||
        data.sortOrder !== undefined ||
        data.options !== undefined ||
        data.status !== undefined,
      { message: "At least one field must be provided for update" },
    )
    .superRefine((data, ctx) => {
      if (data.fieldType === "SELECT" || data.fieldType === "MULTI_SELECT") {
        if (
          data.options !== undefined &&
          (!Array.isArray(data.options) || data.options.length === 0)
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["options"],
            message: `Options cannot be empty for ${data.fieldType} fields`,
          });
        }
      }
    }),
};

const fieldDefinitionIdParamSchema = {
  params: z.object({
    id: z.coerce
      .number({ required_error: "Field definition ID is mandatory" })
      .int("Field definition ID must be an integer")
      .positive("Field definition ID must be a positive number"),
  }),
};

const fieldDefinitionQuerySchema = {
  query: z.object({
    teamId: z.coerce.number().int().positive().optional(),
    includeInactive: z
      .preprocess((val) => val === "true" || val === true, z.boolean())
      .optional(),
  }),
};

module.exports = {
  TicketFieldTypes,
  createFieldDefinitionSchema,
  updateFieldDefinitionSchema,
  fieldDefinitionIdParamSchema,
  fieldDefinitionQuerySchema,
};
