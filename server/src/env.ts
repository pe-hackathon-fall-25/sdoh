import dotenv from 'dotenv';
dotenv.config();
export const env = {
  PORT: parseInt(process.env.PORT || '4000', 10),
  DATABASE_URL: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/sdoh',
  TENANT_ID: process.env.TENANT_ID || '00000000-0000-0000-0000-000000000001',
};
