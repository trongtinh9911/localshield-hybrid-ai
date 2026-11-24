import {
	type GenerativeModel,
	GoogleAIBackend,
	getAI,
	getGenerativeModel,
	type HybridParams,
	InferenceMode,
	InferenceSource,
} from "firebase/ai";
import {
	deleteApp,
	type FirebaseApp,
	getApps,
	initializeApp,
} from "firebase/app";
import {
	type LocalAnalysisOutput,
	runLocalDeterministicAnalysis,
} from "../engine/localAnalyzer";
import { type PiiScanResult, scanAndRedactPii } from "../engine/piiClassifier";
import {
	estimateCloudCostSavedUsd,
	estimateTokenCount,
	type ProvenanceBadge,
	type TelemetryEvent,
} from "../engine/telemetry";

export type UserHybridMode =
	| "AUTO_PRIVACY"
	| "PREFER_ON_DEVICE"
	| "ONLY_ON_DEVICE"
	| "PREFER_IN_CLOUD"
	| "ONLY_IN_CLOUD";

export type OnDeviceAvailability =
	| "available"
	| "downloadable"
	| "downloading"
	| "unavailable";

export interface FirebaseByokConfig {
	apiKey: string;
	projectId: string;
	appId: string;
	modelName?: string;
}

export interface RoutingDecision {
	requestedMode: UserHybridMode;
	sdkInferenceMode: InferenceMode;
	redactionRequired: boolean;
	payloadText: string;
	allowCloudFallback: boolean;
	rawPiiSentToCloud: number;
	reason: string;
}

export interface HybridExecutionRequest {
	documentText: string;
	instruction?: string;
	userMode: UserHybridMode;
	offlineMode: boolean;
	allowRedactedCloud: boolean;
	firebaseConfig?: FirebaseByokConfig | null;
	onDeviceAvailability?: OnDeviceAvailability;
	/** Optional hook for deterministic SDK testing */
	sdkRunner?: (params: {
		hybridParams: HybridParams;
		prompt: string;
		config: FirebaseByokConfig | null;
	}) => Promise<{ text: string; inferenceSource?: InferenceSource }>;
}

export interface HybridExecutionResult {
	scan: PiiScanResult;
	decision: RoutingDecision;
	provenance: ProvenanceBadge;
	markdownOutput: string;
	structuredAnalysis: LocalAnalysisOutput;
	telemetry: TelemetryEvent;
	sdkNote: string;
	hybridParamsSnapshot: HybridParams;
}

interface ChromeLanguageModelGlobal {
	availability?: () => Promise<string>;
}

interface LegacyWindowAi {
	languageModel?: {
		capabilities?: () => Promise<{ available?: string }>;
	};
}

export async function detectOnDeviceCapability(): Promise<{
	status: OnDeviceAvailability;
	detail: string;
}> {
	try {
		const g = globalThis as unknown as {
			LanguageModel?: ChromeLanguageModelGlobal;
			ai?: LegacyWindowAi;
		};

		if (g.LanguageModel && typeof g.LanguageModel.availability === "function") {
			const raw = String(await g.LanguageModel.availability()).toLowerCase();
			if (raw === "available" || raw === "readily") {
				return {
					status: "available",
					detail: "Chrome Built-in AI (Gemini Nano) ready via Prompt API",
				};
			}
			if (raw === "downloadable" || raw === "after-download") {
				return {
					status: "downloadable",
					detail: "Chrome Gemini Nano supported (model download pending)",
				};
			}
			if (raw === "downloading") {
				return {
					status: "downloading",
					detail: "Chrome Gemini Nano model downloading in background",
				};
			}
		}

		if (
			g.ai?.languageModel &&
			typeof g.ai.languageModel.capabilities === "function"
		) {
			const caps = await g.ai.languageModel.capabilities();
			const raw = String(caps?.available ?? "no").toLowerCase();
			if (raw === "readily" || raw === "available") {
				return {
					status: "available",
					detail: "Chrome window.ai Gemini Nano ready on-device",
				};
			}
			if (raw === "after-download" || raw === "downloadable") {
				return {
					status: "downloadable",
					detail: "Chrome window.ai supported (download required)",
				};
			}
		}
	} catch {
		// Fall through cleanly if browser blocks Prompt API probe
	}

	return {
		status: "unavailable",
		detail:
			"Chrome Gemini Nano not detected — Local Deterministic Engine & Firebase Cloud (Redacted) ready",
	};
}

export function hasValidFirebaseConfig(
	config?: FirebaseByokConfig | null,
): config is FirebaseByokConfig {
	if (!config) return false;
	return Boolean(
		config.apiKey.trim().length >= 10 &&
			config.projectId.trim().length >= 3 &&
			config.appId.trim().length >= 5,
	);
}

/**
 * Security invariant check: guarantees ZERO direct PII tokens can ever appear in a cloud payload.
 */
export function assertZeroRawPiiInPayload(
	payload: string,
	scan: PiiScanResult,
): boolean {
	for (const match of scan.matches) {
		if (match.isDirectPii && payload.includes(match.original)) {
			return false;
		}
	}
	return true;
}

export function planHybridRoute(params: {
	scan: PiiScanResult;
	userMode: UserHybridMode;
	offlineMode: boolean;
	allowRedactedCloud: boolean;
	hasLiveFirebaseConfig: boolean;
	onDeviceAvailability: OnDeviceAvailability;
}): RoutingDecision {
	const {
		scan,
		userMode,
		offlineMode,
		allowRedactedCloud,
		hasLiveFirebaseConfig,
		onDeviceAvailability,
	} = params;

	// 1. Offline mode hard override: ALWAYS strictly on-device
	if (offlineMode) {
		return {
			requestedMode: userMode,
			sdkInferenceMode: InferenceMode.ONLY_ON_DEVICE,
			redactionRequired: false,
			payloadText: scan.originalText,
			allowCloudFallback: false,
			rawPiiSentToCloud: 0,
			reason:
				"Offline Mode active — enforced InferenceMode.ONLY_ON_DEVICE (zero network egress).",
		};
	}

	// 2. Explicit ONLY_ON_DEVICE
	if (userMode === "ONLY_ON_DEVICE") {
		return {
			requestedMode: userMode,
			sdkInferenceMode: InferenceMode.ONLY_ON_DEVICE,
			redactionRequired: false,
			payloadText: scan.originalText,
			allowCloudFallback: false,
			rawPiiSentToCloud: 0,
			reason:
				"User locked InferenceMode.ONLY_ON_DEVICE — raw document stays 100% inside browser.",
		};
	}

	// 3. AUTO_PRIVACY policy
	if (userMode === "AUTO_PRIVACY") {
		if (scan.hasRawPii) {
			if (!allowRedactedCloud || !hasLiveFirebaseConfig) {
				return {
					requestedMode: userMode,
					sdkInferenceMode: InferenceMode.ONLY_ON_DEVICE,
					redactionRequired: true,
					payloadText: scan.redactedText,
					allowCloudFallback: false,
					rawPiiSentToCloud: 0,
					reason: `Auto Privacy detected ${scan.directPiiCount} PII entities (${scan.riskLevel} risk) — forced InferenceMode.ONLY_ON_DEVICE; zero raw PII allowed to leave device.`,
				};
			}

			if (onDeviceAvailability === "available") {
				return {
					requestedMode: userMode,
					sdkInferenceMode: InferenceMode.PREFER_ON_DEVICE,
					redactionRequired: true,
					payloadText: scan.redactedText,
					allowCloudFallback: true,
					rawPiiSentToCloud: 0,
					reason: `Auto Privacy scrubbed ${scan.directPiiCount} PII entities locally and selected InferenceMode.PREFER_ON_DEVICE (Gemini Nano first, redacted cloud fallback).`,
				};
			}

			return {
				requestedMode: userMode,
				sdkInferenceMode: InferenceMode.PREFER_ON_DEVICE,
				redactionRequired: true,
				payloadText: scan.redactedText,
				allowCloudFallback: true,
				rawPiiSentToCloud: 0,
				reason: `Auto Privacy scrubbed ${scan.directPiiCount} PII entities into local placeholders before enabling InferenceMode.PREFER_ON_DEVICE with redacted Firebase Cloud fallback.`,
			};
		}

		return {
			requestedMode: userMode,
			sdkInferenceMode: InferenceMode.PREFER_ON_DEVICE,
			redactionRequired: false,
			payloadText: scan.originalText,
			allowCloudFallback: hasLiveFirebaseConfig,
			rawPiiSentToCloud: 0,
			reason:
				"No raw PII detected — selected InferenceMode.PREFER_ON_DEVICE (on-device Nano first, cloud Gemini fallback if configured).",
		};
	}

	// 4. PREFER_ON_DEVICE
	if (userMode === "PREFER_ON_DEVICE") {
		const mustRedact = scan.hasRawPii;
		const payload = mustRedact ? scan.redactedText : scan.originalText;
		return {
			requestedMode: userMode,
			sdkInferenceMode:
				mustRedact && !allowRedactedCloud
					? InferenceMode.ONLY_ON_DEVICE
					: InferenceMode.PREFER_ON_DEVICE,
			redactionRequired: mustRedact,
			payloadText: payload,
			allowCloudFallback:
				(!mustRedact || allowRedactedCloud) && hasLiveFirebaseConfig,
			rawPiiSentToCloud: 0,
			reason:
				mustRedact && !allowRedactedCloud
					? "Raw PII detected with redacted-cloud disabled — escalated safely to InferenceMode.ONLY_ON_DEVICE."
					: mustRedact
						? `Redacted ${scan.directPiiCount} PII tokens locally so InferenceMode.PREFER_ON_DEVICE cloud fallback never sees raw PII.`
						: "Selected InferenceMode.PREFER_ON_DEVICE via Firebase AI Logic SDK.",
		};
	}

	// 5. PREFER_IN_CLOUD or ONLY_IN_CLOUD
	const sdkMode =
		userMode === "ONLY_IN_CLOUD"
			? InferenceMode.ONLY_IN_CLOUD
			: InferenceMode.PREFER_IN_CLOUD;

	if (scan.hasRawPii) {
		// Hard privacy guardrail: cloud modes ALWAYS redact PII locally before network dispatch
		return {
			requestedMode: userMode,
			sdkInferenceMode: sdkMode,
			redactionRequired: true,
			payloadText: scan.redactedText,
			allowCloudFallback: hasLiveFirebaseConfig,
			rawPiiSentToCloud: 0,
			reason: `Enforced mandatory local PII redaction (${scan.directPiiCount} entities scrubbed) prior to ${sdkMode} — 0 raw PII transmitted.`,
		};
	}

	return {
		requestedMode: userMode,
		sdkInferenceMode: sdkMode,
		redactionRequired: false,
		payloadText: scan.originalText,
		allowCloudFallback: hasLiveFirebaseConfig,
		rawPiiSentToCloud: 0,
		reason: `Zero PII detected — routing via Firebase AI Logic ${sdkMode}.`,
	};
}

export function buildHybridParams(
	decision: RoutingDecision,
	firebaseConfig?: FirebaseByokConfig | null,
): HybridParams {
	const modelName = firebaseConfig?.modelName?.trim() || "gemini-2.5-flash";

	return {
		mode: decision.sdkInferenceMode,
		onDeviceParams: {
			createOptions: {
				temperature: 0.2,
				topK: 3,
			},
		},
		inCloudParams: {
			model: modelName,
			generationConfig: {
				temperature: 0.2,
				maxOutputTokens: 1200,
			},
		},
	};
}

function buildPrompt(
	payloadText: string,
	instruction: string | undefined,
	domain: string,
): string {
	const directive =
		instruction && instruction.trim().length > 0
			? instruction.trim()
			: "Summarize key obligations, risk clauses, clinical or compliance actions, and concrete next steps.";

	return [
		`You are LocalShield Hybrid, a privacy-first ${domain} review assistant.`,
		"Preserve any [REDACTED_*] placeholders exactly as written; never attempt to guess masked values.",
		`Directive: ${directive}`,
		"",
		"Produce concise Markdown with sections: Summary, Key Risk Clauses, Extracted Obligations, Prioritized Action Items.",
		"",
		"Document:",
		payloadText,
	].join("\n");
}

const FIREBASE_APP_NAME = "localshield-hybrid-runtime";

let cachedConfigSignature = "";
let cachedApp: FirebaseApp | null = null;

async function getOrCreateFirebaseApp(
	config: FirebaseByokConfig,
): Promise<FirebaseApp> {
	const signature = `${config.projectId}|${config.appId}|${config.apiKey.slice(-6)}`;
	if (cachedApp && cachedConfigSignature === signature) {
		return cachedApp;
	}

	const existing = getApps().find((a) => a.name === FIREBASE_APP_NAME);
	if (existing) {
		await deleteApp(existing);
	}

	cachedApp = initializeApp(
		{
			apiKey: config.apiKey.trim(),
			projectId: config.projectId.trim(),
			appId: config.appId.trim(),
		},
		FIREBASE_APP_NAME,
	);
	cachedConfigSignature = signature;
	return cachedApp;
}

/**
 * Real Firebase AI Logic SDK invocation using firebase/app + firebase/ai:
 * getAI(app, { backend: new GoogleAIBackend() }) + getGenerativeModel(ai, hybridParams)
 */
async function invokeFirebaseAiLogicSdk(params: {
	hybridParams: HybridParams;
	prompt: string;
	config: FirebaseByokConfig;
}): Promise<{ text: string; inferenceSource?: InferenceSource }> {
	const app = await getOrCreateFirebaseApp(params.config);
	const ai = getAI(app, { backend: new GoogleAIBackend() });
	const model: GenerativeModel = getGenerativeModel(ai, params.hybridParams);
	const result = await model.generateContent(params.prompt);
	const text = result.response.text();
	return {
		text,
		inferenceSource: result.response.inferenceSource,
	};
}

export async function executeHybridInference(
	request: HybridExecutionRequest,
): Promise<HybridExecutionResult> {
	const startedAt =
		typeof performance !== "undefined" ? performance.now() : Date.now();

	const scan = scanAndRedactPii(request.documentText);
	const onDeviceAvailability =
		request.onDeviceAvailability ?? (await detectOnDeviceCapability()).status;

	const liveFirebaseReady = hasValidFirebaseConfig(request.firebaseConfig);
	const effectiveOffline =
		request.offlineMode ||
		(typeof navigator !== "undefined" && navigator.onLine === false);

	const decision = planHybridRoute({
		scan,
		userMode: request.userMode,
		offlineMode: effectiveOffline,
		allowRedactedCloud: request.allowRedactedCloud,
		hasLiveFirebaseConfig: liveFirebaseReady,
		onDeviceAvailability,
	});

	// Security invariant enforcement: if cloud is possible, guarantee zero raw PII in payload
	if (
		decision.sdkInferenceMode !== InferenceMode.ONLY_ON_DEVICE &&
		scan.hasRawPii
	) {
		const clean = assertZeroRawPiiInPayload(decision.payloadText, scan);
		if (!clean) {
			decision.payloadText = scan.redactedText;
			decision.redactionRequired = true;
		}
	}

	const hybridParams = buildHybridParams(decision, request.firebaseConfig);
	const prompt = buildPrompt(
		decision.payloadText,
		request.instruction,
		scan.domain,
	);

	// Always compute structured deterministic insights locally (0 network calls, powers cards & fallback)
	const structuredAnalysis = runLocalDeterministicAnalysis(
		decision.payloadText,
		scan,
		request.instruction,
	);

	let provenance: ProvenanceBadge = "LOCAL_DETERMINISTIC_OFFLINE";
	let markdownOutput = structuredAnalysis.formattedMarkdown;
	let sdkNote = "";

	const canAttemptLiveSdk =
		Boolean(request.sdkRunner) ||
		(liveFirebaseReady &&
			(!effectiveOffline || onDeviceAvailability === "available")) ||
		(onDeviceAvailability === "available" &&
			(decision.sdkInferenceMode === InferenceMode.ONLY_ON_DEVICE ||
				decision.sdkInferenceMode === InferenceMode.PREFER_ON_DEVICE));

	if (canAttemptLiveSdk) {
		try {
			const sdkConfig: FirebaseByokConfig = liveFirebaseReady
				? request.firebaseConfig!
				: {
						apiKey: "AIzaLocalOnDeviceOnlyPlaceholder00000000",
						projectId: "localshield-on-device",
						appId: "1:000000000000:web:localshieldnano",
						modelName: "gemini-2.5-flash",
					};

			// Safety guard: if no live Firebase config exists, force ONLY_ON_DEVICE so SDK never makes a cloud request with a placeholder key
			const safeHybridParams: HybridParams = liveFirebaseReady
				? hybridParams
				: { ...hybridParams, mode: InferenceMode.ONLY_ON_DEVICE };

			const sdkResponse = request.sdkRunner
				? await request.sdkRunner({
						hybridParams: safeHybridParams,
						prompt,
						config: liveFirebaseReady ? request.firebaseConfig! : null,
					})
				: await invokeFirebaseAiLogicSdk({
						hybridParams: safeHybridParams,
						prompt,
						config: sdkConfig,
					});

			if (sdkResponse.text && sdkResponse.text.trim().length > 0) {
				markdownOutput = sdkResponse.text.trim();
				if (sdkResponse.inferenceSource === InferenceSource.IN_CLOUD) {
					provenance = "FIREBASE_CLOUD_GEMINI";
					sdkNote = `Executed live via Firebase AI Logic SDK (${safeHybridParams.mode}) on ${sdkConfig.modelName || "gemini-2.5-flash"} with ${scan.directPiiCount} PII entities redacted locally before dispatch.`;
				} else {
					provenance = "FIREBASE_ON_DEVICE_NANO";
					sdkNote = `Executed live on-device via Firebase AI Logic SDK (${safeHybridParams.mode}) using Chrome Built-in Gemini Nano.`;
				}
			} else {
				sdkNote =
					"Firebase AI Logic returned an empty response; served deterministic local analysis with honest fallback badge.";
			}
		} catch (err) {
			const errMessage = err instanceof Error ? err.message : String(err);
			provenance = "LOCAL_DETERMINISTIC_OFFLINE";
			sdkNote = `Firebase AI Logic SDK attempted (${hybridParams.mode}) and fell back cleanly to Local Deterministic Engine: ${errMessage}`;
		}
	} else {
		provenance = "LOCAL_DETERMINISTIC_OFFLINE";
		if (effectiveOffline) {
			sdkNote =
				"Airplane / Offline Mode active — zero network requests issued. Local Deterministic Engine executed strictly on-device.";
		} else if (!liveFirebaseReady) {
			sdkNote =
				"Chrome Gemini Nano unavailable and no Firebase BYOK credentials entered — Local Deterministic Engine executed strictly on-device. Add a RAM-only Firebase config to enable live Gemini Cloud (redacted).";
		} else {
			sdkNote = "Executed via Local Deterministic Engine on-device.";
		}
	}

	const endedAt =
		typeof performance !== "undefined" ? performance.now() : Date.now();
	const latencyMs = Math.max(1, Math.round(endedAt - startedAt));
	const inputTokens = estimateTokenCount(decision.payloadText);
	const outputTokens = estimateTokenCount(markdownOutput);

	const telemetry: TelemetryEvent = {
		id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
		timestamp: new Date().toISOString(),
		provenance,
		sdkInferenceMode: hybridParams.mode,
		latencyMs,
		routingReason: decision.reason,
		piiTokensKeptLocal: scan.estimatedLocalTokensProtected,
		rawPiiSentToCloud: 0,
		estimatedInputTokens: inputTokens,
		estimatedCloudCostSavedUsd: estimateCloudCostSavedUsd(
			provenance,
			inputTokens,
			outputTokens,
		),
		offlineActive: effectiveOffline,
		redactionApplied: decision.redactionRequired && scan.hasRawPii,
	};

	return {
		scan,
		decision,
		provenance,
		markdownOutput,
		structuredAnalysis,
		telemetry,
		sdkNote,
		hybridParamsSnapshot: hybridParams,
	};
}
