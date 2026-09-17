const { z } = require("zod");

const healthQuerySchema = {
  query: z.object({
    detailed: z.enum(["true", "false"]).optional(),
  }),
};

module.exports = { healthQuerySchema };
