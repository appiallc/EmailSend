import { NextRequest, NextResponse } from "next/server";
import {
  listSuppressedEmails,
  suppressEmail,
  unsuppressEmail,
} from "@/lib/suppression";

export async function GET() {
  const rows = await listSuppressedEmails();
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const email = String(body.email || "").trim();
  if (!email) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  try {
    const row = await suppressEmail(email, "manual", "settings");
    return NextResponse.json(row);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not suppress email" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const email =
    request.nextUrl.searchParams.get("email") ||
    String((await request.json().catch(() => ({}))).email || "");
  if (!email) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }
  await unsuppressEmail(email);
  return NextResponse.json({ ok: true });
}
