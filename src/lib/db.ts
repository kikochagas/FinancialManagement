import { PrismaClient } from "@prisma/client";
import { createClient } from "@libsql/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

let prisma: PrismaClient;

if (globalForPrisma.prisma) {
  prisma = globalForPrisma.prisma;
} else {
  const hasTursoUrl = Boolean(process.env.TURSO_DATABASE_URL);
  const hasTursoToken = Boolean(process.env.TURSO_AUTH_TOKEN);

  if (hasTursoUrl !== hasTursoToken) {
    throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be configured together.");
  }

  if (hasTursoUrl && hasTursoToken) {
    const libsql = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN!,
    });
    const adapter = new PrismaLibSQL(libsql);
    prisma = new PrismaClient({ adapter });
  } else {
    // Fallback to local SQLite
    if (process.env.RENDER) {
      throw new Error("Turso database credentials (TURSO_DATABASE_URL, TURSO_AUTH_TOKEN) are missing in Render production environment. Local SQLite fallback is disabled.");
    }
    prisma = new PrismaClient();
  }
}

export const db = prisma;

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
