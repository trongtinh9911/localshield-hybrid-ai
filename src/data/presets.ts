export interface DocumentPreset {
	id: string;
	label: string;
	badge: string;
	domainTag: string;
	instruction: string;
	content: string;
}

export const DOCUMENT_PRESETS: DocumentPreset[] = [
	{
		id: "clinical-discharge",
		label: "Clinical Discharge Note",
		badge: "HIPAA PII",
		domainTag: "Clinical",
		instruction:
			"Summarize discharge medications, follow-up deadlines, and critical return precautions while keeping all patient identifiers strictly local.",
		content: `HIPAA PROTECTED — INPATIENT DISCHARGE SUMMARY
Patient Name: Elena Rostova
MRN: MRN-849201-CA
DOB: 04/18/1979
SSN: 412-88-3901
Contact Phone: (415) 555-0194
Patient Email: elena.rostova@example-health.org

Primary Diagnosis: Acute non-ST elevation myocardial infarction (NSTEMI), stabilized post-PCI; Type 2 Diabetes Mellitus.
Allergies: Penicillin (severe rash — anaphylaxis risk).

Discharge Medications & Instructions:
1. Patient must take Aspirin 81 mg orally once daily indefinitely and Clopidogrel 75 mg orally once daily for 12 months; do not discontinue without cardiology approval.
2. Start Atorvastatin 80 mg orally once nightly and Metoprolol Succinate 25 mg daily.
3. Avoid NSAIDs (ibuprofen, naproxen) due to bleeding and cardiovascular risk while on dual antiplatelet therapy.

Follow-Up Schedule:
- Patient must follow up with Dr. Marcus Vance (Interventional Cardiology Clinic) within 7 days of discharge for medication reconciliation and repeat lipid/CMP lab panel.
- Schedule primary care appointment within 14 days for HbA1c review.

Emergency Return Precautions:
- Return to the ER immediately if chest pain, shortness of breath, dizziness, or unusual bleeding occurs.`,
	},
	{
		id: "enterprise-nda",
		label: "SaaS Enterprise NDA",
		badge: "Legal Risk",
		domainTag: "Legal",
		instruction:
			"Identify high-risk liability, indemnification, and confidentiality traps and generate redline action items.",
		content: `CONFIDENTIAL — ATTORNEY-CLIENT PRIVILEGED DRAFT
MUTUAL NON-DISCLOSURE & EVALUATION AGREEMENT

Disclosing Party Contact: legal-ops@northstar-cloud.io | (212) 555-0148
Receiving Party Billing Reference: IBAN DE89370400440532013000
Sandbox Integration Credential (DO NOT DISTRIBUTE): sk-proj-9481aBcDeFgHiJkLmNoPqRsTuVwXyZ0123

Section 3. Confidentiality Survival.
Receiving Party agrees to hold all Confidential Information and PROPRIETARY SOURCE CODE in strict confidence in perpetuity without expiration, regardless of whether such information qualifies as a TRADE SECRET.

Section 6. Indemnification & Liability.
Receiving Party shall defend, indemnify, and hold harmless Disclosing Party against all claims without cap, and accepts UNLIMITED LIABILITY for any alleged unauthorized disclosure or system outage arising from evaluation testing.

Section 8. Restrictive Covenant & Renewal.
During the term and for 24 months thereafter, Receiving Party shall not solicit any customer or engage in any non-compete SaaS analytics offering. This agreement will automatically renew for successive 12-month periods unless written notice is delivered within 60 days prior to expiration.`,
	},
	{
		id: "ferpa-appeal",
		label: "Student Financial Aid Appeal",
		badge: "FERPA PII",
		domainTag: "Education",
		instruction:
			"Extract required submission steps, deadlines, and verify all FERPA student and family financial identifiers stay local.",
		content: `FERPA PROTECTED — SPECIAL CIRCUMSTANCES FINANCIAL AID APPEAL
Student Name: Marcus Chen
Student ID: STU-2026-77419
FAFSA ID: FAFSA-99301844
DOB: 09/22/2005
SSN: 523-41-8820
Student Email: m.chen26@pacificstate.edu
Mobile Phone: (617) 555-0182
Household AGI: $42,500.00
Tuition Balance: $9,840.00
Direct Deposit Routing Number: 021000021

Appeal Summary:
Following an unexpected parental medical leave in Q3, household income dropped 48% compared to the prior-year tax transcript.

Required Financial Aid Office Obligations:
- Student must submit signed 2025 W-2 statements, employer separation verification, and itemized medical billing receipts within 10 business days to prevent a registration hold placed on Spring enrollment.
- Failure to meet the December 4, 2026 appeal deadline will forfeit institutional grant reconsideration for the current semester.
- Financial Aid Advisor must issue a revised award letter within 14 days of receiving complete documentation.`,
	},
];
