import Imap from "imap";
import { simpleParser } from "mailparser";
import { prisma } from "./db";

function openInbox(imap: Imap): Promise<Imap.Box> {
  return new Promise((resolve, reject) => {
    imap.openBox("INBOX", false, (err, box) => {
      if (err) reject(err);
      else resolve(box);
    });
  });
}

function searchUnread(imap: Imap): Promise<number[]> {
  return new Promise((resolve, reject) => {
    imap.search(["UNSEEN"], (err, results) => {
      if (err) reject(err);
      else resolve(results || []);
    });
  });
}

function fetchMessage(imap: Imap, uid: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stream = imap.fetch(uid, { bodies: "" });
    stream.on("message", (msg) => {
      msg.on("body", (s) => {
        s.on("data", (chunk: Buffer) => chunks.push(chunk));
      });
    });
    stream.once("error", reject);
    stream.once("end", () => resolve(Buffer.concat(chunks)));
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
      tlsOptions: { rejectUnauthorized: false },
    });
    imap.once("ready", () => resolve(imap));
    imap.once("error", reject);
    imap.connect();
  });
}

export async function checkForReplies(): Promise<number> {
  const settings = await prisma.settings.findUnique({ where: { id: "default" } });
  if (!settings?.imapHost || !settings.imapUser || !settings.imapPass) {
    return 0;
  }

  let imap: Imap | null = null;
  let matched = 0;

  try {
    imap = await connectImap({
      host: settings.imapHost,
      port: settings.imapPort,
      user: settings.imapUser,
      password: settings.imapPass,
    });

    await openInbox(imap);
    const uids = await searchUnread(imap);

    for (const uid of uids) {
      const raw = await fetchMessage(imap, uid);
      const parsed = await simpleParser(raw);

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
            where: { contactId: contact.id, status: { not: "replied" } },
            orderBy: { sentAt: "desc" },
          });
        }
      }

      if (log && log.status !== "replied") {
        await prisma.emailLog.update({
          where: { id: log.id },
          data: { status: "replied", repliedAt: new Date() },
        });
        matched++;
      }

      await markSeen(imap, uid);
    }
  } finally {
    if (imap) imap.end();
  }

  return matched;
}
