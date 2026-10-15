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
        brand: {
          primary:   "#003366",  // GoI Navy
          secondary: "#FF6600",  // Saffron
          success:   "#00843D",  // India Green
          light:     "#E8F0FB",
          muted:     "#6B7280",
        },
        bronze: {
          DEFAULT: "#CD7F32",
          light:   "#FEF3E2",
          dark:    "#A0522D",
        },
        silver: {
          DEFAULT: "#C0C0C0",
          light:   "#F3F4F6",
          dark:    "#9CA3AF",
        },
        gold: {
          DEFAULT: "#FFD700",
          light:   "#FEFCE8",
          dark:    "#B8860B",
        },
      },
      fontFamily: {
        sans: ["Inter", "Noto Sans Devanagari", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(0,0,0,.08), 0 1px 2px -1px rgba(0,0,0,.06)",
        "card-hover": "0 4px 12px 0 rgba(0,51,102,.12)",
      },
    },
  },
  plugins: [],
};
export default config;
