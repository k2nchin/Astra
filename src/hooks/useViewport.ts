import { useEffect, useState } from "react";

export function useViewport() {
  const [vp, setVp] = useState(() => ({
    vw: typeof window === "undefined" ? 1280 : window.innerWidth,
    vh: typeof window === "undefined" ? 800 : window.innerHeight,
  }));

  useEffect(() => {
    const onResize = () => setVp({ vw: window.innerWidth, vh: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return vp;
}
