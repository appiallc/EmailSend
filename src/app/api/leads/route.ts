import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  normalizeLeadInput,
  parseLeadsCsv,
  parseLeadsJson,
  type LeadInput,
} from "@/lib/leads-import";

function isValidLead(data: LeadInput): boolean {
  return Boolean(
    data.contactName || data.email || data.company || data.upworkJobUrl
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const status = (searchParams.get("status") || "").trim().toLowerCase();
  const STATUSES = new Set(["new", "researching", "ready", "contacted"]);

  const leads = await prisma.lead.findMany({
    where: {
      AND: [
        status && STATUSES.has(status) ? { status } : {},
        q
          ? {
              OR: [
                { contactName: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
                { company: { contains: q, mode: "insensitive" } },
                { notes: { contains: q, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(leads);
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Record<string, unknown>;

  // Bulk: CSV text
  if (typeof body.csv === "string") {
    const { leads, errors } = parseLeadsCsv(body.csv);
    if (leads.length === 0) {
      return NextResponse.json(
        { error: errors[0] || "No valid leads in CSV.", errors },
        { status: 400 }
      );
    }
    const result = await prisma.lead.createMany({ data: leads });
    return NextResponse.json({ imported: result.count, errors });
  }

  // Bulk: JSON string or already-parsed array
  if (typeof body.json === "string") {
    const { leads, errors } = parseLeadsJson(body.json);
    if (leads.length === 0) {
      return NextResponse.json(
        { error: errors[0] || "No valid leads in JSON.", errors },
        { status: 400 }
      );
    }
    const result = await prisma.lead.createMany({ data: leads });
    return NextResponse.json({ imported: result.count, errors });
  }

  if (Array.isArray(body.leads)) {
    const errors: string[] = [];
    const leads: LeadInput[] = [];
    for (let i = 0; i < body.leads.length; i++) {
      const row = body.leads[i];
      if (!row || typeof row !== "object") {
        errors.push(`Item ${i + 1}: expected an object`);
        continue;
      }
      const lead = normalizeLeadInput(row as Record<string, unknown>);
      if (!lead) {
        errors.push(`Item ${i + 1}: missing required fields`);
        continue;
      }
      leads.push(lead);
    }
    if (leads.length === 0) {
      return NextResponse.json(
        { error: errors[0] || "No valid leads.", errors },
        { status: 400 }
      );
    }
    const result = await prisma.lead.createMany({ data: leads });
    return NextResponse.json({ imported: result.count, errors });
  }

  // Single lead
  const data = normalizeLeadInput(body);
  if (!data || !isValidLead(data)) {
    return NextResponse.json(
      { error: "Add at least a contact name, email, company, or Upwork job URL." },
      { status: 400 }
    );
  }

  const lead = await prisma.lead.create({ data });
  return NextResponse.json(lead);
}

export async function PUT(request: NextRequest) {
  const body = (await request.json()) as Record<string, unknown>;
  const id = String(body.id || "");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const data = normalizeLeadInput(body);
  if (!data || !isValidLead(data)) {
    return NextResponse.json(
      { error: "Add at least a contact name, email, company, or Upwork job URL." },
      { status: 400 }
    );
  }

  const lead = await prisma.lead.update({ where: { id }, data });
  return NextResponse.json(lead);
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  await prisma.lead.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
