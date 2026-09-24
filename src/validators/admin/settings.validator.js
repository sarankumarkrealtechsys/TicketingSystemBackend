const { z } = require("zod");

const updateEmailNotificationsSchema = {
  body: z.object({
    enabled: z.boolean({
      required_error: "enabled is required and must be a boolean",
      invalid_type_error: "enabled must be a boolean",
    }),
  }),
};

const updateInAppNotificationsSchema = {
  body: z.object({
    enabled: z.boolean({
      required_error: "enabled is required and must be a boolean",
      invalid_type_error: "enabled must be a boolean",
    }),
  }),
};

module.exports = {
  updateEmailNotificationsSchema,
  updateInAppNotificationsSchema,
};

