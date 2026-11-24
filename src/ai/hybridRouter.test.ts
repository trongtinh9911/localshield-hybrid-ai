import {
	GoogleAIBackend,
	getAI,
	getGenerativeModel,
	InferenceMode,
	InferenceSource,
} from "firebase/ai";
import { describe, expect, it, vi } from "vitest";
import { DOCUMENT_PRESETS } from "../data/presets";
import { scanAndRedactPii } from "../engine/piiClassifier";
import {
	assertZeroRawPiiInPayload,
	buildHybridParams,
	executeHybridInference,
	type FirebaseByokConfig,
	hasValidFirebaseConfig,
	planHybridRoute,
	type UserHybridMode,
} from "./hybridRouter";

const SAMPLE_BYOK: FirebaseByokConfig = {
	apiKey: "AIzaSyDemoValidTestKey1234567890",
	projectId: "localshield-demo-proj",
	appId: "1:9988776655:web:abcdef123456",
	modelName: "gemini-2.5-flash",
};

describe("hybridRouter — Firebase AI Logic SDK integration & privacy invariants", () => {
	it("exposes real Firebase AI Logic SDK exports at runtime", () => {
		expect(typeof getAI).toBe("function");
		expect(typeof getGenerativeModel).toBe("function");
		expect(new GoogleAIBackend()).toBeInstanceOf(GoogleAIBackend);
		expect(InferenceMode.PREFER_ON_DEVICE).toBe("prefer_on_device");
		expect(InferenceMode.ONLY_ON_DEVICE).toBe("only_on_device");
		expect(InferenceMode.PREFER_IN_CLOUD).toBe("prefer_in_cloud");
		expect(InferenceMode.ONLY_IN_CLOUD).toBe("only_in_cloud");
	});

	it("forces ONLY_ON_DEVICE for raw PII in AUTO_PRIVACY when cloud escalation is disabled or unconfigured", () => {
		const scan = scanAndRedactPii(DOCUMENT_PRESETS[0].content);
		const decision = planHybridRoute({
			scan,
			userMode: "AUTO_PRIVACY",
			offlineMode: false,
			allowRedactedCloud: false,
			hasLiveFirebaseConfig: true,
			onDeviceAvailability: "unavailable",
		});

		expect(decision.sdkInferenceMode).toBe(InferenceMode.ONLY_ON_DEVICE);
		expect(decision.allowCloudFallback).toBe(false);
		expect(decision.rawPiiSentToCloud).toBe(0);
	});

	it("NEVER leaks raw PII to cloud across ALL 5 hybrid modes", () => {
		const scan = scanAndRedactPii(DOCUMENT_PRESETS[0].content);
		const allModes: UserHybridMode[] = [
			"AUTO_PRIVACY",
			"PREFER_ON_DEVICE",
			"ONLY_ON_DEVICE",
			"PREFER_IN_CLOUD",
			"ONLY_IN_CLOUD",
		];

		for (const mode of allModes) {
			const decision = planHybridRoute({
				scan,
				userMode: mode,
				offlineMode: false,
				allowRedactedCloud: true,
				hasLiveFirebaseConfig: true,
				onDeviceAvailability: "unavailable",
			});

			expect(decision.rawPiiSentToCloud).toBe(0);
			if (decision.sdkInferenceMode !== InferenceMode.ONLY_ON_DEVICE) {
				expect(decision.redactionRequired).toBe(true);
				expect(assertZeroRawPiiInPayload(decision.payloadText, scan)).toBe(
					true,
				);
			}
		}
	});

	it("hard-overrides to ONLY_ON_DEVICE whenever Offline Mode is enabled", () => {
		const scan = scanAndRedactPii(DOCUMENT_PRESETS[1].content);
		const decision = planHybridRoute({
			scan,
			userMode: "ONLY_IN_CLOUD",
			offlineMode: true,
			allowRedactedCloud: true,
			hasLiveFirebaseConfig: true,
			onDeviceAvailability: "unavailable",
		});

		expect(decision.sdkInferenceMode).toBe(InferenceMode.ONLY_ON_DEVICE);
		expect(decision.allowCloudFallback).toBe(false);
		expect(decision.reason).toMatch(/Offline Mode/i);
	});

	it("maps PREFER_IN_CLOUD and ONLY_IN_CLOUD to exact Firebase InferenceMode values with redaction", () => {
		const scan = scanAndRedactPii(DOCUMENT_PRESETS[2].content);

		const preferCloud = planHybridRoute({
			scan,
			userMode: "PREFER_IN_CLOUD",
			offlineMode: false,
			allowRedactedCloud: true,
			hasLiveFirebaseConfig: true,
			onDeviceAvailability: "unavailable",
		});
		expect(preferCloud.sdkInferenceMode).toBe(InferenceMode.PREFER_IN_CLOUD);
		expect(preferCloud.redactionRequired).toBe(true);

		const onlyCloud = planHybridRoute({
			scan,
			userMode: "ONLY_IN_CLOUD",
			offlineMode: false,
			allowRedactedCloud: true,
			hasLiveFirebaseConfig: true,
			onDeviceAvailability: "unavailable",
		});
		expect(onlyCloud.sdkInferenceMode).toBe(InferenceMode.ONLY_IN_CLOUD);
		expect(onlyCloud.redactionRequired).toBe(true);
	});

	it("builds valid Firebase AI Logic HybridParams with onDeviceParams and inCloudParams", () => {
		const scan = scanAndRedactPii("No PII clean memo.");
		const decision = planHybridRoute({
			scan,
			userMode: "PREFER_ON_DEVICE",
			offlineMode: false,
			allowRedactedCloud: true,
			hasLiveFirebaseConfig: true,
			onDeviceAvailability: "available",
		});

		const params = buildHybridParams(decision, SAMPLE_BYOK);
		expect(params.mode).toBe(InferenceMode.PREFER_ON_DEVICE);
		expect(params.onDeviceParams?.createOptions?.temperature).toBe(0.2);
		expect(params.inCloudParams?.model).toBe("gemini-2.5-flash");
	});

	it("returns FIREBASE_ON_DEVICE_NANO provenance when Firebase SDK executes on-device", async () => {
		const sdkRunner = vi.fn().mockResolvedValue({
			text: "### On-Device Nano Summary\n- All clinical tokens kept local.",
			inferenceSource: InferenceSource.ON_DEVICE,
		});

		const res = await executeHybridInference({
			documentText: DOCUMENT_PRESETS[0].content,
			userMode: "AUTO_PRIVACY",
			offlineMode: false,
			allowRedactedCloud: true,
			firebaseConfig: SAMPLE_BYOK,
			onDeviceAvailability: "available",
			sdkRunner,
		});

		expect(sdkRunner).toHaveBeenCalledTimes(1);
		expect(res.provenance).toBe("FIREBASE_ON_DEVICE_NANO");
		expect(res.telemetry.rawPiiSentToCloud).toBe(0);
		expect(res.telemetry.estimatedCloudCostSavedUsd).toBeGreaterThan(0);
	});

	it("returns FIREBASE_CLOUD_GEMINI provenance and passes ONLY redacted prompt to cloud SDK", async () => {
		let capturedPrompt = "";
		const sdkRunner = vi.fn().mockImplementation(async ({ prompt }) => {
			capturedPrompt = prompt;
			return {
				text: "### Cloud Redacted Summary\n- Unlimited liability flagged.",
				inferenceSource: InferenceSource.IN_CLOUD,
			};
		});

		const res = await executeHybridInference({
			documentText: DOCUMENT_PRESETS[1].content,
			userMode: "PREFER_IN_CLOUD",
			offlineMode: false,
			allowRedactedCloud: true,
			firebaseConfig: SAMPLE_BYOK,
			onDeviceAvailability: "unavailable",
			sdkRunner,
		});

		expect(res.provenance).toBe("FIREBASE_CLOUD_GEMINI");
		expect(res.decision.sdkInferenceMode).toBe(InferenceMode.PREFER_IN_CLOUD);
		expect(capturedPrompt).not.toContain("DE89370400440532013000");
		expect(capturedPrompt).not.toContain(
			"sk-proj-9481aBcDeFgHiJkLmNoPqRsTuVwXyZ0123",
		);
		expect(capturedPrompt).toContain("[REDACTED_API_KEY_1]");
		expect(res.telemetry.estimatedCloudCostSavedUsd).toBe(0);
	});

	it("falls back honestly to LOCAL_DETERMINISTIC_OFFLINE when SDK throws an error", async () => {
		const sdkRunner = vi
			.fn()
			.mockRejectedValue(new Error("Simulated network timeout"));

		const res = await executeHybridInference({
			documentText: DOCUMENT_PRESETS[0].content,
			userMode: "PREFER_ON_DEVICE",
			offlineMode: false,
			allowRedactedCloud: true,
			firebaseConfig: SAMPLE_BYOK,
			onDeviceAvailability: "unavailable",
			sdkRunner,
		});

		expect(res.provenance).toBe("LOCAL_DETERMINISTIC_OFFLINE");
		expect(res.sdkNote).toContain("Simulated network timeout");
		expect(res.structuredAnalysis.clinicalFollowUps.length).toBeGreaterThan(0);
	});

	it("executes strictly offline with LOCAL_DETERMINISTIC_OFFLINE when no key and no Nano", async () => {
		const res = await executeHybridInference({
			documentText: DOCUMENT_PRESETS[2].content,
			userMode: "AUTO_PRIVACY",
			offlineMode: true,
			allowRedactedCloud: false,
			firebaseConfig: null,
			onDeviceAvailability: "unavailable",
		});

		expect(res.provenance).toBe("LOCAL_DETERMINISTIC_OFFLINE");
		expect(res.decision.sdkInferenceMode).toBe(InferenceMode.ONLY_ON_DEVICE);
		expect(res.telemetry.offlineActive).toBe(true);
		expect(res.telemetry.piiTokensKeptLocal).toBeGreaterThan(0);
	});

	it("validates Firebase BYOK config completeness accurately", () => {
		expect(hasValidFirebaseConfig(null)).toBe(false);
		expect(
			hasValidFirebaseConfig({ apiKey: "short", projectId: "a", appId: "b" }),
		).toBe(false);
		expect(hasValidFirebaseConfig(SAMPLE_BYOK)).toBe(true);
	});
});
