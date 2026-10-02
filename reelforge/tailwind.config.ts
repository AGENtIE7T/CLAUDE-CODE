import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#ff3d6e", dark: "#e02656", soft: "#ffe3ea" },
      },
    },
  },
  plugins: [],
};

export default config;
