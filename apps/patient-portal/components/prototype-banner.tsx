import { PROTOTYPE_NOTICE } from "@/lib/brand";

export function PrototypeBanner() {
  return (
    <div
      role="note"
      aria-label="Aviso de prototipo"
      className="safe-top sticky top-0 z-40 border-b border-warning/30 bg-warning-soft text-warning"
    >
      <p className="safe-x mx-auto max-w-3xl py-1.5 text-center text-xs font-semibold sm:text-sm">
        {PROTOTYPE_NOTICE}
      </p>
    </div>
  );
}
