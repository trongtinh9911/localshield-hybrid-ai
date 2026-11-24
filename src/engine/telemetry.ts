export type ProvenanceBadge =
	| "FIREBASE_ON_DEVICE_NANO"
	| "FIREBASE_CLOUD_GEMINI"
	| "LOCAL_DETERMINISTIC_OFFLINE";

export interface TelemetryEvent {
	id: string;
	timestamp: string;
	provenance: ProvenanceBadge;
	sdkInferenceMode: string;
	latencyMs: number;
	routingReason: string;
	piiTokensKeptLocal: number;
	rawPiiSentToCloud: number; // Invariant: always 0
	estimatedInputTokens: number;
	estimatedCloudCostSavedUsd: number;
	offlineActive: boolean;
	redactionApplied: boolean;
}

export interface TelemetrySummary {
	totalRuns: number;
	onDeviceRuns: number;
	cloudRuns: number;
	onDeviceSplitPercent: number;
	cloudSplitPercent: number;
	totalPiiTokensKeptLocal: number;
	totalRawPiiLeaked: number;
	totalCostSavedUsd: number;
	avgLatencyMs: number;
	events: TelemetryEvent[];
}

// Blended reference pricing for cloud frontier inference ($0.30/1M input + $2.50/1M output ~ $0.0014 per 1k tokens)
const CLOUD_COST_PER_1K_TOKENS_USD = 0.0014;

export function estimateTokenCount(text: string): number {
	const trimmed = text.trim();
	if (!trimmed) return 0;
	return Math.max(1, Math.ceil(trimmed.length / 4));
}

export function estimateCloudCostSavedUsd(
	provenance: ProvenanceBadge,
	inputTokens: number,
	outputTokens: number,
): number {
	if (provenance === "FIREBASE_CLOUD_GEMINI") {
		return 0;
	}
	const totalTokens = inputTokens + outputTokens;
	const saved = (totalTokens / 1000) * CLOUD_COST_PER_1K_TOKENS_USD;
	return Number(saved.toFixed(6));
}

export function computeTelemetrySummary(
	events: TelemetryEvent[],
): TelemetrySummary {
	const totalRuns = events.length;
	if (totalRuns === 0) {
		return {
			totalRuns: 0,
			onDeviceRuns: 0,
			cloudRuns: 0,
			onDeviceSplitPercent: 100,
			cloudSplitPercent: 0,
			totalPiiTokensKeptLocal: 0,
			totalRawPiiLeaked: 0,
			totalCostSavedUsd: 0,
			avgLatencyMs: 0,
			events: [],
		};
	}

	let onDeviceRuns = 0;
	let cloudRuns = 0;
	let totalPiiTokensKeptLocal = 0;
	let totalRawPiiLeaked = 0;
	let totalCostSavedUsd = 0;
	let totalLatency = 0;

	for (const ev of events) {
		if (ev.provenance === "FIREBASE_CLOUD_GEMINI") {
			cloudRuns += 1;
		} else {
			onDeviceRuns += 1;
		}
		totalPiiTokensKeptLocal += ev.piiTokensKeptLocal;
		totalRawPiiLeaked += ev.rawPiiSentToCloud;
		totalCostSavedUsd += ev.estimatedCloudCostSavedUsd;
		totalLatency += ev.latencyMs;
	}

	const onDeviceSplitPercent = Math.round((onDeviceRuns / totalRuns) * 100);
	const cloudSplitPercent = 100 - onDeviceSplitPercent;

	return {
		totalRuns,
		onDeviceRuns,
		cloudRuns,
		onDeviceSplitPercent,
		cloudSplitPercent,
		totalPiiTokensKeptLocal,
		totalRawPiiLeaked,
		totalCostSavedUsd: Number(totalCostSavedUsd.toFixed(6)),
		avgLatencyMs: Math.round(totalLatency / totalRuns),
		events,
	};
}
