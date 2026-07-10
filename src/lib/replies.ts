import Imap from "imap";
import { simpleParser } from "mailparser";
import { prisma } from "./db";
import { mailFromParsed, parseBounceEmail } from "./bounces";

const IMAP_CONNECT_TIMEOUT_MS = 20_000;
const IMAP_OPERATION_TIMEOUT_MS = 15_000;
const MAX_MESSAGES_PER_RUN = 15;
const IMAP_SEARCH_SINCE_DAYS = 30;

const BOUNCEABLE_STATUSES = ["sent", "opened", "clicked"] as const;

export interface InboundCheckResult {
  replies: number;
  bounces: number;
}

function withTimeout<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs = IMAP_OPERATION_TIMEOUT_MS
): Promise<T> {
  let timeout: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeout);
  });
}

function closeImap(imap: Imap): void {
  try {
    imap.destroy();
  } catch {
    // Connection may already be closed.
  }
}

function openInbox(imap: Imap): Promise<Imap.Box> {
  return new Promise((resolve, reject) => {
    imap.openBox("INBOX", false, (err, box) => {
      if (err) reject(err);
      else resolve(box);
    });
  });
}

function searchUnread(imap: Imap): Promise<number[]> {
  const since = new Date();
  since.setDate(since.getDate() - IMAP_SEARCH_SINCE_DAYS);
  const sinceStr = since.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return new Promise((resolve, reject) => {
    imap.search(["UNSEEN", ["SINCE", sinceStr]], (err, results) => {
      if (err) reject(err);
      else resolve(results || []);
    });
  });
}

function fetchMessage(imap: Imap, uid: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let settled = false;

    const finish = (err?: Error, buffer?: Buffer) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(buffer ?? Buffer.alloc(0));
    };

    const stream = imap.fetch(uid, { bodies: "" });
    stream.on("message", (msg) => {
      msg.on("body", (s) => {
        s.on("data", (chunk: Buffer) => chunks.push(chunk));
      });
    });
    stream.once("error", (err) => finish(err));
    stream.once("end", () => finish(undefined, Buffer.concat(chunks)));
  });
}

function markSeen(imap: Imap, uid: number): Promise<void> {
  return new Promise((resolve, reject) => {
    imap.addFlags(uid, ["\\Seen"], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function connectImap(config: {
  host: string;
  port: number;
  user: string;
  password: string;
}): Promise<Imap> {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: config.user,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: true,
      connTimeout: IMAP_CONNECT_TIMEOUT_MS,
      authTimeout: IMAP_CONNECT_TIMEOUT_MS,
      tlsOptions: { rejectUnauthorized: false },
      socketTimeout: IMAP_OPERATION_TIMEOUT_MS,
    } as Imap.Config);

    const timeout = setTimeout(() => {
      cleanup();
      closeImap(imap);
      reject(new Error(`IMAP connection timed out after ${IMAP_CONNECT_TIMEOUT_MS / 1000}s`));
    }, IMAP_CONNECT_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timeout);
      imap.removeListener("ready", onReady);
      imap.removeListener("error", onError);
    };

    const onReady = () => {
      cleanup();
      resolve(imap);
    };

    const onError = (err: Error) => {
      cleanup();
      closeImap(imap);
      reject(err);
    };

    imap.once("ready", onReady);
    imap.once("error", onError);
    imap.connect();
  });
}

async function runImapOp<T>(
  imap: Imap,
  label: string,
  operation: () => Promise<T>
): Promise<T> {
  try {
    return await withTimeout(operation(), label);
  } catch (err) {
    closeImap(imap);
    throw err;
  }
}

async function applyBounce(recipient: string, reason: string, bounceType: string) {
  const email = recipient.toLowerCase();

  const log = await prisma.emailLog.findFirst({
    where: {
      contact: { email },
      status: { in: [...BOUNCEABLE_STATUSES] },
    },
    orderBy: { sentAt: "desc" },
  });

  if (!log) {
    console.warn(`[bounces] Bounce detected for ${email} but no matching EmailLog found`);
    return false;
  }

  await prisma.emailLog.update({
    where: { id: log.id },
    data: {
      status: "bounced",
      bounceReason: reason,
      bounceType,
      bouncedAt: new Date(),
    },
  });

  console.log(
    `[bounces] Bounce detected — recipient: ${email}, reason: ${reason}, type: ${bounceType}, EmailLog: ${log.id}`
  );
  return true;
}

async function applyReply(parsed: Awaited<ReturnType<typeof simpleParser>>) {
  const inReplyTo = parsed.inReplyTo || "";
  const references = parsed.references
    ? Array.isArray(parsed.references)
      ? parsed.references.join(" ")
      : String(parsed.references)
    : "";
  const fromEmail = parsed.from?.value?.[0]?.address?.toLowerCase() || "";

  const searchIds = `${inReplyTo} ${references}`;
  const trackingMatch = searchIds.match(/<([a-z0-9]+)@/i);
  const trackingId = trackingMatch?.[1];

  let log = trackingId
    ? await prisma.emailLog.findUnique({ where: { trackingId } })
    : null;

  if (!log && fromEmail) {
    const contact = await prisma.contact.findFirst({
      where: { email: fromEmail },
    });
    if (contact) {
      log = await prisma.emailLog.findFirst({
        where: {
          contactId: contact.id,
          status: { notIn: ["replied", "bounced"] },
        },
        orderBy: { sentAt: "desc" },
      });
    }
  }

  if (!log || log.status === "replied" || log.status === "bounced") {
    return false;
  }

  await prisma.emailLog.update({
    where: { id: log.id },
    data: { status: "replied", repliedAt: new Date() },
  });
  return true;
}

export async function checkForReplies(): Promise<InboundCheckResult> {
  const settings = await prisma.settings.findUnique({ where: { id: "default" } });
  if (!settings?.imapHost || !settings.imapUser || !settings.imapPass) {
    return { replies: 0, bounces: 0 };
  }

  let imap: Imap | null = null;
  let replies = 0;
  let bounces = 0;

  try {
    imap = await connectImap({
      host: settings.imapHost,
      port: settings.imapPort,
      user: settings.imapUser,
      password: settings.imapPass,
    });

    await runImapOp(imap, "Opening IMAP inbox", () => openInbox(imap!));
    const uids = await runImapOp(imap, "Searching unread IMAP messages", () =>
      searchUnread(imap!)
    );

    if (uids.length > MAX_MESSAGES_PER_RUN) {
      console.warn(
        `[replies] ${uids.length} unread messages in last ${IMAP_SEARCH_SINCE_DAYS} days; processing newest ${MAX_MESSAGES_PER_RUN}`
      );
    }

    const uidsToProcess = uids.slice(-MAX_MESSAGES_PER_RUN);

    for (const uid of uidsToProcess) {
      const raw = await runImapOp(imap, `Fetching IMAP message ${uid}`, () =>
        fetchMessage(imap!, uid)
      );
      const parsed = await simpleParser(raw);
      let handled = false;

      const bounce = parseBounceEmail(mailFromParsed(parsed));
      if (bounce.isBounce) {
        if (bounce.recipient && bounce.bounceType && bounce.reason) {
          const updated = await applyBounce(
            bounce.recipient,
            bounce.reason,
            bounce.bounceType
          );
          if (updated) bounces++;
        } else {
          console.warn(
            `[bounces] Bounce-like message could not be parsed fully (uid ${uid})`
          );
        }
        handled = true;
      } else {
        const replied = await applyReply(parsed);
        if (replied) replies++;
        handled = replied;
      }

      if (handled) {
        await runImapOp(imap, `Marking IMAP message ${uid} as seen`, () =>
          markSeen(imap!, uid)
        );
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "IMAP reply check failed";
    console.error("[replies] IMAP reply check failed:", err);
    throw new Error(message);
  } finally {
    if (imap) closeImap(imap);
  }

  return { replies, bounces };
}
