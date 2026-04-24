"use client";

import { useEffect, useRef } from "react";

/**
 * Warns the user before navigating away when there is unsaved data.
 * Handles browser close/refresh (beforeunload) and in-app link clicks.
 */
export function useUnsavedWarning(hasUnsaved: boolean) {
  const unsavedRef = useRef(hasUnsaved);
  unsavedRef.current = hasUnsaved;

  useEffect(() => {
    if (!hasUnsaved) return;

    // Browser close / refresh
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    // Intercept all link clicks within the app
    const onClick = (e: MouseEvent) => {
      if (!unsavedRef.current) return;

      // Walk up from the click target to find an <a> tag
      let target = e.target as HTMLElement | null;
      while (target && target.tagName !== "A") {
        target = target.parentElement;
      }
      if (!target) return;

      const anchor = target as HTMLAnchorElement;
      const href = anchor.getAttribute("href");
      // Only intercept internal navigation links
      if (!href || href.startsWith("http") || href.startsWith("mailto")) return;
      // Don't intercept hash links or same-page links
      if (href === "#" || href === window.location.pathname) return;

      e.preventDefault();
      e.stopPropagation();

      const leave = window.confirm(
        "You have unsaved session data. Are you sure you want to leave?"
      );
      if (leave) {
        unsavedRef.current = false;
        window.location.href = href;
      }
    };

    // Use capture phase to intercept before Next.js router handles it
    document.addEventListener("click", onClick, true);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [hasUnsaved]);
}
