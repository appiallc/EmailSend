import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const url = process.env.DATABASE_URL;

if (!url) {
  console.error("❌ DATABASE_URL is not set in .env");
  process.exit(1);
}

const masked = url.replace(/:([^:@/]+)@/, ":***@");
console.log(`Testing: ${masked}\n`);

const prisma = new PrismaClient();

const isPostgres = url.startsWith("postgresql://") || url.startsWith("postgres://");

try {
  await prisma.$queryRaw`SELECT 1 AS ok`;
  const tables = isPostgres
    ? await prisma.$queryRaw`
        SELECT table_name AS tablename
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `
    : await prisma.$queryRaw`
        SELECT name AS tablename FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      `;
  console.log("✅ Database connection successful");
  if (tables.length === 0) {
    console.log("⚠️  Connected but no tables yet. Run: npx prisma db push");
  } else {
    console.log(`✅ Tables found: ${tables.map((t) => t.tablename).join(", ")}`);
  }
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("❌ Connection failed\n");
  if (msg.includes("Can't reach database server") && url.includes("db.") && url.includes(".supabase.co")) {
    console.error("You are using the DIRECT Supabase URL. It often fails on local networks (IPv6).");
    console.error("");
    console.error("Fix:");
    console.error("  1. Supabase Dashboard → Project Settings → Database");
    console.error("  2. Connection string → Method: Session → Port 5432");
    console.error("  3. Copy URI and set it as DATABASE_URL in .env");
    console.error("  4. Run: npx prisma db push");
  } else {
    console.error(msg);
  }
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
