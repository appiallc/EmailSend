import { NextResponse } from "next/server";
import { getSettings } from "@/lib/db";
import { verifyImapConnection } from "@/lib/imap-verify";
import { prisma } from "@/lib/db";

export async function POST() {
  try {
    const settings = await getSettings();
    await verifyImapConnection(settings);
    await prisma.settings.update({
      where: { id: "default" },
      data: {
        lastReplyCheckAt: new Date(),
        lastReplyCheckError: "",
      },
    });
    return NextResponse.json({
      ok: true,
      message: `IMAP OK — connected to ${settings.imapHost} as ${settings.imapUser}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "IMAP test failed";
    try {
      await prisma.settings.update({
        where: { id: "default" },
        data: {
          lastReplyCheckAt: new Date(),
          lastReplyCheckError: message,
        },
      });
    } catch {
      // ignore
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
