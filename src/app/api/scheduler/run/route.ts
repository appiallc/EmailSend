import { NextResponse } from "next/server";
import { checkForReplies } from "@/lib/replies";
import { processDueFollowUps } from "@/lib/campaign";

export async function POST() {
  const [replies, followUps] = await Promise.all([
    checkForReplies(),
    processDueFollowUps(),
  ]);
  return NextResponse.json({ replies, followUps });
}
