import { Icon } from "../../shared/design-system/Icon";
import { tokens } from "../../shared/design-system/tokens";
import type { DensityState } from "./tide/classifyDensity";
import { formatDayTitle } from "./time";

interface PlannerHeaderProps {
  dateKey: string;
  density: DensityState;
  canUndo: boolean;
  canRedo: boolean;
  onReset: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

export function PlannerHeader({ dateKey, density, canUndo, canRedo, onReset, onUndo, onRedo }: PlannerHeaderProps) {
  const densityStyle = density === "Overloaded" ? tokens.density.overloaded : density === "Tight" ? tokens.density.tight : tokens.density.calm;
  return (
    <header className={`flex h-16 shrink-0 items-center justify-between border-b px-3 sm:px-6 ${tokens.divider}`}>
      <div className="flex min-w-0 items-center gap-3">
        <span className={tokens.brandMark}>F</span>
        <div className="min-w-0">
          <span className="text-base font-semibold tracking-[-0.02em]">Flow</span>
          <p className={`hidden text-[10px] uppercase tracking-[0.16em] sm:block ${tokens.mutedText}`}>Breathing day</p>
        </div>
      </div>

      <div className="text-center">
        <p className="text-sm font-semibold tracking-[-0.01em] sm:text-base">{formatDayTitle(dateKey)}</p>
        <p className={`hidden text-xs sm:block ${tokens.mutedText}`}>Space is part of the plan</p>
      </div>

      <div className="flex items-center gap-1">
        <span className={`mr-1 inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[11px] font-semibold ${densityStyle}`} data-testid="density-chip">
          <span className="hidden sm:inline">Day density:</span>{density}<span className="size-1.5 rounded-full bg-current" />
        </span>
        <button data-action-id="history.undo-redo" aria-label="Undo last change" className={`${tokens.iconButton} ${tokens.focusRing}`} data-flow-action="Undo" disabled={!canUndo} onClick={onUndo}><Icon name="undo" size={17} /></button>
        <button data-action-id="history.undo-redo" aria-label="Redo last change" className={`${tokens.iconButton} ${tokens.focusRing}`} data-flow-action="Redo" disabled={!canRedo} onClick={onRedo}><Icon className="scale-x-[-1]" name="undo" size={17} /></button>
        <button data-action-id="legacy.calendar.reset" aria-label="Reset day" className={`hidden sm:grid ${tokens.iconButton} ${tokens.focusRing}`} data-flow-action="Reset day" onClick={onReset}><Icon name="rotate" size={17} /></button>
      </div>
    </header>
  );
}
