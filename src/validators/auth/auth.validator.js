const { z } = require("zod");

const loginSchema = {
  body: z.object({
    username: z.string().min(2, "Username must be at least 2 characters long"),
    password: z.string().min(6, "Password must be at least 6 characters long"),
  }),
};

module.exports = { loginSchema };
