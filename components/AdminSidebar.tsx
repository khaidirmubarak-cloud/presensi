"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import ThemeToggle from "./ThemeToggle";

type NavItem = { href: string; label: string; icon?: string };
type NavGroup = { label: string; items: NavItem[] };

// Path SVG (viewBox 24, garis 1.8) untuk ikon menu utama.
const ICONS: Record<string, string> = {
  users: "M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 10.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6M20 19v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.6a3 3 0 0 1 0 5.8",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2",
  calendarX: "M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1M4 10h16M8 3v4M16 3v4M10 13.5l4 4M14 13.5l-4 4",
  moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5",
  wallet: "M4 7a2 2 0 0 1 2-2h12v4M4 7v11a2 2 0 0 0 2 2h14V9H6a2 2 0 0 1-2-2M16 14.5h.01",
  meal: "M7 3v8M4.5 3v5a2.5 2.5 0 0 0 5 0V3M7 11v10M17 21V3c-2 1.5-3 4-3 7v3h3",
};

const PRIMARY: NavItem[] = [
  { href: "/admin/pegawai", label: "Pegawai", icon: "users" },
  { href: "/admin/presensi", label: "Presensi", icon: "clock" },
  { href: "/admin/ketidakhadiran", label: "Ketidakhadiran", icon: "calendarX" },
  { href: "/admin/lembur", label: "Lembur", icon: "moon" },
  { href: "/admin/tukin", label: "Tunjangan Kinerja", icon: "wallet" },
  { href: "/admin/uang-makan", label: "Uang Makan", icon: "meal" },
];

function NavIcon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-[18px] w-[18px] shrink-0 stroke-current">
      <path d={ICONS[name]} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const GROUPS: NavGroup[] = [
  {
    label: "Data Master",
    items: [
      { href: "/admin/master/golongan", label: "Golongan" },
      { href: "/admin/master/unit", label: "Unit" },
      { href: "/admin/master/jabatan", label: "Jabatan" },
      { href: "/admin/master/tukin-nonpns-grade", label: "Grade Non-ASN" },
      { href: "/admin/master/tugas-belajar", label: "Tugas Belajar" },
      { href: "/admin/master/gaji-pokok", label: "Gaji Pokok" },
    ],
  },
  {
    label: "Referensi",
    items: [
      { href: "/admin/master/hari-libur", label: "Hari Libur" },
      { href: "/admin/master/ramadhan", label: "Ramadhan" },
      { href: "/admin/master/jam-kerja", label: "Jam Kerja" },
      { href: "/admin/master/jenis-cuti", label: "Jenis Cuti" },
      { href: "/admin/master/potongan-tukin", label: "Potongan Tukin" },
    ],
  },
];

function isActive(pathname: string | null, href: string): boolean {
  return pathname === href || (pathname?.startsWith(href + "/") ?? false);
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className={`h-4 w-4 shrink-0 stroke-current transition-transform ${open ? "rotate-90" : ""}`}
    >
      <path d="M7 5l6 5-6 5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HamburgerIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5 stroke-current">
      <path d="M3 5h14M3 10h14M3 15h14" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SidebarContent({ pathname, onNavigate }: { pathname: string | null; onNavigate?: () => void }) {
  const router = useRouter();

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const group of GROUPS) {
      initial[group.label] = group.items.some((item) => isActive(pathname, item.href));
    }
    return initial;
  });

  function toggleGroup(label: string) {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  // Gaya menu mengikuti LKH: item aktif berlatar biru muda dengan teks biru.
  const linkClass = (active: boolean) =>
    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] transition-colors ${
      active ? "bg-pineLight font-semibold text-pine" : "font-medium text-muted hover:bg-pineLight/60 hover:text-ink"
    }`;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-uin-palopo.jpg" alt="" width={40} height={41} className="h-10 w-10 shrink-0 rounded-xl bg-white object-contain p-0.5 shadow-soft" />
        <div className="leading-tight">
          <p className="font-display text-[15px] font-extrabold text-ink">Presensi & Kepegawaian</p>
          <p className="mt-0.5 text-[11.5px] text-muted">UIN Palopo</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <div className="flex flex-col gap-1">
          {PRIMARY.map((item) => (
            <Link key={item.href} href={item.href} onClick={onNavigate} className={linkClass(isActive(pathname, item.href))}>
              {item.icon && <NavIcon name={item.icon} />}
              {item.label}
            </Link>
          ))}
        </div>

        {GROUPS.map((group) => {
          const open = openGroups[group.label];
          return (
            <div key={group.label} className="mt-5">
              <button
                type="button"
                onClick={() => toggleGroup(group.label)}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[11px] font-bold uppercase tracking-wide text-muted"
              >
                {group.label}
                <ChevronIcon open={open} />
              </button>
              {open && (
                <div className="mt-1 flex flex-col gap-0.5 pl-1">
                  {group.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      className={linkClass(isActive(pathname, item.href))}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="flex items-center gap-2 border-t border-line px-3 py-4">
        <button
          type="button"
          onClick={handleLogout}
          className="flex-1 rounded-xl border border-line px-3 py-2 text-[12.5px] font-semibold text-ink transition-colors hover:bg-pineLight"
        >
          Keluar
        </button>
        <ThemeToggle />
      </div>
    </div>
  );
}

export default function AdminSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const desktopSidebar = useMemo(
    () => (
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-line bg-panel md:flex">
        <SidebarContent pathname={pathname} />
      </aside>
    ),
    [pathname],
  );

  return (
    <>
      {desktopSidebar}

      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-30 flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-panel text-ink shadow-soft md:hidden"
        aria-label="Buka menu"
      >
        <HamburgerIcon />
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-panel shadow-card">
            <SidebarContent pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
