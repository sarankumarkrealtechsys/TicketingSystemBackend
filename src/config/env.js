const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_ACCESS_SECRET: z.string().default('default_jwt_access_secret_key_change_in_prod'),
  JWT_REFRESH_SECRET: z.string().default('default_jwt_refresh_secret_key_change_in_prod'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  SMTP_HOST: z.string().optional().default('smtp.mailtrap.io'),
  SMTP_PORT: z.coerce.number().optional().default(2525),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASSWORD: z.string().optional().default(''),
  SMTP_FROM: z.string().optional().default('noreply@example.com'),
  UPLOAD_DIR: z.string().default('./uploads'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:', result.error.format());
    return {
      NODE_ENV: 'development',
      PORT: 5000,
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ticketing_db?schema=public',
      JWT_ACCESS_SECRET: 'default_jwt_access_secret_key_change_in_prod',
      JWT_REFRESH_SECRET: 'default_jwt_refresh_secret_key_change_in_prod',
      JWT_ACCESS_EXPIRES_IN: '15m',
      JWT_REFRESH_EXPIRES_IN: '7d',
      REDIS_URL: 'redis://localhost:6379',
      SMTP_HOST: 'smtp.mailtrap.io',
      SMTP_PORT: 2525,
      SMTP_USER: '',
      SMTP_PASSWORD: '',
      SMTP_FROM: 'noreply@example.com',
      UPLOAD_DIR: './uploads',
      CORS_ORIGIN: 'http://localhost:5173',
    };
  }
  return result.data;
};

const env = parseEnv();

module.exports = { env };
