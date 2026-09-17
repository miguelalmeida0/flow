import type { PropsWithChildren } from "react";
import { tokens } from "./tokens";

export function DesignTokens({ children }: PropsWithChildren) {
  return <div className={tokens.page}>{children}</div>;
}
