import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireSafeMutationRequest } from "@/server/api-guards";
import { enforceRateLimit } from "@/server/rate-limit-service";
import {
  decideManualAcceptanceSession,
  decideOutputTieOut,
  decideReleaseGate,
  decideTaxReviewFixture,
  getReleaseClosureState,
  infrastructureControlCatalog,
  ingestProductionReadiness,
  releaseGateCatalog,
  saveInfrastructureControl,
  saveManualAcceptanceSession,
  saveOutputTieOut,
  saveReleaseGate,
  saveTaxReviewFixture,
} from "@/server/release-closure-service";
import { requestAuthorizationContext } from "@/server/request-auth";

const gateCodes = releaseGateCatalog.map(({ code }) => code) as [typeof releaseGateCatalog[number]["code"], ...Array<typeof releaseGateCatalog[number]["code"]>];
const controlCodes = infrastructureControlCatalog.map(({ code }) => code) as [typeof infrastructureControlCatalog[number]["code"], ...Array<typeof infrastructureControlCatalog[number]["code"]>];
const nullableUuid = z.uuid().nullable();
const comparisonValues = z.record(z.string().trim().min(1).max(200), z.string().max(1000)).refine((value) => Object.keys(value).length >= 1 && Object.keys(value).length <= 500, "Provide 1–500 comparison values.");
const decisionFields = { id: z.uuid(), expectedVersion: z.number().int().positive(), note: z.string().trim().min(1).max(2000) } as const;

const bodySchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("save_gate"), gateCode: z.enum(gateCodes), status: z.enum(["pending", "blocked", "evidence_ready"]), ownerUserId: nullableUuid, dueDate: z.string().date().nullable(), evidenceReference: z.string().max(500), notes: z.string().max(4000), expectedVersion: z.number().int().positive().nullable() }).strict(),
  z.object({ operation: z.literal("decide_gate"), gateCode: z.enum(gateCodes), expectedVersion: z.number().int().positive(), decision: z.enum(["approved", "rejected"]), note: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ operation: z.literal("save_tax_fixture"), fixtureCode: z.string().trim().min(3).max(64), title: z.string().trim().min(1).max(200), sourceReference: z.string().trim().min(1).max(500), rulePackageVersion: z.string().trim().min(1).max(100), expectedValues: comparisonValues, actualValues: comparisonValues, expectedVersion: z.number().int().positive().nullable() }).strict(),
  z.object({ operation: z.literal("decide_tax_fixture"), ...decisionFields, decision: z.enum(["approved", "rejected"]) }).strict(),
  z.object({ operation: z.literal("save_control"), controlCode: z.enum(controlCodes), providerName: z.string().trim().min(1).max(200), status: z.enum(["pending", "pass", "fail"]), evidenceReference: z.string().trim().min(1).max(500), details: z.string().trim().min(1).max(4000), observedAt: z.string().datetime(), expiresAt: z.string().datetime().nullable(), expectedVersion: z.number().int().positive().nullable() }).strict(),
  z.object({ operation: z.literal("ingest_readiness"), ready: z.boolean(), assessedAt: z.string().datetime(), checks: z.array(z.object({ name: z.string().trim().min(1).max(200), passed: z.boolean(), detail: z.string().trim().min(1).max(1000) }).strict()).min(1).max(50) }).strict(),
  z.object({ operation: z.literal("save_manual_session"), protocol: z.enum(["accessibility", "preparer"]), title: z.string().trim().min(1).max(200), testEnvironment: z.string().trim().min(1).max(500), participantRole: z.string().trim().min(1).max(200), assistiveTechnology: z.string().max(500).nullable(), scenariosTotal: z.number().int().min(1).max(1000), scenariosPassed: z.number().int().min(0).max(1000), result: z.enum(["pass", "partial", "fail"]), findings: z.string().trim().min(1).max(4000), evidenceReference: z.string().trim().min(1).max(500), conductedAt: z.string().datetime() }).strict(),
  z.object({ operation: z.literal("decide_manual_session"), ...decisionFields, decision: z.enum(["signed", "rejected"]) }).strict(),
  z.object({ operation: z.literal("save_tie_out"), taxYearId: z.uuid(), calculationRunId: nullableUuid, artifactId: nullableUuid, title: z.string().trim().min(1).max(200), expectedValues: comparisonValues, actualValues: comparisonValues, evidenceReference: z.string().trim().min(1).max(500) }).strict(),
  z.object({ operation: z.literal("decide_tie_out"), ...decisionFields, decision: z.enum(["approved", "rejected"]) }).strict(),
]);

export async function GET() {
  try { return NextResponse.json(await getReleaseClosureState(await requestAuthorizationContext()), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    requireSafeMutationRequest(request);
    const context = await requestAuthorizationContext();
    const body = bodySchema.parse(await request.json());
    const decision = body.operation.startsWith("decide_");
    await enforceRateLimit(context, decision ? "release_closure.decide" : "release_closure.modify");
    if (body.operation === "save_gate") return NextResponse.json(await saveReleaseGate(context, body));
    if (body.operation === "decide_gate") return NextResponse.json(await decideReleaseGate(context, body));
    if (body.operation === "save_tax_fixture") return NextResponse.json(await saveTaxReviewFixture(context, body));
    if (body.operation === "decide_tax_fixture") return NextResponse.json(await decideTaxReviewFixture(context, body));
    if (body.operation === "save_control") return NextResponse.json(await saveInfrastructureControl(context, body));
    if (body.operation === "ingest_readiness") return NextResponse.json(await ingestProductionReadiness(context, body));
    if (body.operation === "save_manual_session") return NextResponse.json(await saveManualAcceptanceSession(context, body));
    if (body.operation === "decide_manual_session") return NextResponse.json(await decideManualAcceptanceSession(context, body));
    if (body.operation === "save_tie_out") return NextResponse.json(await saveOutputTieOut(context, body));
    return NextResponse.json(await decideOutputTieOut(context, body));
  } catch (error) { return apiError(error); }
}
