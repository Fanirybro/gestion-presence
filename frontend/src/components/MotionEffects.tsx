import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";
import { Link } from "react-router-dom";
import { useMotionPreference as useReducedMotion } from "./useMotionPreference";

export function RollingNumber({ value }: { value: number }) {
  const reduced = useReducedMotion();
  const digits = String(value).padStart(2, "0");
  if (reduced) return <span className="rolling-number">{digits}</span>;
  return (
    <span className="rolling-number" aria-label={digits}>
      {digits.split("").map((digit, index) => (
        <span
          className="digit-window"
          aria-hidden="true"
          key={`${digits.length}-${index}`}
        >
          <motion.span
            key={digit}
            className="digit-reel"
            initial={{ y: `${-(Number(digit) + 10) * 1.2}em` }}
            animate={{ y: `${-Number(digit) * 1.2}em` }}
            transition={{
              duration: 0.85,
              delay: 0.08 + index * 0.065,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            {Array.from({ length: 20 }, (_, n) => (
              <span key={n}>{n % 10}</span>
            ))}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

export function ReactiveMetric({
  to,
  className,
  children,
}: {
  to: string;
  className: string;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const bounds = useRef<DOMRect | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(x, { stiffness: 300, damping: 28 });
  const rotateY = useSpring(y, { stiffness: 300, damping: 28 });
  const reset = () => {
    x.set(0);
    y.set(0);
  };
  useEffect(() => {
    if (reduced) {
      x.set(0);
      y.set(0);
    }
  }, [reduced, x, y]);
  return (
    <motion.div
      className="metric-motion"
      style={
        reduced ? undefined : { rotateX, rotateY, transformPerspective: 950 }
      }
      onPointerEnter={(event) => {
        if (event.pointerType !== "mouse" || reduced) return;
        bounds.current = event.currentTarget.getBoundingClientRect();
      }}
      onPointerMove={(event) => {
        if (event.pointerType !== "mouse" || reduced || !bounds.current) return;
        const b = bounds.current;
        x.set(-((event.clientY - b.top) / b.height - 0.5) * 7);
        y.set(((event.clientX - b.left) / b.width - 0.5) * 7);
      }}
      onPointerLeave={reset}
      onBlur={reset}
      whileTap={reduced ? undefined : { scale: 0.975 }}
      transition={{ type: "spring", stiffness: 450, damping: 30 }}
    >
      <Link to={to} className={className}>
        {children}
      </Link>
    </motion.div>
  );
}

export function AnimatedMeter({
  value,
  max,
  label,
  delay = 0,
}: {
  value: number;
  max: number;
  label: string;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  const ratio = Math.max(0, Math.min(1, value / Math.max(1, max)));
  return (
    <div
      className="animated-meter"
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max || 1}
    >
      <motion.span
        initial={{ scaleX: reduced ? ratio : 0 }}
        animate={{ scaleX: ratio }}
        transition={{
          duration: reduced ? 0.12 : 0.75,
          delay: reduced ? 0 : delay,
          ease: [0.16, 1, 0.3, 1],
        }}
      />
    </div>
  );
}

export function PageArrival({
  children,
  pageKey,
}: {
  children: ReactNode;
  pageKey: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  useLayoutEffect(() => {
    const elements = Array.from(ref.current?.children || []).filter(
      (el) => !el.matches(".page-heading, .back"),
    );
    const animations = elements.map((el, i) =>
      el.animate(
        reduced
          ? [{ opacity: 0.5 }, { opacity: 1 }]
          : [
              { opacity: 0, transform: "translateY(18px)" },
              { opacity: 1, transform: "translateY(0)" },
            ],
        {
          duration: reduced ? 120 : 420,
          delay: reduced ? 0 : Math.min(i, 5) * 45,
          easing: "cubic-bezier(.16,1,.3,1)",
          fill: "backwards",
        },
      ),
    );
    return () => animations.forEach((animation) => animation.cancel());
  }, [pageKey, reduced]);
  return (
    <div ref={ref} className="route-content">
      {children}
    </div>
  );
}
