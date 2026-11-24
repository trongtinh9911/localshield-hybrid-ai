import {
	AlertTriangle,
	CheckCircle2,
	Cloud,
	Cpu,
	Download,
	FileJson,
	ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import type { HybridExecutionResult } from "../ai/hybridRouter";
import {
	buildAuditReceiptJson,
	buildAuditReceiptMarkdown,
	triggerFileDownload,
} from "../engine/auditExport";
import type { TelemetrySummary } from "../engine/telemetry";

interface AnalysisOutputPanelProps {
	result: HybridExecutionResult | null;
	telemetrySummary: TelemetrySummary;
}

export function AnalysisOutputPanel({
	result,
	telemetrySummary,
}: AnalysisOutputPanelProps) {
	const [activeTab, setActiveTab] = useState<"summary" | "risks" | "sdk">(
		"summary",
	);

	if (!result) {
		return (
			<section className="panel" aria-label="Hybrid AI Analysis Output">
				<div className="panel-header">
					<div className="panel-title-wrap">
						<ShieldCheck size={17} />
						<h2 className="panel-title">
							Hybrid AI Analysis &amp; Audit Receipt
						</h2>
					</div>
				</div>
				<div className="panel-body" style={{ color: "var(--text-muted)" }}>
					Select a clinical, legal, or FERPA preset (or paste your own text) and
					click <strong>Run Hybrid Analysis</strong> to execute Firebase AI
					Logic hybrid routing.
				</div>
			</section>
		);
	}

	const provenanceMeta = {
		FIREBASE_ON_DEVICE_NANO: {
			label: "FIREBASE_ON_DEVICE_NANO",
			className: "pill pill-mono pill-shield",
			icon: <Cpu size={13} />,
		},
		FIREBASE_CLOUD_GEMINI: {
			label: "FIREBASE_CLOUD_GEMINI",
			className: "pill pill-mono pill-cloud",
			icon: <Cloud size={13} />,
		},
		LOCAL_DETERMINISTIC_OFFLINE: {
			label: "LOCAL_DETERMINISTIC_OFFLINE",
			className: "pill pill-mono pill-warn",
			icon: <ShieldCheck size={13} />,
		},
	}[result.provenance];

	const handleExportMd = () => {
		const md = buildAuditReceiptMarkdown(result, telemetrySummary);
		triggerFileDownload(
			`localshield-audit-${Date.now()}.md`,
			md,
			"text/markdown;charset=utf-8",
		);
	};

	const handleExportJson = () => {
		const payload = buildAuditReceiptJson(result, telemetrySummary);
		triggerFileDownload(
			`localshield-audit-${Date.now()}.json`,
			JSON.stringify(payload, null, 2),
			"application/json;charset=utf-8",
		);
	};

	return (
		<section className="panel" aria-label="Hybrid AI Analysis Output">
			<div className="panel-header">
				<div className="panel-title-wrap">
					<CheckCircle2 size={17} style={{ color: "var(--accent-shield)" }} />
					<h2 className="panel-title">
						Hybrid AI Analysis &amp; Audit Receipt
					</h2>
				</div>

				<div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
					<button type="button" className="btn btn-sm" onClick={handleExportMd}>
						<Download size={13} />
						Export .md
					</button>
					<button
						type="button"
						className="btn btn-sm"
						onClick={handleExportJson}
					>
						<FileJson size={13} />
						Export .json
					</button>
				</div>
			</div>

			<div
				style={{
					padding: "12px 18px",
					borderBottom: "1px solid var(--border)",
					background: "var(--bg-inset)",
					display: "flex",
					flexDirection: "column",
					gap: "8px",
				}}
			>
				<div
					style={{
						display: "flex",
						gap: "8px",
						flexWrap: "wrap",
						alignItems: "center",
					}}
				>
					<span className={provenanceMeta.className}>
						{provenanceMeta.icon}
						{provenanceMeta.label}
					</span>
					<span className="pill pill-mono">
						SDK: {result.decision.sdkInferenceMode}
					</span>
					<span className="pill pill-mono pill-shield">
						Raw PII Sent to Cloud: {result.decision.rawPiiSentToCloud}
					</span>
					<span className="pill pill-mono">
						{result.telemetry.latencyMs} ms
					</span>
				</div>
				<div style={{ fontSize: "12.5px", color: "var(--text-secondary)" }}>
					<strong>Routing Decision:</strong> {result.decision.reason}
				</div>
				<div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
					{result.sdkNote}
				</div>
			</div>

			<div className="tab-row" role="tablist">
				<button
					type="button"
					role="tab"
					aria-selected={activeTab === "summary"}
					className={`tab-btn ${activeTab === "summary" ? "active" : ""}`}
					onClick={() => setActiveTab("summary")}
				>
					Summary &amp; Action Plan
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={activeTab === "risks"}
					className={`tab-btn ${activeTab === "risks" ? "active" : ""}`}
					onClick={() => setActiveTab("risks")}
				>
					Risks &amp; Obligations (
					{result.structuredAnalysis.riskClauses.length})
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={activeTab === "sdk"}
					className={`tab-btn ${activeTab === "sdk" ? "active" : ""}`}
					onClick={() => setActiveTab("sdk")}
				>
					Markdown &amp; Firebase SDK Params
				</button>
			</div>

			<div className="panel-body">
				{activeTab === "summary" && (
					<div className="list-stack">
						<div>
							<h3
								style={{
									margin: "0 0 6px",
									fontFamily: "var(--font-serif)",
									fontSize: "18px",
								}}
							>
								{result.structuredAnalysis.headline}
							</h3>
							<p style={{ margin: 0, color: "var(--text-secondary)" }}>
								{result.structuredAnalysis.summary}
							</p>
						</div>

						{result.structuredAnalysis.clinicalFollowUps.length > 0 && (
							<div>
								<span className="field-label">
									Clinical Medications &amp; Follow-Up Directives
								</span>
								<div className="list-stack">
									{result.structuredAnalysis.clinicalFollowUps.map(
										(item, idx) => (
											<div key={idx} className="finding-card">
												<p className="finding-body">{item}</p>
											</div>
										),
									)}
								</div>
							</div>
						)}

						<div>
							<span className="field-label">Prioritized Action Items</span>
							<div className="list-stack">
								{result.structuredAnalysis.actionItems.map((item, idx) => (
									<div key={idx} className="finding-card">
										<div className="finding-head">
											<span className="finding-title">{item.owner}</span>
											<div style={{ display: "flex", gap: "6px" }}>
												<span className="pill pill-mono">{item.timeframe}</span>
												<span
													className={`pill pill-mono ${
														item.priority === "URGENT"
															? "pill-danger"
															: item.priority === "HIGH"
																? "pill-warn"
																: "pill-shield"
													}`}
												>
													{item.priority}
												</span>
											</div>
										</div>
										<p className="finding-body">{item.action}</p>
									</div>
								))}
							</div>
						</div>

						<div>
							<span className="field-label">
								Compliance &amp; Privacy Attestation
							</span>
							<ul
								style={{
									margin: "4px 0 0",
									paddingLeft: "18px",
									color: "var(--text-secondary)",
								}}
							>
								{result.structuredAnalysis.complianceNotes.map((note, idx) => (
									<li key={idx} style={{ marginBottom: "4px" }}>
										{note}
									</li>
								))}
							</ul>
						</div>
					</div>
				)}

				{activeTab === "risks" && (
					<div className="list-stack">
						<div>
							<span className="field-label">
								Detected Risk Clauses &amp; Flags
							</span>
							<div className="list-stack">
								{result.structuredAnalysis.riskClauses.map((clause, idx) => (
									<div key={idx} className="finding-card">
										<div className="finding-head">
											<span
												className="finding-title"
												style={{
													display: "inline-flex",
													alignItems: "center",
													gap: "6px",
												}}
											>
												<AlertTriangle size={14} />
												{clause.title}
											</span>
											<span
												className={`pill pill-mono ${
													clause.severity === "HIGH"
														? "pill-danger"
														: "pill-warn"
												}`}
											>
												{clause.severity}
											</span>
										</div>
										<p className="finding-body" style={{ marginBottom: "6px" }}>
											{clause.guidance}
										</p>
										<p
											style={{
												margin: 0,
												fontSize: "12px",
												fontFamily: "var(--font-mono)",
												color: "var(--text-muted)",
											}}
										>
											Excerpt: “{clause.excerpt}”
										</p>
									</div>
								))}
							</div>
						</div>

						<div>
							<span className="field-label">Extracted Obligations</span>
							{result.structuredAnalysis.obligations.length === 0 ? (
								<p style={{ margin: 0, color: "var(--text-muted)" }}>
									No explicit modal obligations detected.
								</p>
							) : (
								<ul
									style={{
										margin: "4px 0 0",
										paddingLeft: "18px",
										color: "var(--text-secondary)",
									}}
								>
									{result.structuredAnalysis.obligations.map((ob, idx) => (
										<li key={idx} style={{ marginBottom: "6px" }}>
											{ob}
										</li>
									))}
								</ul>
							)}
						</div>
					</div>
				)}

				{activeTab === "sdk" && (
					<div className="list-stack">
						<div>
							<span className="field-label">Model Markdown Output</span>
							<pre className="code-block">{result.markdownOutput}</pre>
						</div>
						<div>
							<span className="field-label">
								Firebase AI Logic SDK HybridParams Snapshot (firebase/ai)
							</span>
							<pre className="code-block">
								{JSON.stringify(result.hybridParamsSnapshot, null, 2)}
							</pre>
						</div>
					</div>
				)}
			</div>
		</section>
	);
}
