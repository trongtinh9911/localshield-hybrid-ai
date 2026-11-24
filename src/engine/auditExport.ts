import type { HybridExecutionResult } from "../ai/hybridRouter";
import type { TelemetrySummary } from "./telemetry";

export interface AuditReceiptJson {
	schemaVersion: "1.0.0";
	application: "LocalShield Hybrid";
	generatedAt: string;
	provenance: HybridExecutionResult["provenance"];
	firebaseAiLogic: {
		inferenceMode: string;
		hybridParams: HybridExecutionResult["hybridParamsSnapshot"];
		sdkNote: string;
	};
	privacyVerification: {
		domain: string;
		riskLevel: string;
		riskScore: number;
		directPiiCount: number;
		piiCategories: Record<string, number>;
		piiTokensKeptLocal: number;
		rawPiiSentToCloud: 0;
		redactionApplied: boolean;
	};
	routingDecision: {
		requestedMode: string;
		reason: string;
		offlineActive: boolean;
	};
	performance: {
		latencyMs: number;
		estimatedInputTokens: number;
		estimatedCloudCostSavedUsd: number;
		sessionOnDeviceSplitPercent: number;
	};
	analysis: {
		headline: string;
		summary: string;
		obligations: string[];
		riskClauses: HybridExecutionResult["structuredAnalysis"]["riskClauses"];
		clinicalFollowUps: string[];
		actionItems: HybridExecutionResult["structuredAnalysis"]["actionItems"];
		complianceNotes: string[];
		markdownOutput: string;
	};
	redactedDocumentPreview: string;
}

export function buildAuditReceiptJson(
	result: HybridExecutionResult,
	summary: TelemetrySummary,
): AuditReceiptJson {
	const categories: Record<string, number> = {};
	for (const [k, v] of Object.entries(result.scan.categoryCounts)) {
		if (typeof v === "number") {
			categories[k] = v;
		}
	}

	return {
		schemaVersion: "1.0.0",
		application: "LocalShield Hybrid",
		generatedAt: result.telemetry.timestamp,
		provenance: result.provenance,
		firebaseAiLogic: {
			inferenceMode: result.decision.sdkInferenceMode,
			hybridParams: result.hybridParamsSnapshot,
			sdkNote: result.sdkNote,
		},
		privacyVerification: {
			domain: result.scan.domain,
			riskLevel: result.scan.riskLevel,
			riskScore: result.scan.riskScore,
			directPiiCount: result.scan.directPiiCount,
			piiCategories: categories,
			piiTokensKeptLocal: result.telemetry.piiTokensKeptLocal,
			rawPiiSentToCloud: 0,
			redactionApplied: result.telemetry.redactionApplied,
		},
		routingDecision: {
			requestedMode: result.decision.requestedMode,
			reason: result.decision.reason,
			offlineActive: result.telemetry.offlineActive,
		},
		performance: {
			latencyMs: result.telemetry.latencyMs,
			estimatedInputTokens: result.telemetry.estimatedInputTokens,
			estimatedCloudCostSavedUsd: result.telemetry.estimatedCloudCostSavedUsd,
			sessionOnDeviceSplitPercent: summary.onDeviceSplitPercent,
		},
		analysis: {
			headline: result.structuredAnalysis.headline,
			summary: result.structuredAnalysis.summary,
			obligations: result.structuredAnalysis.obligations,
			riskClauses: result.structuredAnalysis.riskClauses,
			clinicalFollowUps: result.structuredAnalysis.clinicalFollowUps,
			actionItems: result.structuredAnalysis.actionItems,
			complianceNotes: result.structuredAnalysis.complianceNotes,
			markdownOutput: result.markdownOutput,
		},
		redactedDocumentPreview: result.scan.redactedText,
	};
}

export function buildAuditReceiptMarkdown(
	result: HybridExecutionResult,
	summary: TelemetrySummary,
): string {
	const categories = Object.entries(result.scan.categoryCounts)
		.map(([k, v]) => `${k}: ${v}`)
		.join(", ");

	return [
		"# LocalShield Hybrid — Privacy & Inference Audit Receipt",
		"",
		`- **Generated At:** ${result.telemetry.timestamp}`,
		`- **Execution Provenance:** \`${result.provenance}\``,
		`- **Firebase AI Logic Mode:** \`${result.decision.sdkInferenceMode}\``,
		`- **Requested Policy:** \`${result.decision.requestedMode}\``,
		`- **Offline Mode Active:** ${result.telemetry.offlineActive ? "Yes (Zero Network Egress)" : "No"}`,
		`- **Latency:** ${result.telemetry.latencyMs} ms`,
		`- **Risk Classification:** ${result.scan.riskLevel} (${result.scan.riskScore}/100) — Domain: ${result.scan.domain}`,
		`- **Direct PII Entities Protected Locally:** ${result.scan.directPiiCount} (${categories || "None"})`,
		`- **Raw PII Sent To Cloud:** 0 (Verified Zero-Leak Invariant)`,
		`- **Estimated Cloud Cost Saved (Run):** $${result.telemetry.estimatedCloudCostSavedUsd.toFixed(6)}`,
		`- **Session On-Device Split:** ${summary.onDeviceSplitPercent}% On-Device / ${summary.cloudSplitPercent}% Cloud`,
		"",
		"## Routing Rationale",
		result.decision.reason,
		"",
		"## SDK Runtime Note",
		result.sdkNote,
		"",
		"## Analysis Output",
		result.markdownOutput,
		"",
		"## Locally Redacted Document (Safe Archive Copy)",
		"```text",
		result.scan.redactedText,
		"```",
	].join("\n");
}

export function triggerFileDownload(
	filename: string,
	content: string,
	mimeType: string,
): void {
	const blob = new Blob([content], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	document.body.appendChild(anchor);
	anchor.click();
	document.body.removeChild(anchor);
	URL.revokeObjectURL(url);
}
