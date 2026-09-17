import { motion } from "motion/react";
import type { TransitionBounds } from "../../app/environment-types";

function center(bounds: TransitionBounds) {
  return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
}

export function TidePath({ progressed, source, destination }: { progressed: boolean; source: TransitionBounds; destination: TransitionBounds }) {
  const from = center(source); const to = center(destination);
  const bend = Math.max(48, Math.abs(to.x - from.x) * 0.42);
  const direction = to.x >= from.x ? 1 : -1;
  const path = `M ${from.x} ${from.y} C ${from.x + bend * direction} ${from.y}, ${to.x - bend * direction} ${to.y}, ${to.x} ${to.y}`;
  const width = typeof window === "undefined" ? 1 : Math.max(window.innerWidth, 1);
  const height = typeof window === "undefined" ? 1 : Math.max(window.innerHeight, 1);
  return <svg className="absolute inset-0 size-full" preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`}>
    <motion.path animate={{ pathLength: progressed ? 1 : 0.2, opacity: progressed ? 0.28 : 0.72 }} d={path} fill="none" initial={{ pathLength: 0, opacity: 0 }} stroke="currentColor" strokeLinecap="round" strokeOpacity="0.7" strokeWidth="1.25" transition={{ duration: 0.32 }} vectorEffect="non-scaling-stroke" />
    <motion.circle animate={{ offsetDistance: progressed ? "100%" : "45%", opacity: progressed ? 0.75 : 1 }} className="fill-current" cx="0" cy="0" initial={{ offsetDistance: "0%", opacity: 0 }} r="3" style={{ offsetPath: `path("${path}")` }} transition={{ duration: 0.38 }} />
  </svg>;
}
