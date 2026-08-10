import dotenv from 'dotenv';
import { z } from 'zod';
dotenv.config();

const envSchema = z.object({
  PORT: z.string().min(1),
  SERVER_URL: z.string().min(1),
  NODE_ENV: z.string().min(1),
});

export const envVariables = envSchema.parse(process.env);
