import { describe, expect, it } from "vitest";
import { DOCUMENT_PRESETS } from "../data/presets";
import {
	detectDomain,
	restoreRedactedText,
	scanAndRedactPii,
} from "./piiClassifier";

describe("piiClassifier — deterministic PII scanning & reversible redaction", () => {
	it("detects SSN, email, and phone numbers and replaces them with indexed placeholders", () => {
		const text =
			"Contact Jane Doe at 412-88-3901, email jane.doe@clinic.org, phone (415) 555-0194.";
		const result = scanAndRedactPii(text);

		expect(result.hasRawPii).toBe(true);
		expect(result.categoryCounts.SSN).toBe(1);
		expect(result.categoryCounts.EMAIL).toBe(1);
		expect(result.categoryCounts.PHONE).toBe(1);
		expect(result.redactedText).toContain("[REDACTED_SSN_1]");
		expect(result.redactedText).toContain("[REDACTED_EMAIL_1]");
		expect(result.redactedText).toContain("[REDACTED_PHONE_1]");
		expect(result.redactedText).not.toContain("412-88-3901");
		expect(result.redactedText).not.toContain("jane.doe@clinic.org");
	});

	it("validates credit cards via Luhn checksum and ignores invalid card-like digit strings", () => {
		// 4532 0151 1283 0366 is Luhn valid; 4532 0151 1283 0367 is invalid
		const text =
			"Valid card: 4532-0151-1283-0366; invalid sequence: 4532-0151-1283-0367.";
		const result = scanAndRedactPii(text);

		expect(result.categoryCounts.CREDIT_CARD).toBe(1);
		expect(result.redactedText).toContain("[REDACTED_CREDIT_CARD_1]");
		expect(result.redactedText).toContain("4532-0151-1283-0367");
	});

	it("detects Patient MRN, DOB, API keys, IBAN, and household income", () => {
		const text = [
			"MRN: MRN-849201-CA",
			"DOB: 04/18/1979",
			"IBAN DE89370400440532013000",
			"Household AGI: $42,500.00",
			"Key: sk-proj-9481aBcDeFgHiJkLmNoPqRsTuVwXyZ0123",
		].join("\n");

		const result = scanAndRedactPii(text);

		expect(result.categoryCounts.PATIENT_MRN).toBe(1);
		expect(result.categoryCounts.DOB).toBe(1);
		expect(result.categoryCounts.BANK_IBAN).toBe(1);
		expect(result.categoryCounts.SALARY).toBe(1);
		expect(result.categoryCounts.API_KEY).toBe(1);
		expect(result.riskLevel).toBe("CRITICAL");
		expect(result.riskScore).toBe(100);
	});

	it("supports exact round-trip restoration via restoreRedactedText", () => {
		const original =
			"Patient MRN: MRN-112233-NY, SSN 523-41-8820, email test.patient@hospital.org.";
		const result = scanAndRedactPii(original);

		expect(result.redactedText).not.toBe(original);
		const restored = restoreRedactedText(
			result.redactedText,
			result.redactionMap,
		);
		expect(restored).toBe(original);
	});

	it("scores clean non-PII technical text as LOW risk with hasRawPii=false", () => {
		const clean =
			"Quarterly infrastructure review: latency remained under 45 milliseconds across all regions.";
		const result = scanAndRedactPii(clean);

		expect(result.hasRawPii).toBe(false);
		expect(result.directPiiCount).toBe(0);
		expect(result.riskLevel).toBe("LOW");
		expect(result.riskScore).toBe(0);
		expect(result.redactedText).toBe(clean);
	});

	it("detects confidential legal markers without mistaking them for direct PII", () => {
		const text =
			"CONFIDENTIAL and ATTORNEY-CLIENT PRIVILEGED memo regarding UNLIMITED LIABILITY.";
		const result = scanAndRedactPii(text);

		expect(result.hasRawPii).toBe(false);
		expect(result.clauseCount).toBe(3);
		expect(result.riskScore).toBeGreaterThanOrEqual(20);
		expect(result.riskLevel).toBe("MODERATE");
	});

	it("accurately classifies clinical, legal, academic FERPA, and general domains", () => {
		expect(detectDomain(DOCUMENT_PRESETS[0].content)).toBe("CLINICAL");
		expect(detectDomain(DOCUMENT_PRESETS[1].content)).toBe("LEGAL");
		expect(detectDomain(DOCUMENT_PRESETS[2].content)).toBe("ACADEMIC_FERPA");
		expect(detectDomain("Meeting notes for design system spacing.")).toBe(
			"GENERAL",
		);
	});

	it("redacts 100% of direct PII entities across all 3 built-in presets", () => {
		for (const preset of DOCUMENT_PRESETS) {
			const result = scanAndRedactPii(preset.content);
			expect(result.hasRawPii).toBe(true);
			expect(result.directPiiCount).toBeGreaterThanOrEqual(3);
			for (const match of result.matches.filter((m) => m.isDirectPii)) {
				expect(result.redactedText).not.toContain(match.original);
			}
		}
	});
});
