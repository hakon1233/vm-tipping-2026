import { Check, RefreshCw } from "lucide-react";

export type SaveState = "idle" | "saving" | "saved" | "error";

// Brand mark + wordmark shown above every page heading. The icon is
// web/public/icon.svg, served under BASE_URL.
const assetBase = import.meta.env.BASE_URL ?? "/";

export function BrandEyebrow() {
  return (
    <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-normal text-[#c15f3c]">
      <img src={`${assetBase}icon.svg`} alt="" className="h-6 w-6 rounded-[6px]" />
      VM-tipping 2026
    </p>
  );
}

export function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saving") {
    return (
      <span className="flex items-center gap-2 text-ink/70">
        <RefreshCw size={16} aria-hidden="true" /> Saving
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="flex items-center gap-2 text-green-700">
        <Check size={16} aria-hidden="true" /> Saved
      </span>
    );
  }
  if (state === "error") return <span className="font-semibold text-red-800">Save failed</span>;
  return <span className="font-semibold text-ink/60">Auto-save on</span>;
}
