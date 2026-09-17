/**
 * Shape reference only.
 *
 * Adapt these semantic bundles to the existing Tailwind setup.
 * Raw visual values should remain centralized here or in the repository's
 * existing tokens.ts. Runtime top/height values may use inline styles.
 */

export const flowTokens = {
  app: {
    canvas:
      "min-h-dvh bg-[#061015] text-[#F3F7F6] antialiased selection:bg-[#67DDCB]/25",
    frame:
      "mx-auto min-h-dvh w-full max-w-[1280px] bg-[#061015]",
  },

  text: {
    primary: "text-[#F3F7F6]",
    secondary: "text-[#A9BBC0]",
    muted: "text-[#6E878E]",
    time: "font-medium tabular-nums text-[#A9BBC0]",
  },

  structure: {
    line: "bg-[#15313A]",
    lineStrong: "bg-[#24505A]",
    divider: "border-[#15313A]",
  },

  event: {
    base:
      "relative rounded-[14px] border px-3.5 py-3 text-left transition-[border-color,background-color,box-shadow,opacity] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#83B8FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#061015]",
    neutral: "border-[#21404A] bg-[#0D2028] text-[#DDE8E9]",
    red: "border-[#A54858] bg-[#32171D] text-[#FFD6DC]",
    orange: "border-[#A86135] bg-[#322016] text-[#FFE0C9]",
    yellow: "border-[#9A7B2F] bg-[#302815] text-[#FBEAB4]",
    green: "border-[#3E8969] bg-[#142A21] text-[#CFF4DF]",
    cyan: "border-[#338C94] bg-[#0F2C2F] text-[#C8F5F1]",
    blue: "border-[#3E6FA8] bg-[#142437] text-[#D5E7FF]",
    indigo: "border-[#596BAA] bg-[#1C2238] text-[#DCE2FF]",
    focused:
      "border-[#67DDCB]/70 bg-[#122A33] shadow-[0_12px_34px_rgba(0,0,0,0.28)]",
    moving: "shadow-[0_18px_44px_rgba(0,0,0,0.34)]",
    ghost: "border-dashed opacity-45",
  },

  state: {
    tide: "text-[#67DDCB]",
    tideSurface: "border-[#338C94] bg-[#0D302F] text-[#C8F5F1]",
    protected: "text-[#F1C75B]",
    protectedSurface: "border-[#9A7B2F] bg-[#2E2815] text-[#FBEAB4]",
    danger: "text-[#FF6D75]",
    dangerSurface: "border-[#A54858] bg-[#34171B] text-[#FFD6DC]",
    success: "text-[#67D99A]",
    fixed: "text-[#83B8FF]",
  },

  chip: {
    base:
      "inline-flex min-h-8 items-center gap-2 rounded-full border px-3 text-xs font-medium",
    calm: "border-[#338C94]/55 bg-[#0D302F] text-[#C8F5F1]",
    tight: "border-[#9A7B2F]/60 bg-[#2E2815] text-[#FBEAB4]",
    overloaded: "border-[#A54858]/60 bg-[#34171B] text-[#FFD6DC]",
  },

  command: {
    shell:
      "fixed inset-x-4 bottom-4 z-40 mx-auto flex min-h-14 max-w-2xl items-center gap-3 rounded-full border border-[#24505A] bg-[#0A1A21]/95 px-4 shadow-[0_18px_60px_rgba(0,0,0,0.38)] backdrop-blur-sm",
    input:
      "min-w-0 flex-1 bg-transparent text-sm text-[#F3F7F6] outline-none placeholder:text-[#6E878E]",
    mic:
      "grid size-10 shrink-0 place-items-center rounded-full bg-[#67DDCB] text-[#061015] transition-transform hover:scale-[1.03] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#83B8FF]",
  },

  popover: {
    shell:
      "rounded-[14px] border border-[#24505A] bg-[#0A1A21] p-3 text-sm shadow-[0_18px_50px_rgba(0,0,0,0.34)]",
  },
} as const;

export const motionTokens = {
  immediateMs: 120,
  microMs: 240,
  paintMs: 380,
  moveMs: 640,
  reflowMs: 820,
  replayMaxMs: 2500,
} as const;
