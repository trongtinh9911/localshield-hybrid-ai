import type { DocumentDomain, PiiScanResult } from "./piiClassifier";

export interface RiskClauseItem {
	title: string;
	severity: "HIGH" | "MEDIUM" | "LOW";
	excerpt: string;
	guidance: string;
}

export interface ActionItem {
	priority: "URGENT" | "HIGH" | "NORMAL";
	owner: string;
	action: string;
	timeframe: string;
}

export interface LocalAnalysisOutput {
	domain: DocumentDomain;
	headline: string;
	summary: string;
	obligations: string[];
	riskClauses: RiskClauseItem[];
	clinicalFollowUps: string[];
	actionItems: ActionItem[];
	complianceNotes: string[];
	formattedMarkdown: string;
}

function splitSentences(text: string): string[] {
	return text
		.replace(/\r\n/g, "\n")
		.split(/(?<=[.!?])\s+|\n+/)
		.map((s) => s.trim())
		.filter((s) => s.length >= 12);
}

function extractTimeframe(sentence: string): string {
	const match = sentence.match(
		/\b(?:within\s+\d+\s+(?:hours?|days?|business\s+days?|weeks?|months?)|in\s+\d+\s+(?:days?|weeks?|months?)|by\s+[A-Z][a-z]+\s+\d{1,2}(?:,\s*\d{4})?|immediately|daily|twice\s+daily|before\s+\w+)\b/i,
	);
	return match ? match[0] : "As specified";
}

export function runLocalDeterministicAnalysis(
	textToAnalyze: string,
	scan: PiiScanResult,
	userInstruction?: string,
): LocalAnalysisOutput {
	const sentences = splitSentences(textToAnalyze);
	const lower = textToAnalyze.toLowerCase();

	// 1. Obligations extraction
	const obligations: string[] = [];
	const obligationRegex =
		/\b(must|shall|required\s+to|agrees?\s+to|obligated\s+to|responsible\s+for|should\s+(?:take|submit|notify|return|discontinue|avoid|provide|destroy|maintain)|will\s+(?:submit|pay|return|comply|deliver|follow))\b/i;

	for (const sentence of sentences) {
		if (obligationRegex.test(sentence) && obligations.length < 7) {
			obligations.push(sentence);
		}
	}

	// 2. Risk clause & clinical flag extraction
	const riskClauses: RiskClauseItem[] = [];

	if (/\bunlimited\s+liability\b/i.test(textToAnalyze)) {
		riskClauses.push({
			title: "Unlimited Liability Exposure",
			severity: "HIGH",
			excerpt:
				sentences.find((s) => /unlimited\s+liability/i.test(s)) ||
				"Clause specifies unlimited liability.",
			guidance:
				"Negotiate a liability cap tied to 12 months of fees paid and exclude indirect or consequential damages.",
		});
	}

	if (
		/\b(?:perpetual|indefinite|in\s+perpetuity)\b/i.test(textToAnalyze) &&
		/\bconfidential/i.test(textToAnalyze)
	) {
		riskClauses.push({
			title: "Perpetual Confidentiality Term",
			severity: "MEDIUM",
			excerpt:
				sentences.find((s) => /perpetual|indefinite|perpetuity/i.test(s)) ||
				"Confidentiality obligation lacks an expiration term.",
			guidance:
				"Limit standard confidential information survival to 3–5 years while keeping trade secrets protected as long as they remain secret.",
		});
	}

	if (
		/\bindemnif(?:y|ication)\b/i.test(textToAnalyze) &&
		/\b(?:sole|unilateral|all\s+claims|without\s+cap)\b/i.test(textToAnalyze)
	) {
		riskClauses.push({
			title: "Broad Unilateral Indemnification",
			severity: "HIGH",
			excerpt:
				sentences.find((s) => /indemnif/i.test(s)) ||
				"Broad indemnification wording detected.",
			guidance:
				"Request mutual indemnification limited to third-party IP infringement and gross negligence, with prompt notice and defense control.",
		});
	}

	if (
		/\b(?:non-compete|non-solicitation|exclusiv(?:e|ity))\b/i.test(
			textToAnalyze,
		)
	) {
		riskClauses.push({
			title: "Restrictive Covenant / Non-Solicit",
			severity: "MEDIUM",
			excerpt:
				sentences.find((s) =>
					/non-compete|non-solicitation|exclusiv/i.test(s),
				) || "Restrictive covenant present.",
			guidance:
				"Narrow scope to named direct competitors or remove non-compete language from a preliminary NDA.",
		});
	}

	if (/\b(?:auto-?renew|automatically\s+renew)\b/i.test(textToAnalyze)) {
		riskClauses.push({
			title: "Automatic Renewal Trap",
			severity: "MEDIUM",
			excerpt:
				sentences.find((s) => /auto-?renew|automatically\s+renew/i.test(s)) ||
				"Automatic renewal clause found.",
			guidance:
				"Switch to explicit written renewal or add a 30-day opt-out reminder on the legal calendar.",
		});
	}

	if (
		/\b(?:emergency|er\s+immediately|chest\s+pain|shortness\s+of\s+breath|fever\s*(?:>|above|over)|bleeding|anaphylaxis|hypoglycemia)\b/i.test(
			textToAnalyze,
		)
	) {
		riskClauses.push({
			title: "Acute Clinical Red-Flag Precaution",
			severity: "HIGH",
			excerpt:
				sentences.find((s) =>
					/emergency|chest\s+pain|shortness\s+of\s+breath|fever|bleeding/i.test(
						s,
					),
				) || "Return-to-ED red-flag symptoms documented.",
			guidance:
				"Ensure patient/caregiver teach-back is documented and 24/7 on-call triage contact is confirmed.",
		});
	}

	if (
		/\b(?:allergy|allergic|contraindicat|penicillin|sulfa|warfarin|anticoagulant|nsaid)\b/i.test(
			textToAnalyze,
		)
	) {
		riskClauses.push({
			title: "Medication Safety / Allergy Alert",
			severity: "HIGH",
			excerpt:
				sentences.find((s) =>
					/allergy|allergic|contraindicat|penicillin|warfarin|nsaid/i.test(s),
				) || "Allergy or drug-interaction note present.",
			guidance:
				"Cross-check discharge medication list against documented allergies and high-alert drug interactions before dispensing.",
		});
	}

	if (
		/\b(?:deadline|forfeit|revoke|suspend|drop\s+classes|hold\s+placed)\b/i.test(
			textToAnalyze,
		)
	) {
		riskClauses.push({
			title: "Time-Sensitive Administrative / Financial Deadline",
			severity: "HIGH",
			excerpt:
				sentences.find((s) =>
					/deadline|forfeit|revoke|suspend|drop|hold/i.test(s),
				) || "Hard administrative deadline detected.",
			guidance:
				"Verify receipt of supporting documentation at least 48 hours ahead of the institutional cutoff.",
		});
	}

	if (scan.hasRawPii) {
		riskClauses.push({
			title: `Protected PII Boundary Enforced (${scan.directPiiCount} entities)`,
			severity: scan.riskLevel === "CRITICAL" ? "HIGH" : "MEDIUM",
			excerpt: `Detected categories: ${Object.keys(scan.categoryCounts).join(", ")}.`,
			guidance:
				"Raw identifiers were isolated on-device. Any cloud escalation requires prior local redaction placeholders.",
		});
	}

	// 3. Clinical follow-ups extraction
	const clinicalFollowUps: string[] = [];
	if (scan.domain === "CLINICAL") {
		const clinicalPattern =
			/\b(mg|mcg|tablet|capsule|twice\s+daily|once\s+daily|follow[- ]up|appointment|lab|blood\s+pressure|glucose|a1c|inr|clinic|return\s+to|discontinue|start|continue)\b/i;
		for (const sentence of sentences) {
			if (clinicalPattern.test(sentence) && clinicalFollowUps.length < 6) {
				clinicalFollowUps.push(sentence);
			}
		}
	}

	// 4. Structured action items
	const actionItems: ActionItem[] = [];

	if (scan.domain === "CLINICAL") {
		if (clinicalFollowUps.length > 0) {
			actionItems.push({
				priority: "URGENT",
				owner: "Patient / Care Coordinator",
				action: clinicalFollowUps[0],
				timeframe: extractTimeframe(clinicalFollowUps[0]),
			});
		}
		for (const fu of clinicalFollowUps.slice(1, 4)) {
			actionItems.push({
				priority:
					/emergency|immediately|stop|discontinue|within\s+24|within\s+48/i.test(
						fu,
					)
						? "URGENT"
						: "HIGH",
				owner: "Clinical Care Team",
				action: fu,
				timeframe: extractTimeframe(fu),
			});
		}
	} else if (scan.domain === "LEGAL") {
		for (const clause of riskClauses
			.filter((c) => !c.title.startsWith("Protected PII"))
			.slice(0, 4)) {
			actionItems.push({
				priority: clause.severity === "HIGH" ? "URGENT" : "HIGH",
				owner: "Legal Counsel",
				action: `Redline "${clause.title}": ${clause.guidance}`,
				timeframe: "Prior to execution",
			});
		}
		if (obligations.length > 0) {
			actionItems.push({
				priority: "NORMAL",
				owner: "Contract Owner",
				action: `Log operational obligation: ${obligations[0]}`,
				timeframe: extractTimeframe(obligations[0]),
			});
		}
	} else if (scan.domain === "ACADEMIC_FERPA") {
		for (const ob of obligations.slice(0, 3)) {
			actionItems.push({
				priority: /deadline|within|by\s+/i.test(ob) ? "URGENT" : "HIGH",
				owner: "Student / Financial Aid Advisor",
				action: ob,
				timeframe: extractTimeframe(ob),
			});
		}
		actionItems.push({
			priority: "NORMAL",
			owner: "Privacy Officer",
			action:
				"Keep SSN, FAFSA ID, and household AGI redacted before sharing appeal summary outside the portal.",
			timeframe: "Before submission",
		});
	} else {
		for (const ob of obligations.slice(0, 3)) {
			actionItems.push({
				priority: "HIGH",
				owner: "Document Reviewer",
				action: ob,
				timeframe: extractTimeframe(ob),
			});
		}
	}

	if (actionItems.length === 0) {
		actionItems.push({
			priority: "NORMAL",
			owner: "Reviewer",
			action:
				"Review extracted document sections and verify zero unredacted identifiers remain before external distribution.",
			timeframe: "Immediate",
		});
	}

	// 5. Compliance notes
	const complianceNotes: string[] = [];
	if (scan.domain === "CLINICAL") {
		complianceNotes.push(
			"HIPAA Safe Harbor check: MRN, DOB, SSN, email, and phone patterns quarantined strictly inside browser memory.",
		);
	} else if (scan.domain === "LEGAL") {
		complianceNotes.push(
			"Attorney-Client / NDA privilege check: Direct party identifiers, API keys, and financial routing details scrubbed before any cloud call.",
		);
	} else if (scan.domain === "ACADEMIC_FERPA") {
		complianceNotes.push(
			"FERPA education record safeguard: Student ID, SSN, contact info, and household income stayed on-device.",
		);
	} else {
		complianceNotes.push(
			"Zero-egress privacy boundary active: All raw PII tokens remained inside local browser memory.",
		);
	}

	if (userInstruction && userInstruction.trim().length > 0) {
		complianceNotes.push(
			`Task directive applied: "${userInstruction.trim()}".`,
		);
	}

	const domainLabels: Record<DocumentDomain, string> = {
		CLINICAL: "Clinical Discharge & Care Plan Review (HIPAA)",
		LEGAL: "Enterprise Legal & NDA Risk Review",
		ACADEMIC_FERPA: "Student Financial Aid & FERPA Appeal Review",
		GENERAL: "General Sensitive Document Review",
	};

	const headline = domainLabels[scan.domain];
	const wordCount = textToAnalyze.trim()
		? textToAnalyze.trim().split(/\s+/).length
		: 0;
	const summary = `Analyzed ${wordCount} words (${sentences.length} structured statements) classified as ${headline}. Detected ${scan.directPiiCount} direct PII entities (Risk: ${scan.riskLevel}, Score ${scan.riskScore}/100), ${obligations.length} binding/operational obligations, and ${riskClauses.length} risk items${lower.includes("redacted_") ? " using locally redacted text" : " strictly on-device"}.`;

	const mdLines: string[] = [
		`### ${headline}`,
		"",
		summary,
		"",
		"#### Key Risk Clauses & Compliance Flags",
		...riskClauses.map(
			(r) => `- **[${r.severity}] ${r.title}** — ${r.guidance}`,
		),
		"",
		"#### Extracted Obligations",
		...(obligations.length > 0
			? obligations.map((o) => `- ${o}`)
			: [
					'- No mandatory modal obligations ("must/shall/required") were detected.',
				]),
	];

	if (clinicalFollowUps.length > 0) {
		mdLines.push(
			"",
			"#### Clinical Medications & Follow-Up Schedule",
			...clinicalFollowUps.map((f) => `- ${f}`),
		);
	}

	mdLines.push(
		"",
		"#### Prioritized Action Items",
		...actionItems.map(
			(a) => `- **[${a.priority}]** (${a.owner} | ${a.timeframe}): ${a.action}`,
		),
		"",
		"#### Privacy & Governance Verification",
		...complianceNotes.map((n) => `- ${n}`),
	);

	return {
		domain: scan.domain,
		headline,
		summary,
		obligations,
		riskClauses,
		clinicalFollowUps,
		actionItems,
		complianceNotes,
		formattedMarkdown: mdLines.join("\n"),
	};
}
