"use client";

import { useEffect, useState } from "react";

function SunIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 stroke-current">
      <circle cx="10" cy="10" r="3.5" strokeWidth="1.6" />
      <path
        d="M10 2v1.6M10 16.4V18M18 10h-1.6M3.6 10H2M15.5 4.5l-1.1 1.1M5.6 14.4l-1.1 1.1M15.5 15.5l-1.1-1.1M5.6 5.6 4.5 4.5"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 stroke-current">
      <path d="M17 11.3A7 7 0 0 1 8.7 3 7 7 0 1 0 17 11.3Z" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

// Sumber kebenaran tema adalah document.documentElement.dataset.theme (diset lebih dulu
// oleh inline script anti-flash di app/layout.tsx) -- komponen ini cuma baca/tulis situ
// langsung, tidak perlu context/provider terpisah untuk satu tombol.
export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    setTheme((document.documentElement.dataset.theme as "light" | "dark") ?? "light");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("theme", next);
    setTheme(next);
  }

  if (theme === null) {
    return <span className="h-9 w-9 shrink-0" />;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
      title={theme === "dark" ? "Mode terang" : "Mode gelap"}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line text-ink transition-colors hover:bg-cardGreenDark/10"
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
