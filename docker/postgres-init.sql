-- Local dev initialization
-- Applies RLS policies after Prisma creates the schema.
-- In production, run prisma/rls.sql after the first migrate deploy.

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
