import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  C2C_VENDOR_BODY,
  C2C_VENDOR_FOLLOWUP_BODY,
  C2C_VENDOR_FOLLOWUP_SUBJECT,
  C2C_VENDOR_SUBJECT_A,
  C2C_VENDOR_SUBJECT_B,
  DEFAULT_FOLLOWUP_BODY,
  DEFAULT_FOLLOWUP_SUBJECT,
  DEFAULT_INITIAL_BODY,
  DEFAULT_INITIAL_SUBJECT,
} from "@/lib/templates";

const SEED_TEMPLATES = [
  {
    name: "Appia intro",
    kind: "initial",
    subject: DEFAULT_INITIAL_SUBJECT,
    bodyHtml: DEFAULT_INITIAL_BODY,
  },
  {
    name: "Appia follow-up",
    kind: "followup",
    subject: DEFAULT_FOLLOWUP_SUBJECT,
    bodyHtml: DEFAULT_FOLLOWUP_BODY,
  },
  {
    name: "C2C vendor partnership (A)",
    kind: "initial",
    subject: C2C_VENDOR_SUBJECT_A,
    bodyHtml: C2C_VENDOR_BODY,
  },
  {
    name: "C2C vendor partnership (B)",
    kind: "initial",
    subject: C2C_VENDOR_SUBJECT_B,
    bodyHtml: C2C_VENDOR_BODY,
  },
  {
    name: "C2C vendor partnership follow-up",
    kind: "followup",
    subject: C2C_VENDOR_FOLLOWUP_SUBJECT,
    bodyHtml: C2C_VENDOR_FOLLOWUP_BODY,
  },
] as const;

/** Seed template names we keep in sync with code (C2C copy). */
const SYNCED_SEED_NAMES = new Set([
  "C2C vendor partnership (A)",
  "C2C vendor partnership (B)",
  "C2C vendor partnership follow-up",
]);

async function ensureSeedTemplates() {
  const count = await prisma.emailTemplate.count();
  if (count === 0) {
    await prisma.emailTemplate.createMany({ data: [...SEED_TEMPLATES] });
    return;
  }

  const existing = await prisma.emailTemplate.findMany({
    select: { id: true, name: true },
  });
  const byName = new Map(existing.map((t) => [t.name, t.id]));

  const missing = SEED_TEMPLATES.filter((t) => !byName.has(t.name));
  if (missing.length > 0) {
    await prisma.emailTemplate.createMany({ data: [...missing] });
  }

  // Refresh C2C seed copy so India-only wording stays current
  for (const seed of SEED_TEMPLATES) {
    if (!SYNCED_SEED_NAMES.has(seed.name)) continue;
    const id = byName.get(seed.name);
    if (!id) continue;
    await prisma.emailTemplate.update({
      where: { id },
      data: {
        subject: seed.subject,
        bodyHtml: seed.bodyHtml,
        kind: seed.kind,
      },
    });
  }
}

export async function GET() {
  await ensureSeedTemplates();
  const templates = await prisma.emailTemplate.findMany({
    orderBy: [{ kind: "asc" }, { updatedAt: "desc" }],
  });
  return NextResponse.json(templates);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const name = String(body.name || "").trim();
  const subject = String(body.subject || "").trim();
  const bodyHtml = String(body.bodyHtml || "").trim();
  const kind = body.kind === "followup" ? "followup" : "initial";

  if (!name || !subject || !bodyHtml) {
    return NextResponse.json(
      { error: "name, subject, and bodyHtml are required" },
      { status: 400 }
    );
  }

  const template = await prisma.emailTemplate.create({
    data: { name, subject, bodyHtml, kind },
  });
  return NextResponse.json(template);
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const id = String(body.id || "");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const data: {
    name?: string;
    subject?: string;
    bodyHtml?: string;
    kind?: string;
  } = {};
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.subject !== undefined) data.subject = String(body.subject).trim();
  if (body.bodyHtml !== undefined) data.bodyHtml = String(body.bodyHtml).trim();
  if (body.kind !== undefined) {
    data.kind = body.kind === "followup" ? "followup" : "initial";
  }

  if (
    (data.name !== undefined && !data.name) ||
    (data.subject !== undefined && !data.subject) ||
    (data.bodyHtml !== undefined && !data.bodyHtml)
  ) {
    return NextResponse.json(
      { error: "name, subject, and bodyHtml cannot be empty" },
      { status: 400 }
    );
  }

  const template = await prisma.emailTemplate.update({
    where: { id },
    data,
  });
  return NextResponse.json(template);
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  await prisma.emailTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
