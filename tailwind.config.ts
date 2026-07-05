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
        // Ink (text) — warm near-black to light muted brown.
        ink: {
          DEFAULT: "#2A2320",
          soft: "#6B5F57",
          mute: "#8C8079",
          faint: "#B4A79C",
        },
        // Surfaces.
        cream: "#FBF7F1", // app / card canvas
        "cream-2": "#FBF5EE",
        sand: "#EFE6DB", // borders, toggles
        "sand-line": "#F1E8DE",
        hatch: { light: "#F2E8DC", dark: "#EBDFD0" }, // item placeholder stripes
        // Brand blue.
        brand: {
          DEFAULT: "#3B7DF0", // primary
          deep: "#2A5BD0", // pressed states, badge text
          tint: "#E7F0FE", // light blue background
          ring: "#CFE0FC", // selection ring (calendar)
        },
        teal: { DEFAULT: "#2E8B7A", deep: "#227766", tint: "#EAF4F1", line: "#CDE6DF" },
        amber: { DEFAULT: "#E0A32B", deep: "#B07E1E", tint: "#FBF1DC", line: "#F0DFB6" },
        coral: {
          DEFAULT: "#E5574E",
          deep: "#C33A32",
          tint: "#FCEAE8",
          tint2: "#FEF4F3",
          line: "#F4C9C4",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        "4xl": "1.75rem",
        "5xl": "2.5rem",
      },
    },
  },
  plugins: [],
};

export default config;
