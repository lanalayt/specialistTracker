"use client";

import { useEffect, useRef } from "react";

/**
 * Warns the user before navigating away when there is unsaved data.
 * Handles both browser close/refresh (beforeunload) and Next.js
 * client-side navigation (history.pushState interception).
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

    // Intercept Next.js client-side navigation (pushState)
    const originalPushState = history.pushState.bind(history);
    history.pushState = function (...args: Parameters<typeof history.pushState>) {
      if (unsavedRef.current) {
        const leave = window.confirm(
          "You have unsaved session data. Are you sure you want to leave?"
        );
        if (!leave) return;
      }
      return originalPushState(...args);
    };

    // Also intercept popstate (back/forward buttons)
    const onPopState = (e: PopStateEvent) => {
      if (unsavedRef.current) {
        const leave = window.confirm(
          "You have unsaved session data. Are you sure you want to leave?"
        );
        if (!leave) {
          // Push the current URL back to cancel the navigation
          e.stopImmediatePropagation();
          history.pushState = originalPushState; // temporarily restore to avoid recursion
          history.pushState(null, "", window.location.href);
          history.pushState = function (...a: Parameters<typeof history.pushState>) {
            if (unsavedRef.current) {
              const l = window.confirm("You have unsaved session data. Are you sure you want to leave?");
              if (!l) return;
            }
            return originalPushState(...a);
          };
        }
      }
    };
    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("popstate", onPopState);
      history.pushState = originalPushState;
    };
  }, [hasUnsaved]);
}
