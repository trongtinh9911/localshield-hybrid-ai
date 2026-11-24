import { describe, expect, it } from "vitest";
import { executeHybridInference } from "../ai/hybridRouter";
import { DOCUMENT_PRESETS } from "../data/presets";
import {
	buildAuditReceiptJson,
	buildAuditReceiptMarkdown,
} from "./auditExport";
import { runLocalDeterministicAnalysis } from "./localAnalyzer";
import { scanAndRedactPii } from "./piiClassifier";
import {
	computeTelemetrySummary,
	estimateCloudCostSavedUsd,
	estimateTokenCount,
	type TelemetryEvent,
} from "./telemetry";

describe("localAnalyzer, telemetry & auditExport", () => {
	it("extracts clinical follow-ups, medication allergy alert, and ER red flags on HIPAA preset", () => {
		const text = DOCUMENT_PRESETS[0].content;
		const scan = scanAndRedactPii(text);
		const analysis = runLocalDeterministicAnalysis(scan.redactedText, scan);

		expect(analysis.domain).toBe("CLINICAL");
		expect(analysis.clinicalFollowUps.length).toBeGreaterThanOrEqual(2);
		expect(analysis.riskClauses.some((r) => r.title.includes("Allergy"))).toBe(
			true,
		);
		expect(analysis.riskClauses.some((r) => r.title.includes("Red-Flag"))).toBe(
			true,
		);
		expect(analysis.actionItems.length).toBeGreaterThanOrEqual(2);
	});

	it("extracts unlimited liability, perpetual confidentiality, indemnification, and auto-renewal on Legal NDA preset", () => {
		const text = DOCUMENT_PRESETS[1].content;
		const scan = scanAndRedactPii(text);
		const analysis = runLocalDeterministicAnalysis(scan.redactedText, scan);

		expect(analysis.domain).toBe("LEGAL");
		const titles = analysis.riskClauses.map((r) => r.title);
		expect(titles).toContain("Unlimited Liability Exposure");
		expect(titles).toContain("Perpetual Confidentiality Term");
		expect(titles).toContain("Broad Unilateral Indemnification");
		expect(titles).toContain("Automatic Renewal Trap");
		expect(titles).toContain("Restrictive Covenant / Non-Solicit");
	});

	it("extracts deadlines, obligations, and FERPA compliance note on Financial Aid preset", () => {
		const text = DOCUMENT_PRESETS[2].content;
		const scan = scanAndRedactPii(text);
		const analysis = runLocalDeterministicAnalysis(scan.redactedText, scan);

		expect(analysis.domain).toBe("ACADEMIC_FERPA");
		expect(analysis.obligations.length).toBeGreaterThanOrEqual(2);
		expect(analysis.riskClauses.some((r) => r.title.includes("Deadline"))).toBe(
			true,
		);
		expect(analysis.complianceNotes.some((n) => n.includes("FERPA"))).toBe(
			true,
		);
	});

	it("estimates token counts accurately for empty and populated strings", () => {
		expect(estimateTokenCount("")).toBe(0);
		expect(estimateTokenCount("   ")).toBe(0);
		expect(estimateTokenCount("Hello world 1234")).toBe(4);
	});

	it("calculates positive cloud cost savings for on-device runs and $0 for cloud runs", () => {
		expect(
			estimateCloudCostSavedUsd("FIREBASE_ON_DEVICE_NANO", 500, 500),
		).toBeGreaterThan(0);
		expect(
			estimateCloudCostSavedUsd("LOCAL_DETERMINISTIC_OFFLINE", 500, 500),
		).toBeGreaterThan(0);
		expect(estimateCloudCostSavedUsd("FIREBASE_CLOUD_GEMINI", 500, 500)).toBe(
			0,
		);
	});

	it("computes telemetry summary split percentages, averages, and totals accurately", () => {
		const events: TelemetryEvent[] = [
			{
				id: "1",
				timestamp: "2026-11-24T10:00:00Z",
				provenance: "FIREBASE_ON_DEVICE_NANO",
				sdkInferenceMode: "only_on_device",
				latencyMs: 12,
				routingReason: "On device",
				piiTokensKeptLocal: 24,
				rawPiiSentToCloud: 0,
				estimatedInputTokens: 200,
				estimatedCloudCostSavedUsd: 0.0005,
				offlineActive: false,
				redactionApplied: true,
			},
			{
				id: "2",
				timestamp: "2026-11-24T10:01:00Z",
				provenance: "LOCAL_DETERMINISTIC_OFFLINE",
				sdkInferenceMode: "only_on_device",
				latencyMs: 8,
				routingReason: "Offline",
				piiTokensKeptLocal: 16,
				rawPiiSentToCloud: 0,
				estimatedInputTokens: 150,
				estimatedCloudCostSavedUsd: 0.0004,
				offlineActive: true,
				redactionApplied: true,
			},
			{
				id: "3",
				timestamp: "2026-11-24T10:02:00Z",
				provenance: "FIREBASE_CLOUD_GEMINI",
				sdkInferenceMode: "prefer_in_cloud",
				latencyMs: 400,
				routingReason: "Redacted cloud",
				piiTokensKeptLocal: 10,
				rawPiiSentToCloud: 0,
				estimatedInputTokens: 180,
				estimatedCloudCostSavedUsd: 0,
				offlineActive: false,
				redactionApplied: true,
			},
		];

		const summary = computeTelemetrySummary(events);
		expect(summary.totalRuns).toBe(3);
		expect(summary.onDeviceRuns).toBe(2);
		expect(summary.cloudRuns).toBe(1);
		expect(summary.onDeviceSplitPercent).toBe(67);
		expect(summary.cloudSplitPercent).toBe(33);
		expect(summary.totalPiiTokensKeptLocal).toBe(50);
		expect(summary.totalRawPiiLeaked).toBe(0);
		expect(summary.avgLatencyMs).toBe(140);
		expect(summary.totalCostSavedUsd).toBeCloseTo(0.0009, 6);
	});

	it("returns clean default telemetry summary when zero runs exist", () => {
		const empty = computeTelemetrySummary([]);
		expect(empty.totalRuns).toBe(0);
		expect(empty.onDeviceSplitPercent).toBe(100);
		expect(empty.cloudSplitPercent).toBe(0);
		expect(empty.totalRawPiiLeaked).toBe(0);
	});

	it("builds safe Markdown and JSON audit receipts containing zero raw PII", async () => {
		const result = await executeHybridInference({
			documentText: DOCUMENT_PRESETS[0].content,
			userMode: "AUTO_PRIVACY",
			offlineMode: true,
			allowRedactedCloud: false,
			firebaseConfig: null,
			onDeviceAvailability: "unavailable",
		});

		const summary = computeTelemetrySummary([result.telemetry]);
		const jsonReceipt = buildAuditReceiptJson(result, summary);
		const mdReceipt = buildAuditReceiptMarkdown(result, summary);

		expect(jsonReceipt.privacyVerification.rawPiiSentToCloud).toBe(0);
		expect(jsonReceipt.provenance).toBe("LOCAL_DETERMINISTIC_OFFLINE");
		expect(jsonReceipt.redactedDocumentPreview).not.toContain("412-88-3901");
		expect(jsonReceipt.redactedDocumentPreview).not.toContain("MRN-849201-CA");

		expect(mdReceipt).toContain("LOCAL_DETERMINISTIC_OFFLINE");
		expect(mdReceipt).toContain("Raw PII Sent To Cloud:** 0");
		expect(mdReceipt).not.toContain("412-88-3901");
		expect(mdReceipt).not.toContain("elena.rostova@example-health.org");
	});
});
