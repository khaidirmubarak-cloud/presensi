import type { Config } from "tailwindcss";

// Palet identik dengan dashboard-kinerja supaya kedua aplikasi (sama-sama bagian dari
// "sistem kepegawaian" yang memakai satu database) terasa satu keluarga visual. Nilai
// warna sendiri didefinisikan sebagai CSS variable di globals.css (light & dark, lewat
// [data-theme="dark"]) -- di sini cuma referensi variable-nya supaya modifier opacity
// Tailwind (mis. border-cardGreenDark/20) tetap jalan.
export default {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--c-ink) / <alpha-value>)",
        canvas: "rgb(var(--c-canvas) / <alpha-value>)",
        panel: "rgb(var(--c-panel) / <alpha-value>)",
        pine: "rgb(var(--c-pine) / <alpha-value>)",
        pineLight: "rgb(var(--c-pineLight) / <alpha-value>)",
        moss: "rgb(var(--c-moss) / <alpha-value>)",
        clay: "rgb(var(--c-clay) / <alpha-value>)",
        line: "rgb(var(--c-line) / <alpha-value>)",
        muted: "rgb(var(--c-muted) / <alpha-value>)",
        cardGreen: "rgb(var(--c-cardGreen) / <alpha-value>)",
        cardGreenDark: "rgb(var(--c-cardGreenDark) / <alpha-value>)",
        pill: "rgb(var(--c-pill) / <alpha-value>)",
      },
      fontFamily: {
        display: ["'Plus Jakarta Sans'", "Inter", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
      borderRadius: {
        card: "18px",
      },
      boxShadow: {
        card: "0 1px 2px rgb(16 24 40 / 0.04), 0 8px 24px rgb(16 24 40 / 0.06)",
        soft: "0 1px 2px rgb(16 24 40 / 0.05)",
        primary: "0 8px 20px rgb(47 91 234 / 0.28)",
      },
    },
  },
  plugins: [],
} satisfies Config;
