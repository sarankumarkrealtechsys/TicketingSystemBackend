const dotenv = require("dotenv");
const { z } = require("zod");

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(5000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  // JWT_SECRET is strictly mandatory with no fallback or hardcoded default
  JWT_SECRET: z
    .string()
    .min(1, "JWT_SECRET is required from environment with no fallback"),
  JWT_EXPIRES_IN: z.string().default("30d"),
  COOKIE_NAME: z.string().default("rts_auth"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  SMTP_HOST: z.string().optional().default("smtp.mailtrap.io"),
  SMTP_PORT: z.coerce.number().optional().default(2525),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASSWORD: z.string().optional().default(""),
  SMTP_FROM: z.string().optional().default("noreply@example.com"),
  UPLOAD_DIR: z.string().default("./uploads"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error(
      "❌ FATAL: Invalid environment variables:",
      JSON.stringify(result.error.format(), null, 2),
    );
    throw new Error(
      "Environment configuration validation failed. Check your .env file.",
    );
  }
  return result.data;
};

const env = parseEnv();

module.exports = { env };
