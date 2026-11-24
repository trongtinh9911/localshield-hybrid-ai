import { Eraser, FileText, Lock, Play } from "lucide-react";
import type { UserHybridMode } from "../ai/hybridRouter";
import { DOCUMENT_PRESETS } from "../data/presets";
import type { PiiScanResult } from "../engine/piiClassifier";

interface DocumentWorkspaceProps {
	selectedPresetId: string | null;
	documentText: string;
	instruction: string;
	userMode: UserHybridMode;
	allowRedactedCloud: boolean;
	offlineMode: boolean;
	isRunning: boolean;
	liveScan: PiiScanResult;
	onSelectPreset: (presetId: string) => void;
	onChangeDocument: (text: string) => void;
	onChangeInstruction: (text: string) => void;
	onChangeMode: (mode: UserHybridMode) => void;
	onToggleAllowRedactedCloud: (allowed: boolean) => void;
	onClear: () => void;
	onRun: () => void;
}

export function DocumentWorkspace({
	selectedPresetId,
	documentText,
	instruction,
	userMode,
	allowRedactedCloud,
	offlineMode,
	isRunning,
	liveScan,
	onSelectPreset,
	onChangeDocument,
	onChangeInstruction,
	onChangeMode,
	onToggleAllowRedactedCloud,
	onClear,
	onRun,
}: DocumentWorkspaceProps) {
	return (
		<section className="panel" aria-label="Document Editor and Hybrid Policy">
			<div className="panel-header">
				<div className="panel-title-wrap">
					<FileText size={17} />
					<h2 className="panel-title">Document Input &amp; Hybrid Policy</h2>
				</div>
				<div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
					<span
						className={`pill pill-mono ${
							liveScan.riskLevel === "CRITICAL"
								? "pill-danger"
								: liveScan.riskLevel === "HIGH"
									? "pill-warn"
									: "pill-shield"
						}`}
					>
						{liveScan.directPiiCount} PII · {liveScan.riskLevel}
					</span>
					<button type="button" className="btn btn-sm" onClick={onClear}>
						<Eraser size={14} />
						Clear
					</button>
				</div>
			</div>

			<div className="panel-body">
				<span className="field-label">
					One-Click Clinical / Legal / FERPA Presets
				</span>
				<div className="preset-strip">
					{DOCUMENT_PRESETS.map((preset) => (
						<button
							key={preset.id}
							type="button"
							className={`preset-btn ${selectedPresetId === preset.id ? "active" : ""}`}
							onClick={() => onSelectPreset(preset.id)}
						>
							<span>{preset.label}</span>
							<span className="preset-tag">{preset.badge}</span>
						</button>
					))}
				</div>

				<div className="policy-row">
					<div>
						<label htmlFor="hybrid-mode-select" className="field-label">
							Firebase AI Logic Inference Mode
						</label>
						<select
							id="hybrid-mode-select"
							className="select-input"
							value={userMode}
							onChange={(e) => onChangeMode(e.target.value as UserHybridMode)}
						>
							<option value="AUTO_PRIVACY">
								Auto Privacy (Recommended — Force On-Device for Raw PII)
							</option>
							<option value="PREFER_ON_DEVICE">
								Prefer On-Device (InferenceMode.PREFER_ON_DEVICE)
							</option>
							<option value="ONLY_ON_DEVICE">
								Only On-Device (InferenceMode.ONLY_ON_DEVICE — Hard Airgap)
							</option>
							<option value="PREFER_IN_CLOUD">
								Prefer Cloud Redacted (InferenceMode.PREFER_IN_CLOUD)
							</option>
							<option value="ONLY_IN_CLOUD">
								Only Cloud Redacted (InferenceMode.ONLY_IN_CLOUD)
							</option>
						</select>
					</div>
					<span
						className="pill pill-mono pill-shield"
						title="Runtime zero-egress guarantee"
					>
						<Lock size={12} />0 Raw PII Cloud Invariant
					</span>
				</div>

				<label className="checkbox-row">
					<input
						type="checkbox"
						checked={allowRedactedCloud}
						onChange={(e) => onToggleAllowRedactedCloud(e.target.checked)}
						disabled={offlineMode || userMode === "ONLY_ON_DEVICE"}
					/>
					<span>
						Allow Firebase Cloud fallback{" "}
						<strong>only after local PII redaction</strong> (requires RAM-only
						Firebase BYOK key)
					</span>
				</label>

				<div style={{ marginBottom: "12px" }}>
					<label htmlFor="instruction-input" className="field-label">
						Analysis Directive (Optional)
					</label>
					<input
						id="instruction-input"
						type="text"
						className="text-input"
						value={instruction}
						onChange={(e) => onChangeInstruction(e.target.value)}
						placeholder="e.g., Extract binding obligations, liability caps, and clinical follow-up deadlines..."
					/>
				</div>

				<div style={{ marginBottom: "12px" }}>
					<label htmlFor="document-editor" className="field-label">
						Sensitive Document Text (Scanned live in browser RAM)
					</label>
					<textarea
						id="document-editor"
						className="doc-textarea"
						value={documentText}
						onChange={(e) => onChangeDocument(e.target.value)}
						placeholder="Paste a clinical discharge note, enterprise NDA, financial aid appeal, or custom sensitive text..."
					/>
				</div>

				<div className="action-bar">
					<span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
						Domain: <strong>{liveScan.domain}</strong> · {documentText.length}{" "}
						chars · {liveScan.estimatedLocalTokensProtected} PII tokens guarded
						locally
					</span>

					<button
						type="button"
						className="btn btn-primary"
						onClick={onRun}
						disabled={isRunning || documentText.trim().length === 0}
					>
						<Play size={15} />
						<span>
							{isRunning ? "Running Hybrid Inference…" : "Run Hybrid Analysis"}
						</span>
					</button>
				</div>
			</div>
		</section>
	);
}
