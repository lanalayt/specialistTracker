"use client";

import { useCallback } from "react";
import { getTeamId } from "@/lib/teamData";
import { updateTeamSettings, stampTeamSettingsWrite, patchTeamSettingsCache, useTeamSettings } from "@/lib/teamSettingsStore";

export function useTeamLogo() {
  // Reactive: sourced from the teams-table cache (seeded by the SSR bootstrap,
  // kept fresh by loads + realtime), so the logo shows on first paint and
  // updates without navigating.
  const logo = useTeamSettings()?.logo ?? null;

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
        patchTeamSettingsCache({ logo: dataUrl }); // instant UI
        const tid = getTeamId();
        if (tid && tid !== "local-dev") {
          stampTeamSettingsWrite();
          updateTeamSettings(tid, { logo: dataUrl });
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }, []);

  const removeLogo = useCallback(() => {
    patchTeamSettingsCache({ logo: null }); // instant UI
    const tid = getTeamId();
    if (tid && tid !== "local-dev") {
      stampTeamSettingsWrite();
      updateTeamSettings(tid, { logo: null });
    }
  }, []);

  return { logo, uploadLogo, removeLogo };
}
