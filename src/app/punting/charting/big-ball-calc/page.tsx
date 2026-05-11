"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";

interface CalcEntry {
  distance: number;
  hangTime: number;
  directionGood: boolean;
  score: number;
}

export default function BigBallCalcPage() {
  const [distInput, setDistInput] = useState("");
  const [hangInput, setHangInput] = useState("");
  const [dirGood, setDirGood] = useState(true);
  const [entries, setEntries] = useState<CalcEntry[]>([]);
  const [lastScore, setLastScore] = useState<number | null>(null);

  const parseHangRaw = (raw: string): number => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return 0;
    return parseFloat(`${digits.padStart(3, "0").slice(0, -2).replace(/^0+(?=\d)/, "") || "0"}.${digits.padStart(3, "0").slice(-2)}`);
  };

  const hangParsed = hangInput ? parseHangRaw(hangInput) : 0;

  const handleCalc = () => {
    const dist = parseInt(distInput);
    const hang = parseHangRaw(hangInput);
    if (isNaN(dist) || dist <= 0 || !hang) return;

    const score = parseFloat((dist + hang * 15 + (dirGood ? 0 : -10)).toFixed(2));
    const entry: CalcEntry = { distance: dist, hangTime: hang, directionGood: dirGood, score };
    setEntries((prev) => [entry, ...prev]);
    setLastScore(score);
    setDistInput("");
    setHangInput("");
    setDirGood(true);
  };

  const handleClear = () => {
    setEntries([]);
    setLastScore(null);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-md mx-auto space-y-5">
        <div className="text-center">
          <Link href="/punting/charting" className="text-xs text-muted hover:text-white transition-colors">← Back to Charting Games</Link>
          <h2 className="text-xl font-bold text-slate-100 mt-2">Big Ball Calculator</h2>
          <p className="text-xs text-muted mt-1">Distance + (Hang Time x 15) + Direction</p>
        </div>

        {/* Score display */}
        {lastScore !== null && (
          <div className="card-2 py-4 text-center">
            <p className="text-4xl font-black text-accent">{lastScore.toFixed(2)}</p>
            <p className="text-xs text-muted mt-1">last score</p>
          </div>
        )}

        {/* Inputs */}
        <div className="card space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] text-muted text-center uppercase tracking-wider mb-1">Distance (yds)</p>
              <input
                type="text"
                inputMode="numeric"
                value={distInput}
                onChange={(e) => setDistInput(e.target.value.replace(/\D/g, ""))}
                placeholder="55"
                className="input w-full text-center text-lg font-bold py-2"
              />
            </div>
            <div>
              <p className="text-[10px] text-muted text-center uppercase tracking-wider mb-1">Hang Time</p>
              <input
                type="text"
                inputMode="numeric"
                value={hangInput ? parseHangRaw(hangInput).toFixed(2) : ""}
                onChange={(e) => setHangInput(e.target.value.replace(/\D/g, ""))}
                placeholder="4.50"
                className="input w-full text-center text-lg font-bold py-2"
              />
            </div>
          </div>

          <div>
            <p className="text-[10px] text-muted text-center uppercase tracking-wider mb-1">Direction</p>
            <div className="flex rounded-input border border-border overflow-hidden">
              <button
                onClick={() => setDirGood(true)}
                className={clsx("flex-1 py-2 text-sm font-semibold transition-colors", dirGood ? "bg-make text-slate-900" : "text-muted hover:text-white")}
              >
                Good
              </button>
              <button
                onClick={() => setDirGood(false)}
                className={clsx("flex-1 py-2 text-sm font-semibold transition-colors border-l border-border", !dirGood ? "bg-miss text-white" : "text-muted hover:text-white")}
              >
                Bad (-10)
              </button>
            </div>
          </div>

          {/* Preview */}
          {distInput && hangInput && (
            <p className="text-xs text-muted text-center">
              {distInput} + ({hangParsed.toFixed(2)} x 15){!dirGood && " - 10"} = <span className="text-accent font-bold">{((parseInt(distInput) || 0) + hangParsed * 15 + (dirGood ? 0 : -10)).toFixed(2)}</span>
            </p>
          )}

          <button
            onClick={handleCalc}
            disabled={!distInput || !hangInput}
            className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-40"
          >
            Calculate
          </button>
        </div>

        {/* History */}
        {entries.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider">History</p>
              <button onClick={handleClear} className="text-[10px] text-muted hover:text-miss transition-colors">Clear</button>
            </div>
            <div className="card-2 overflow-y-auto max-h-[250px]">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-[10px] text-muted text-left py-1 px-2">#</th>
                    <th className="text-[10px] text-muted text-center py-1 px-2">Dist</th>
                    <th className="text-[10px] text-muted text-center py-1 px-2">Hang</th>
                    <th className="text-[10px] text-muted text-center py-1 px-2">Dir</th>
                    <th className="text-[10px] text-muted text-right py-1 px-2">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={i} className="border-t border-border/30">
                      <td className="text-muted py-1 px-2">{entries.length - i}</td>
                      <td className="text-slate-300 text-center py-1 px-2">{e.distance}</td>
                      <td className="text-slate-300 text-center py-1 px-2">{e.hangTime.toFixed(2)}s</td>
                      <td className={clsx("text-center py-1 px-2", e.directionGood ? "text-make" : "text-miss")}>{e.directionGood ? "Good" : "Bad"}</td>
                      <td className="text-accent text-right py-1 px-2 font-bold">{e.score.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted text-center">
              Avg: <span className="text-accent font-bold">{(entries.reduce((s, e) => s + e.score, 0) / entries.length).toFixed(2)}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
