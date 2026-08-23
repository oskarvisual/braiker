import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/modules/auth/session";
import { resolveLearningProposal } from "@/modules/bots/learning-proposal-service";

const schema = z.object({ action: z.enum(["APPROVE", "REJECT"]) });

export async function POST(request: Request, context: { params: Promise<{ proposalId: string }> }) {
  try {
    assertSameOrigin(request);
    const [user, body, params] = await Promise.all([requireUser(), request.json(), context.params]);
    if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "INVALID_LEARNING_PROPOSAL_ACTION" }, { status: 400 });
    const result = await prisma.$transaction((tx) => resolveLearningProposal({ proposalId: params.proposalId, userId: user.id, actorRole: user.role, action: parsed.data.action }, tx));
    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "LEARNING_PROPOSAL_RESOLUTION_FAILED";
    return NextResponse.json({ error: ["FORBIDDEN", "LEARNING_PROPOSAL_NOT_PENDING"].includes(code) ? code : "LEARNING_PROPOSAL_RESOLUTION_FAILED" }, { status: code === "FORBIDDEN" ? 403 : code === "LEARNING_PROPOSAL_NOT_PENDING" ? 409 : 400 });
  }
}
