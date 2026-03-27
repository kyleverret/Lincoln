import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

// HIPAA: Prevent deletion or modification of audit logs (6-year retention)
db.$use(async (params, next) => {
  if (params.model === "AuditLog") {
    if (params.action === "delete" || params.action === "deleteMany") {
      throw new Error("AuditLog records are immutable and cannot be deleted (HIPAA retention policy)");
    }
    if (params.action === "update" || params.action === "updateMany") {
      throw new Error("AuditLog records are immutable and cannot be modified (HIPAA retention policy)");
    }
  }
  return next(params);
});

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
