import { PrismaClient } from "@prisma/client";
import { createClient } from "@libsql/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export function getDatabaseClient(): PrismaClient {
  if (process.env.NODE_ENV === "test") {
    if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith("file:")) {
      throw new Error("Test environment requires a local SQLite DATABASE_URL (e.g. file:../test.db)");
    }
    console.log("[db] Using local SQLite test database");
    return new PrismaClient();
  }

  const hasTursoUrl = Boolean(process.env.TURSO_DATABASE_URL);
  const hasTursoToken = Boolean(process.env.TURSO_AUTH_TOKEN);

  if (hasTursoUrl !== hasTursoToken) {
    throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be configured together.");
  }

  if (hasTursoUrl && hasTursoToken) {
    console.log("[db] Using Turso database");
    const libsql = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN!,
    });
    const adapter = new PrismaLibSQL(libsql);
    return new PrismaClient({ adapter });
  } else {
    // Fallback to local SQLite
    if (process.env.RENDER) {
      throw new Error("Turso database credentials (TURSO_DATABASE_URL, TURSO_AUTH_TOKEN) are missing in Render production environment. Local SQLite fallback is disabled.");
    }
    console.log("[db] Using local SQLite database");
    return new PrismaClient();
  }
}

let prisma: PrismaClient;

if (globalForPrisma.prisma) {
  prisma = globalForPrisma.prisma;
} else {
  prisma = getDatabaseClient();
}

export const db = prisma;

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
