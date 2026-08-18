import type { Config } from "tailwindcss";

// Palet identik dengan dashboard-kinerja supaya kedua aplikasi (sama-sama bagian dari
// "sistem kepegawaian" yang memakai satu database) terasa satu keluarga visual.
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1C2521",
        canvas: "#F6F4EE",
        panel: "#FFFFFF",
        pine: "#2F4A3D",
        pineLight: "#E7EEE8",
        moss: "#5C8A6E",
        clay: "#B5651D",
        line: "#DCD7C9",
        muted: "#6B7268",
        cardGreen: "#178349",
        cardGreenDark: "#0F6337",
        pill: "#BFE3CE",
      },
      fontFamily: {
        display: ["'Plus Jakarta Sans'", "sans-serif"],
        body: ["'Plus Jakarta Sans'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
      borderRadius: {
        card: "14px",
      },
    },
  },
  plugins: [],
} satisfies Config;
