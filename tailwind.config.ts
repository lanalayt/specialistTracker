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
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        border: "var(--border)",
        accent: "var(--accent)",
        "accent-dim": "var(--accent-dim)",
        make: "var(--make)",
        miss: "var(--miss)",
        warn: "var(--warn)",
        muted: "var(--muted)",
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
        accent: "0 0 20px var(--accent-dim)",
        "accent-lg": "0 0 40px var(--accent-dim)",
      },
    },
  },
  plugins: [],
};

export default config;
