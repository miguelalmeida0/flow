/**
 * Directional reference only. Integrate with the repository's existing
 * token modules rather than creating a second competing design system.
 */
export const flowColors = {
  canvas: "#061015",
  canvasDeep: "#030B0F",
  surface: "#0A171D",
  surfaceRaised: "#0E2027",
  surfaceHover: "#12272E",
  border: "#17343A",
  borderStrong: "#28535A",
  textPrimary: "#F4F7F5",
  textSecondary: "#A6B3B1",
  textTertiary: "#70817F",
  flow: "#5DE6D4",
  flowBright: "#8AF5E7",
  flowDeep: "#2A9E93",
  protected: "#F6C453",
  danger: "#FF6675",
  info: "#71A8FF",
  success: "#67D49B",
} as const;

export const flowClasses = {
  app: "min-h-dvh bg-[#061015] text-[#F4F7F5] antialiased",
  panel: "border border-[#17343A] bg-[#0A171D]",
  panelRaised: "border border-[#28535A] bg-[#0E2027]",
  muted: "text-[#A6B3B1]",
  tertiary: "text-[#70817F]",
  focusRing:
    "outline-none ring-2 ring-[#5DE6D4]/70 ring-offset-2 ring-offset-[#061015]",
  commandDock:
    "border border-[#2A9E93]/70 bg-[#07151B]/95 text-[#F4F7F5] shadow-[0_0_24px_rgba(93,230,212,0.08)]",
  event:
    "rounded-[14px] border border-[#17343A] bg-[#0A171D]",
  eventActive:
    "rounded-[14px] border border-[#2A9E93] bg-[#0E2027]",
  protected:
    "border-[#F6C453]/55 bg-[#F6C453]/10 text-[#F4F7F5]",
} as const;
