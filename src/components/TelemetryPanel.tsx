import { Activity } from "lucide-react";
import type { TelemetrySummary } from "../engine/telemetry";

interface TelemetryPanelProps {
	summary: TelemetrySummary;
}

export function TelemetryPanel({ summary }: TelemetryPanelProps) {
	return (
		<section aria-label="Hybrid Routing Telemetry">
			<div className="telemetry-strip">
				<div className="metric-card">
					<div className="metric-label">Avg Latency</div>
					<div className="metric-value">{summary.avgLatencyMs} ms</div>
					<div className="metric-sub">
						{summary.totalRuns} total inference run(s)
					</div>
				</div>

				<div className="metric-card">
					<div className="metric-label">PII Tokens Kept Local</div>
					<div
						className="metric-value"
						style={{ color: "var(--accent-shield)" }}
					>
						{summary.totalPiiTokensKeptLocal}
					</div>
					<div className="metric-sub">Never left browser memory</div>
				</div>

				<div className="metric-card">
					<div className="metric-label">Raw PII Sent To Cloud</div>
					<div
						className="metric-value"
						style={{ color: "var(--accent-shield)" }}
					>
						{summary.totalRawPiiLeaked}
					</div>
					<div className="metric-sub">Hard zero-leak invariant</div>
				</div>

				<div className="metric-card">
					<div className="metric-label">Cloud Cost Saved</div>
					<div className="metric-value">
						${summary.totalCostSavedUsd.toFixed(4)}
					</div>
					<div className="metric-sub">Vs. cloud frontier token rate</div>
				</div>

				<div className="metric-card">
					<div className="metric-label">On-Device vs Cloud Split</div>
					<div className="metric-value">
						{summary.onDeviceSplitPercent}% / {summary.cloudSplitPercent}%
					</div>
					<div className="split-bar-track" aria-hidden="true">
						<div
							className="split-bar-fill"
							style={{ width: `${summary.onDeviceSplitPercent}%` }}
						/>
					</div>
				</div>
			</div>

			{summary.events.length > 0 && (
				<div className="panel" style={{ marginTop: "14px" }}>
					<div className="panel-header">
						<div className="panel-title-wrap">
							<Activity size={16} />
							<h2 className="panel-title">Hybrid Routing Telemetry Log</h2>
						</div>
						<span className="pill pill-mono">
							Last {Math.min(5, summary.events.length)} runs
						</span>
					</div>
					<div>
						{summary.events.slice(0, 5).map((ev) => (
							<div key={ev.id} className="run-log-item">
								<div>
									<div
										style={{
											display: "flex",
											gap: "6px",
											flexWrap: "wrap",
											marginBottom: "3px",
										}}
									>
										<span className="pill pill-mono">{ev.provenance}</span>
										<span className="pill pill-mono">
											{ev.sdkInferenceMode}
										</span>
										{ev.redactionApplied && (
											<span className="pill pill-mono pill-shield">
												Redacted Locally
											</span>
										)}
										{ev.offlineActive && (
											<span className="pill pill-mono pill-warn">Offline</span>
										)}
									</div>
									<div style={{ color: "var(--text-secondary)" }}>
										{ev.routingReason}
									</div>
								</div>
								<div
									style={{
										textAlign: "right",
										fontFamily: "var(--font-mono)",
										whiteSpace: "nowrap",
										color: "var(--text-muted)",
									}}
								>
									<div>{ev.latencyMs} ms</div>
									<div>{ev.piiTokensKeptLocal} PII local</div>
								</div>
							</div>
						))}
					</div>
				</div>
			)}
		</section>
	);
}
