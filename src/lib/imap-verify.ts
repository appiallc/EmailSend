import Imap from "imap";
import type { Settings } from "@prisma/client";

const IMAP_CONNECT_TIMEOUT_MS = 20_000;

function closeImap(imap: Imap): void {
  try {
    imap.removeAllListeners("error");
    imap.on("error", () => {});
    imap.destroy();
  } catch {
    // already closed
  }
}

/** Verify IMAP credentials / connectivity without reading mail. */
export async function verifyImapConnection(settings: Settings): Promise<{ ok: true }> {
  if (!settings.imapHost || !settings.imapUser) {
    throw new Error("IMAP not configured. Enter host, username, and password.");
  }

  const imap = new Imap({
    user: settings.imapUser,
    password: settings.imapPass,
    host: settings.imapHost,
    port: settings.imapPort || 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
    connTimeout: IMAP_CONNECT_TIMEOUT_MS,
    authTimeout: IMAP_CONNECT_TIMEOUT_MS,
  });

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      closeImap(imap);
      reject(err);
    };
    const ok = () => {
      if (settled) return;
      settled = true;
      closeImap(imap);
      resolve();
    };

    const timer = setTimeout(() => {
      fail(new Error(`IMAP connection timed out to ${settings.imapHost}`));
    }, IMAP_CONNECT_TIMEOUT_MS);

    imap.once("ready", () => {
      clearTimeout(timer);
      imap.openBox("INBOX", true, (err) => {
        if (err) fail(err instanceof Error ? err : new Error(String(err)));
        else ok();
      });
    });
    imap.once("error", (err: Error) => {
      clearTimeout(timer);
      const msg = err?.message || "IMAP connection failed";
      if (/invalid credentials|auth/i.test(msg)) {
        fail(
          new Error(
            `IMAP authentication failed for ${settings.imapUser}. Use an app password if required.`
          )
        );
      } else {
        fail(new Error(`IMAP error on ${settings.imapHost}: ${msg}`));
      }
    });
    imap.connect();
  });

  return { ok: true };
}
