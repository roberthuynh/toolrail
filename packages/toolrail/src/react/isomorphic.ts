import { useEffect, useLayoutEffect } from "react";

/** useLayoutEffect on the client, useEffect during SSR (React 18 warns otherwise). */
export const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
