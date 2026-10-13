import { Suspense, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType, useOutlet } from "react-router-dom";
import { PageArrival } from "./MotionEffects";
import { PageSkeleton } from "./Skeleton";

export default function RouteContent() {
  const location = useLocation();
  const navigation = useNavigationType();
  const outlet = useOutlet();
  const content = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (navigation !== "POP") window.scrollTo({ top: 0, behavior: "instant" });
    content.current?.focus({ preventScroll: true });
  }, [location.pathname, navigation]);
  return (
    <div
      ref={content}
      tabIndex={-1}
      className="route-focus"
      aria-label="Contenu de la page"
    >
      <Suspense
        key={location.pathname}
        fallback={<PageSkeleton path={location.pathname} />}
      >
        <PageArrival key={location.pathname} pageKey={location.pathname}>
          {outlet}
        </PageArrival>
      </Suspense>
    </div>
  );
}
