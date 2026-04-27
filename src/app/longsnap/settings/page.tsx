"use client";

import { useState } from "react";

export default function SnapSettingsPage() {
  const [saved, setSaved] = useState(false);

  return (
    <div className="flex-1 p-6 max-w-5xl space-y-6">
      <h2 className="text-lg font-bold text-slate-100">Snapping Settings</h2>
      <div className="card space-y-4">
        <p className="text-sm text-muted">Snapping settings coming soon.</p>
      </div>
    </div>
  );
}
