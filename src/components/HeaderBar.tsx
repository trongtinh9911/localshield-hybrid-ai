import {
	Cpu,
	KeyRound,
	Moon,
	ShieldCheck,
	Sun,
	Wifi,
	WifiOff,
} from "lucide-react";
import type { OnDeviceAvailability } from "../ai/hybridRouter";

interface HeaderBarProps {
	offlineMode: boolean;
	onToggleOffline: () => void;
	hasFirebaseConfig: boolean;
	onOpenConfig: () => void;
	onDeviceStatus: OnDeviceAvailability;
	onDeviceDetail: string;
	theme: "light" | "dark";
	onToggleTheme: () => void;
}

export function HeaderBar({
	offlineMode,
	onToggleOffline,
	hasFirebaseConfig,
	onOpenConfig,
	onDeviceStatus,
	onDeviceDetail,
	theme,
	onToggleTheme,
}: HeaderBarProps) {
	const nanoBadgeClass =
		onDeviceStatus === "available"
			? "pill pill-shield"
			: onDeviceStatus === "downloadable" || onDeviceStatus === "downloading"
				? "pill pill-warn"
				: "pill";

	return (
		<header className="topbar">
			<div className="brand-group">
				<div className="brand-mark" aria-hidden="true">
					<ShieldCheck size={22} strokeWidth={2.2} />
				</div>
				<div>
					<h1 className="brand-title">LocalShield Hybrid</h1>
					<p className="brand-subtitle">
						Privacy-First Clinical &amp; Legal Hybrid AI · Firebase AI Logic SDK
					</p>
				</div>
			</div>

			<div className="topbar-controls">
				<span className={nanoBadgeClass} title={onDeviceDetail}>
					<Cpu size={14} />
					<span>
						{onDeviceStatus === "available"
							? "Chrome Gemini Nano: Ready"
							: onDeviceStatus === "downloadable"
								? "Gemini Nano: Downloadable"
								: onDeviceStatus === "downloading"
									? "Gemini Nano: Downloading"
									: "Local Engine Ready"}
					</span>
				</span>

				<button
					type="button"
					className={`btn btn-sm ${offlineMode ? "btn-offline-active" : ""}`}
					onClick={onToggleOffline}
					aria-pressed={offlineMode}
					title="Simulate airplane mode and enforce InferenceMode.ONLY_ON_DEVICE"
				>
					{offlineMode ? <WifiOff size={15} /> : <Wifi size={15} />}
					<span>
						{offlineMode ? "Offline Simulator: ON" : "Offline Simulator: OFF"}
					</span>
				</button>

				<button
					type="button"
					className="btn btn-sm"
					onClick={onOpenConfig}
					title="Configure RAM-only Firebase AI Logic credentials for redacted cloud fallback"
				>
					<KeyRound size={15} />
					<span>
						{hasFirebaseConfig
							? "Firebase BYOK: Active"
							: "Firebase BYOK (RAM)"}
					</span>
				</button>

				<button
					type="button"
					className="btn btn-sm"
					onClick={onToggleTheme}
					aria-label="Toggle color theme"
				>
					{theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
				</button>
			</div>
		</header>
	);
}
