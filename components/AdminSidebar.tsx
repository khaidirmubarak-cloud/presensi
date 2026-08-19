"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

type NavItem = { href: string; label: string };
type NavGroup = { label: string; items: NavItem[] };

const PRIMARY: NavItem[] = [
  { href: "/admin/pegawai", label: "Pegawai" },
  { href: "/admin/presensi", label: "Presensi" },
  { href: "/admin/ketidakhadiran", label: "Ketidakhadiran" },
  { href: "/admin/lembur", label: "Lembur" },
];

const GROUPS: NavGroup[] = [
  {
    label: "Data Master",
    items: [
      { href: "/admin/master/golongan", label: "Golongan" },
      { href: "/admin/master/unit", label: "Unit" },
      { href: "/admin/master/jabatan", label: "Jabatan" },
      { href: "/admin/master/tukin-nonpns-grade", label: "Grade Non-ASN" },
    ],
  },
  {
    label: "Referensi",
    items: [
      { href: "/admin/master/hari-libur", label: "Hari Libur" },
      { href: "/admin/master/ramadhan", label: "Ramadhan" },
      { href: "/admin/master/jam-kerja", label: "Jam Kerja" },
      { href: "/admin/master/jenis-cuti", label: "Jenis Cuti" },
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

  const linkClass = (active: boolean) =>
    `block rounded-lg px-3 py-2 text-[13.5px] font-semibold transition-colors ${
      active ? "bg-cardGreen text-canvas" : "text-ink hover:bg-cardGreenDark/10"
    }`;

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 py-6">
        <p className="font-display text-[15px] font-bold leading-tight text-ink">Presensi & Kepegawaian</p>
        <p className="mt-0.5 text-[11.5px] text-muted">UIN Palopo</p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <div className="flex flex-col gap-1">
          {PRIMARY.map((item) => (
            <Link key={item.href} href={item.href} onClick={onNavigate} className={linkClass(isActive(pathname, item.href))}>
              {item.label}
            </Link>
          ))}
        </div>

        {GROUPS.map((group) => {
          const open = openGroups[group.label];
          return (
            <div key={group.label} className="mt-4">
              <button
                type="button"
                onClick={() => toggleGroup(group.label)}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[11px] font-bold uppercase tracking-wide text-muted"
              >
                {group.label}
                <ChevronIcon open={open} />
              </button>
              {open && (
                <div className="mt-1 flex flex-col gap-1">
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

      <div className="border-t border-line px-3 py-4">
        <button
          type="button"
          onClick={handleLogout}
          className="w-full rounded-lg border border-cardGreenDark/30 px-3 py-2 text-[12.5px] font-semibold text-ink transition-colors hover:bg-cardGreenDark/10"
        >
          Keluar
        </button>
      </div>
    </div>
  );
}

export default function AdminSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const desktopSidebar = useMemo(
    () => (
      <aside className="hidden w-64 shrink-0 border-r border-line bg-panel md:flex">
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
        className="fixed left-4 top-4 z-30 flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-panel text-ink shadow-sm md:hidden"
        aria-label="Buka menu"
      >
        <HamburgerIcon />
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-panel shadow-lg">
            <SidebarContent pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
