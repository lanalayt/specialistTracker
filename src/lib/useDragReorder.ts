import { useState, useRef, useCallback } from "react";

export function useDragReorder<T>(
  rows: T[],
  setRows: React.Dispatch<React.SetStateAction<T[]>>
) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLTableSectionElement | null>(null);
  const startY = useRef(0);
  const dragging = useRef(false);

  const reorder = useCallback(
    (from: number, to: number) => {
      if (from === to) return;
      setRows((prev) => {
        const next = [...prev];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        return next;
      });
    },
    [setRows]
  );

  const getRowIdxFromY = useCallback((clientY: number): number | null => {
    const tbody = containerRef.current;
    if (!tbody) return null;
    const trs = tbody.querySelectorAll("tr");
    for (let i = 0; i < trs.length; i++) {
      const rect = trs[i].getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) {
        return i;
      }
    }
    return null;
  }, []);

  const handlePointerDown = useCallback(
    (idx: number, e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setDragIdx(idx);
      setOverIdx(idx);
      startY.current = e.clientY;
      dragging.current = true;
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current || dragIdx === null) return;
      const target = getRowIdxFromY(e.clientY);
      if (target !== null) {
        setOverIdx(target);
      }
    },
    [dragIdx, getRowIdxFromY]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current || dragIdx === null) return;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      dragging.current = false;
      if (overIdx !== null && overIdx !== dragIdx) {
        reorder(dragIdx, overIdx);
      }
      setDragIdx(null);
      setOverIdx(null);
    },
    [dragIdx, overIdx, reorder]
  );

  return {
    dragIdx,
    overIdx,
    containerRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}
