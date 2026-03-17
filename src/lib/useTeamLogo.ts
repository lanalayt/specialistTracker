"use client";

import { useState, useEffect, useCallback } from "react";
import { getTeamId, teamGet, teamSet } from "@/lib/teamData";

const STORAGE_KEY = "team_logo";

export function useTeamLogo() {
  const [logo, setLogo] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return localStorage.getItem(STORAGE_KEY) || null;
    } catch {
      return null;
    }
  });

  // Load from cloud on mount
  useEffect(() => {
    const tid = getTeamId();
    if (tid && tid !== "local-dev") {
      teamGet<{ logo: string }>(tid, "team_logo").then((data) => {
        if (data?.logo) {
          setLogo(data.logo);
          try { localStorage.setItem(STORAGE_KEY, data.logo); } catch {}
        }
      });
    }
  }, []);

  const uploadLogo = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    // Resize to max 128x128 for storage efficiency
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxSize = 128;
        let w = img.width;
        let h = img.height;
        if (w > maxSize || h > maxSize) {
          if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
          else { w = Math.round(w * maxSize / h); h = maxSize; }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/png");
        setLogo(dataUrl);
        try { localStorage.setItem(STORAGE_KEY, dataUrl); } catch {}
        const tid = getTeamId();
        if (tid && tid !== "local-dev") {
          teamSet(tid, "team_logo", { logo: dataUrl });
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }, []);

  const removeLogo = useCallback(() => {
    setLogo(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    const tid = getTeamId();
    if (tid && tid !== "local-dev") {
      teamSet(tid, "team_logo", { logo: "" });
    }
  }, []);

  return { logo, uploadLogo, removeLogo };
}
