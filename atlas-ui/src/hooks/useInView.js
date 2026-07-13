import { useEffect, useRef, useState } from "react";

export function elementIsScrollContainer(node) {
  if (!node || !(node instanceof Element)) return false;
  const style = getComputedStyle(node);
  const overflowY = style.overflowY;
  const overflow = style.overflow;
  const scrollable =
    overflowY === "auto" ||
    overflowY === "scroll" ||
    overflow === "auto" ||
    overflow === "scroll";
  return scrollable && node.scrollHeight > node.clientHeight + 1;
}

/** Nearest ancestor that actually scrolls, or null for the viewport. */
export function findScrollRoot(fromElement) {
  if (!fromElement) return null;
  let node = fromElement.parentElement;
  while (node) {
    if (elementIsScrollContainer(node)) return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * Fires once when the element enters (or is already inside) the viewport or scroll root.
 * root: Element | null | "auto" (auto-detect nearest scrolling ancestor)
 */
export function useInView({
  root = "auto",
  rootMargin = "240px 0px",
  disabled = false,
} = {}) {
  const ref = useRef(null);
  const [inView, setInView] = useState(disabled);

  useEffect(() => {
    if (disabled) {
      setInView(true);
      return undefined;
    }

    const el = ref.current;
    if (!el) return undefined;

    const resolvedRoot = root === "auto" ? findScrollRoot(el) : root;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { root: resolvedRoot ?? null, rootMargin, threshold: 0 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [root, rootMargin, disabled]);

  return { ref, inView };
}
