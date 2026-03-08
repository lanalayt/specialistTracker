import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0a0f14",
        surface: "#141c26",
        "surface-2": "#1a2535",
        border: "#1f2f42",
        accent: "#00d4a0",
        "accent-dim": "rgba(0,212,160,0.15)",
        make: "#00d4a0",
        miss: "#ef4444",
        warn: "#f59e0b",
        muted: "#64748b",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
      borderRadius: {
        card: "16px",
        input: "10px",
        pill: "999px",
      },
      boxShadow: {
        accent: "0 0 20px rgba(0,212,160,0.2)",
        "accent-lg": "0 0 40px rgba(0,212,160,0.15)",
      },
    },
  },
  plugins: [],
};

export default config;
