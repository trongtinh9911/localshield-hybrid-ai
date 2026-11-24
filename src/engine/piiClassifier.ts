export type PiiCategory =
	| "SSN"
	| "CREDIT_CARD"
	| "API_KEY"
	| "PATIENT_MRN"
	| "DOB"
	| "BANK_IBAN"
	| "SALARY"
	| "EMAIL"
	| "PHONE"
	| "CONFIDENTIAL_CLAUSE";

export type RiskLevel = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

export type DocumentDomain =
	| "CLINICAL"
	| "LEGAL"
	| "ACADEMIC_FERPA"
	| "GENERAL";

export interface PiiMatch {
	id: string;
	category: PiiCategory;
	label: string;
	original: string;
	placeholder: string;
	start: number;
	end: number;
	severity: "CRITICAL" | "HIGH" | "MEDIUM";
	isDirectPii: boolean;
}

export interface PiiScanResult {
	originalText: string;
	redactedText: string;
	matches: PiiMatch[];
	redactionMap: Record<string, string>;
	categoryCounts: Partial<Record<PiiCategory, number>>;
	riskScore: number;
	riskLevel: RiskLevel;
	hasRawPii: boolean;
	directPiiCount: number;
	clauseCount: number;
	domain: DocumentDomain;
	estimatedLocalTokensProtected: number;
}

interface PatternRule {
	category: PiiCategory;
	label: string;
	regex: RegExp;
	severity: "CRITICAL" | "HIGH" | "MEDIUM";
	weight: number;
	isDirectPii: boolean;
	priority: number;
	validator?: (match: string) => boolean;
}

function luhnCheck(raw: string): boolean {
	const digits = raw.replace(/\D/g, "");
	if (digits.length < 13 || digits.length > 19) return false;
	let sum = 0;
	let shouldDouble = false;
	for (let i = digits.length - 1; i >= 0; i--) {
		let digit = parseInt(digits[i], 10);
		if (shouldDouble) {
			digit *= 2;
			if (digit > 9) digit -= 9;
		}
		sum += digit;
		shouldDouble = !shouldDouble;
	}
	return sum % 10 === 0;
}

const PATTERN_RULES: PatternRule[] = [
	{
		category: "API_KEY",
		label: "API Key / Secret",
		regex:
			/\b(?:AIza[0-9A-Za-z_-]{35}|sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}|Bearer\s+[A-Za-z0-9._-]{24,})\b/g,
		severity: "CRITICAL",
		weight: 40,
		isDirectPii: true,
		priority: 100,
	},
	{
		category: "SSN",
		label: "Social Security Number",
		regex: /\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g,
		severity: "CRITICAL",
		weight: 38,
		isDirectPii: true,
		priority: 95,
	},
	{
		category: "CREDIT_CARD",
		label: "Payment Card",
		regex: /\b(?:\d[ -]*?){13,19}\b/g,
		severity: "CRITICAL",
		weight: 38,
		isDirectPii: true,
		priority: 92,
		validator: (m) => {
			const digits = m.replace(/\D/g, "");
			return digits.length >= 13 && digits.length <= 19 && luhnCheck(m);
		},
	},
	{
		category: "PATIENT_MRN",
		label: "Patient MRN / Student ID",
		regex:
			/\b(?:MRN|Medical\s+Record(?:\s+Number|#)?|Patient\s+ID|Student\s+ID|FAFSA\s+ID)\s*[:#-]?\s*[A-Z0-9-]{5,18}\b/gi,
		severity: "CRITICAL",
		weight: 32,
		isDirectPii: true,
		priority: 90,
	},
	{
		category: "BANK_IBAN",
		label: "Bank Account / IBAN",
		regex:
			/\b(?:[A-Z]{2}\d{2}[A-Z0-9]{11,30}|(?:IBAN|Routing(?:\s+#|(?:\s+Number))?|Account(?:\s+#|(?:\s+Number))?)\s*[:#-]?\s*[A-Z0-9-]{6,22})\b/gi,
		severity: "CRITICAL",
		weight: 32,
		isDirectPii: true,
		priority: 88,
		validator: (m) => /\d{4,}/.test(m),
	},
	{
		category: "DOB",
		label: "Date of Birth",
		regex:
			/\b(?:DOB|Date\s+of\s+Birth|Birthdate)\s*[:#-]?\s*(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})\b/gi,
		severity: "HIGH",
		weight: 22,
		isDirectPii: true,
		priority: 85,
	},
	{
		category: "EMAIL",
		label: "Email Address",
		regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
		severity: "HIGH",
		weight: 16,
		isDirectPii: true,
		priority: 80,
	},
	{
		category: "PHONE",
		label: "Phone Number",
		regex: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g,
		severity: "HIGH",
		weight: 16,
		isDirectPii: true,
		priority: 75,
	},
	{
		category: "SALARY",
		label: "Compensation / Income Figure",
		regex:
			/\b(?:annual\s+(?:salary|income)|household\s+AGI|gross\s+income|base\s+compensation|tuition\s+balance|bank\s+balance)\s*(?:of|:|is|=)?\s*\$[\d,]+(?:\.\d{2})?\b/gi,
		severity: "MEDIUM",
		weight: 14,
		isDirectPii: true,
		priority: 70,
	},
	{
		category: "CONFIDENTIAL_CLAUSE",
		label: "Sensitive / Privileged Marker",
		regex:
			/\b(?:CONFIDENTIAL|ATTORNEY-CLIENT\s+PRIVILEGED|TRADE\s+SECRET|NON-DISCLOSURE|UNLIMITED\s+LIABILITY|HIPAA\s+PROTECTED|FERPA\s+PROTECTED|STRICTLY\s+PRIVATE|PROPRIETARY\s+SOURCE\s+CODE)\b/gi,
		severity: "MEDIUM",
		weight: 12,
		isDirectPii: false,
		priority: 50,
	},
];

export function detectDomain(text: string): DocumentDomain {
	const lower = text.toLowerCase();
	const clinicalScore = (
		lower.match(
			/\b(discharge|patient|mrn|diagnosis|mg|medication|follow-up|follow up|hipaa|vitals|blood pressure|clinic|physician|hospital|prescription|dosage|allergies)\b/g,
		) || []
	).length;
	const legalScore = (
		lower.match(
			/\b(nda|non-disclosure|indemnif|liability|governing law|confidential information|arbitration|intellectual property|breach|termination|disclosing party|receiving party|covenant)\b/g,
		) || []
	).length;
	const academicScore = (
		lower.match(
			/\b(ferpa|fafsa|financial aid|tuition|scholarship|academic|student id|registrar|appeal|expected family contribution|agi|semester|gpa)\b/g,
		) || []
	).length;

	const maxScore = Math.max(clinicalScore, legalScore, academicScore);
	if (maxScore < 2) return "GENERAL";
	if (clinicalScore === maxScore) return "CLINICAL";
	if (legalScore === maxScore) return "LEGAL";
	return "ACADEMIC_FERPA";
}

interface CandidateSpan {
	rule: PatternRule;
	original: string;
	start: number;
	end: number;
}

export function scanAndRedactPii(text: string): PiiScanResult {
	const candidates: CandidateSpan[] = [];

	for (const rule of PATTERN_RULES) {
		rule.regex.lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = rule.regex.exec(text)) !== null) {
			const value = match[0];
			if (rule.validator && !rule.validator(value)) {
				continue;
			}
			candidates.push({
				rule,
				original: value,
				start: match.index,
				end: match.index + value.length,
			});
		}
	}

	// Sort by start offset, then higher priority, then longer match
	candidates.sort((a, b) => {
		if (a.start !== b.start) return a.start - b.start;
		if (a.rule.priority !== b.rule.priority)
			return b.rule.priority - a.rule.priority;
		return b.original.length - a.original.length;
	});

	// Resolve overlaps greedily
	const accepted: CandidateSpan[] = [];
	let cursor = -1;
	for (const span of candidates) {
		if (span.start >= cursor) {
			accepted.push(span);
			cursor = span.end;
		}
	}

	const categoryCounts: Partial<Record<PiiCategory, number>> = {};
	const redactionMap: Record<string, string> = {};
	const matches: PiiMatch[] = [];
	const redactedParts: string[] = [];
	let lastIdx = 0;
	let rawScore = 0;

	for (const span of accepted) {
		const nextNum = (categoryCounts[span.rule.category] ?? 0) + 1;
		categoryCounts[span.rule.category] = nextNum;

		const placeholder = span.rule.isDirectPii
			? `[REDACTED_${span.rule.category}_${nextNum}]`
			: span.original;

		if (span.rule.isDirectPii) {
			redactionMap[placeholder] = span.original;
			redactedParts.push(text.slice(lastIdx, span.start), placeholder);
			lastIdx = span.end;
		}

		matches.push({
			id: `${span.rule.category}-${nextNum}`,
			category: span.rule.category,
			label: span.rule.label,
			original: span.original,
			placeholder,
			start: span.start,
			end: span.end,
			severity: span.rule.severity,
			isDirectPii: span.rule.isDirectPii,
		});

		rawScore += span.rule.weight;
	}

	redactedParts.push(text.slice(lastIdx));
	const redactedText = redactedParts.join("");

	const riskScore = Math.min(100, rawScore);
	const riskLevel: RiskLevel =
		riskScore >= 75
			? "CRITICAL"
			: riskScore >= 45
				? "HIGH"
				: riskScore >= 20
					? "MODERATE"
					: "LOW";

	const directPiiMatches = matches.filter((m) => m.isDirectPii);
	const directPiiCount = directPiiMatches.length;
	const clauseCount = matches.length - directPiiCount;

	// Approximate token count for protected text (~4 chars/token)
	const protectedChars = directPiiMatches.reduce(
		(acc, m) => acc + m.original.length,
		0,
	);
	const estimatedLocalTokensProtected =
		directPiiCount > 0
			? Math.max(directPiiCount * 3, Math.ceil(protectedChars / 4))
			: 0;

	return {
		originalText: text,
		redactedText,
		matches,
		redactionMap,
		categoryCounts,
		riskScore,
		riskLevel,
		hasRawPii: directPiiCount > 0,
		directPiiCount,
		clauseCount,
		domain: detectDomain(text),
		estimatedLocalTokensProtected,
	};
}

export function restoreRedactedText(
	text: string,
	redactionMap: Record<string, string>,
): string {
	let restored = text;
	for (const [placeholder, original] of Object.entries(redactionMap)) {
		restored = restored.split(placeholder).join(original);
	}
	return restored;
}
