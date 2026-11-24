import { KeyRound, Trash2, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import type { FirebaseByokConfig } from "../ai/hybridRouter";

interface FirebaseConfigModalProps {
	isOpen: boolean;
	initialConfig: FirebaseByokConfig | null;
	onSave: (config: FirebaseByokConfig) => void;
	onClear: () => void;
	onClose: () => void;
}

export function FirebaseConfigModal({
	isOpen,
	initialConfig,
	onSave,
	onClear,
	onClose,
}: FirebaseConfigModalProps) {
	const [apiKey, setApiKey] = useState(initialConfig?.apiKey ?? "");
	const [projectId, setProjectId] = useState(initialConfig?.projectId ?? "");
	const [appId, setAppId] = useState(initialConfig?.appId ?? "");
	const [modelName, setModelName] = useState(
		initialConfig?.modelName ?? "gemini-2.5-flash",
	);

	if (!isOpen) return null;

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		onSave({
			apiKey: apiKey.trim(),
			projectId: projectId.trim(),
			appId: appId.trim(),
			modelName: modelName.trim() || "gemini-2.5-flash",
		});
		onClose();
	};

	return (
		<div
			className="modal-backdrop"
			role="dialog"
			aria-modal="true"
			aria-labelledby="byok-title"
		>
			<div className="modal-card">
				<div className="panel-header">
					<div className="panel-title-wrap">
						<KeyRound size={17} />
						<h2 id="byok-title" className="panel-title">
							Firebase AI Logic BYOK Config (RAM-Only)
						</h2>
					</div>
					<button
						type="button"
						className="btn btn-sm"
						onClick={onClose}
						aria-label="Close modal"
					>
						<X size={15} />
					</button>
				</div>

				<form onSubmit={handleSubmit}>
					<div className="panel-body">
						<div className="notice-box">
							<strong>Strict RAM-Only Storage:</strong> Your Firebase project
							config lives strictly in React memory for this tab session. It is
							never saved to <code>localStorage</code>,{" "}
							<code>sessionStorage</code>, or cookies, and raw PII is always
							scrubbed locally before any Firebase Cloud Gemini call.
						</div>

						<div className="list-stack">
							<div>
								<label htmlFor="fb-api-key" className="field-label">
									Firebase Web API Key
								</label>
								<input
									id="fb-api-key"
									type="password"
									className="text-input"
									value={apiKey}
									onChange={(e) => setApiKey(e.target.value)}
									placeholder="AIzaSy..."
									required
								/>
							</div>

							<div>
								<label htmlFor="fb-project-id" className="field-label">
									Firebase Project ID
								</label>
								<input
									id="fb-project-id"
									type="text"
									className="text-input"
									value={projectId}
									onChange={(e) => setProjectId(e.target.value)}
									placeholder="my-hybrid-ai-project"
									required
								/>
							</div>

							<div>
								<label htmlFor="fb-app-id" className="field-label">
									Firebase Web App ID
								</label>
								<input
									id="fb-app-id"
									type="text"
									className="text-input"
									value={appId}
									onChange={(e) => setAppId(e.target.value)}
									placeholder="1:1234567890:web:abcdef123456"
									required
								/>
							</div>

							<div>
								<label htmlFor="fb-model-name" className="field-label">
									Cloud Fallback Model (GoogleAIBackend)
								</label>
								<select
									id="fb-model-name"
									className="select-input"
									value={modelName}
									onChange={(e) => setModelName(e.target.value)}
								>
									<option value="gemini-2.5-flash">
										gemini-2.5-flash (Recommended)
									</option>
									<option value="gemini-2.5-pro">
										gemini-2.5-pro (Deep Legal/Clinical)
									</option>
									<option value="gemini-2.0-flash">gemini-2.0-flash</option>
								</select>
							</div>
						</div>
					</div>

					<div className="modal-footer">
						<button
							type="button"
							className="btn btn-sm"
							onClick={() => {
								setApiKey("");
								setProjectId("");
								setAppId("");
								onClear();
								onClose();
							}}
						>
							<Trash2 size={14} />
							Clear Credentials
						</button>
						<div style={{ display: "flex", gap: "8px" }}>
							<button type="button" className="btn btn-sm" onClick={onClose}>
								Cancel
							</button>
							<button type="submit" className="btn btn-primary btn-sm">
								Activate in RAM
							</button>
						</div>
					</div>
				</form>
			</div>
		</div>
	);
}
