import Imap from "imap";
import { PrismaClient } from "@prisma/client";

const CONNECT_MS = 20_000;
const OP_MS = 15_000;

function log(step) {
  console.log(`[${((Date.now() - start) / 1000).toFixed(1)}s] ${step}`);
}

const start = Date.now();
const prisma = new PrismaClient();

function withTimeout(promise, label, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

function connect(config) {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: config.user,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: true,
      connTimeout: CONNECT_MS,
      authTimeout: CONNECT_MS,
      tlsOptions: { rejectUnauthorized: false },
    });

    const timer = setTimeout(() => {
      imap.destroy();
      reject(new Error(`connect timed out after ${CONNECT_MS / 1000}s`));
    }, CONNECT_MS);

    imap.once("ready", () => {
      clearTimeout(timer);
      resolve(imap);
    });
    imap.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    imap.connect();
  });
}

function openInbox(imap) {
  return new Promise((resolve, reject) => {
    imap.openBox("INBOX", false, (err, box) => (err ? reject(err) : resolve(box)));
  });
}

function searchUnread(imap) {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sinceStr = since.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return new Promise((resolve, reject) => {
    imap.search(["UNSEEN", ["SINCE", sinceStr]], (err, results) =>
      err ? reject(err) : resolve(results || [])
    );
  });
}

try {
  const settings = await prisma.settings.findUnique({ where: { id: "default" } });
  if (!settings?.imapHost) {
    console.error("No IMAP settings configured");
    process.exit(1);
  }

  log(`Connecting to ${settings.imapHost}:${settings.imapPort} as ${settings.imapUser}`);
  const imap = await withTimeout(
    connect({
      host: settings.imapHost,
      port: settings.imapPort,
      user: settings.imapUser,
      password: settings.imapPass,
    }),
    "connect",
    CONNECT_MS
  );
  log("Connected");

  const box = await withTimeout(openInbox(imap), "openInbox", OP_MS);
  log(`Opened INBOX (${box.messages.total} total messages)`);

  const uids = await withTimeout(searchUnread(imap), "searchUnread", OP_MS);
  log(`Found ${uids.length} unread message(s)`);

  imap.destroy();
  log("Done — IMAP works");
} catch (err) {
  log(`FAILED: ${err.message}`);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
