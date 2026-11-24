import { Eye, EyeOff, ShieldAlert } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { PiiScanResult } from "../engine/piiClassifier";

interface PiiDiffInspectorProps {
	scan: PiiScanResult;
}

function renderHighlightedOriginal(scan: PiiScanResult): ReactNode[] {
	const directMatches = scan.matches.filter((m) => m.isDirectPii);
	if (directMatches.length === 0) {
		return [scan.originalText];
	}

	const nodes: ReactNode[] = [];
	let cursor = 0;
	for (const m of directMatches) {
		if (m.start > cursor) {
			nodes.push(scan.originalText.slice(cursor, m.start));
		}
		nodes.push(
			<mark
				key={m.id}
				className="token-raw"
				title={`${m.label} (${m.severity})`}
			>
				{m.original}
			</mark>,
		);
		cursor = m.end;
	}
	if (cursor < scan.originalText.length) {
		nodes.push(scan.originalText.slice(cursor));
	}
	return nodes;
}

function renderHighlightedRedacted(redactedText: string): ReactNode[] {
	const parts = redactedText.split(/(\[REDACTED_[A-Z_]+_\d+\])/g);
	return parts.map((part, idx) =>
		/^\[REDACTED_[A-Z_]+_\d+\]$/.test(part) ? (
			<span key={`${part}-${idx}`} className="token-redacted">
				{part}
			</span>
		) : (
			<span key={`txt-${idx}`}>{part}</span>
		),
	);
}

export function PiiDiffInspector({ scan }: PiiDiffInspectorProps) {
	const [revealTableOriginals, setRevealTableOriginals] = useState(false);

	const riskPillClass =
		scan.riskLevel === "CRITICAL"
			? "pill pill-danger"
			: scan.riskLevel === "HIGH"
				? "pill pill-warn"
				: scan.riskLevel === "MODERATE"
					? "pill pill-cloud"
					: "pill pill-shield";

	const directMatches = scan.matches.filter((m) => m.isDirectPii);

	return (
		<section
			className="panel"
			aria-label="Live PII Diff and Redaction Inspector"
		>
			<div className="panel-header">
				<div className="panel-title-wrap">
					<ShieldAlert size={17} />
					<h2 className="panel-title">
						Live PII Diff &amp; Local Redaction Inspector
					</h2>
				</div>
				<span className={riskPillClass}>
					Risk: {scan.riskLevel} ({scan.riskScore}/100)
				</span>
			</div>

			<div className="panel-body">
				<div className="risk-banner">
					<div>
						<div className="metric-label">Detected PII Entities</div>
						<div
							style={{
								display: "flex",
								gap: "6px",
								flexWrap: "wrap",
								marginTop: "4px",
							}}
						>
							{Object.keys(scan.categoryCounts).length === 0 ? (
								<span className="pill pill-shield">
									No PII detected — safe for hybrid routing
								</span>
							) : (
								Object.entries(scan.categoryCounts).map(([cat, count]) => (
									<span key={cat} className="pill pill-mono">
										{cat}: {count}
									</span>
								))
							)}
						</div>
					</div>
					<div style={{ textAlign: "right" }}>
						<div className="metric-label">Risk Score</div>
						<div className="risk-score-num">{scan.riskScore}/100</div>
					</div>
				</div>

				<div className="diff-grid">
					<div className="diff-box">
						<div className="diff-box-header">
							<span>Raw Local Input (Stays in Browser)</span>
							<span style={{ color: "var(--accent-danger)" }}>
								{directMatches.length} raw hits
							</span>
						</div>
						<pre className="diff-pre">{renderHighlightedOriginal(scan)}</pre>
					</div>

					<div className="diff-box">
						<div className="diff-box-header">
							<span>Sanitized Redaction Payload</span>
							<span style={{ color: "var(--accent-shield)" }}>0 raw PII</span>
						</div>
						<pre className="diff-pre">
							{renderHighlightedRedacted(scan.redactedText)}
						</pre>
					</div>
				</div>

				{directMatches.length > 0 && (
					<div style={{ marginTop: "14px" }}>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								marginBottom: "6px",
							}}
						>
							<span className="field-label" style={{ margin: 0 }}>
								Reversible Local Redaction Vault ({directMatches.length} tokens)
							</span>
							<button
								type="button"
								className="btn btn-sm"
								onClick={() => setRevealTableOriginals((v) => !v)}
							>
								{revealTableOriginals ? (
									<EyeOff size={13} />
								) : (
									<Eye size={13} />
								)}
								<span>
									{revealTableOriginals
										? "Mask Originals"
										: "Reveal Local Originals"}
								</span>
							</button>
						</div>
						<div style={{ overflowX: "auto" }}>
							<table className="entity-table">
								<thead>
									<tr>
										<th>Placeholder</th>
										<th>Category</th>
										<th>Severity</th>
										<th>Local Value (RAM-Only)</th>
									</tr>
								</thead>
								<tbody>
									{directMatches.map((m) => (
										<tr key={m.id}>
											<td>
												<span className="token-redacted">{m.placeholder}</span>
											</td>
											<td>{m.label}</td>
											<td>
												<span
													className={`pill pill-mono ${
														m.severity === "CRITICAL"
															? "pill-danger"
															: "pill-warn"
													}`}
												>
													{m.severity}
												</span>
											</td>
											<td style={{ fontFamily: "var(--font-mono)" }}>
												{revealTableOriginals
													? m.original
													: `${m.original.slice(0, 2)}${"•".repeat(Math.max(4, Math.min(10, m.original.length - 2)))}`}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				)}
			</div>
		</section>
	);
}
