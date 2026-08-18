"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const LINKS = [
  { href: "/admin/pegawai", label: "Pegawai" },
  { href: "/admin/master/golongan", label: "Golongan" },
  { href: "/admin/master/unit", label: "Unit" },
  { href: "/admin/master/jabatan", label: "Jabatan" },
  { href: "/admin/master/tukin-nonpns-grade", label: "Grade Non-ASN" },
  { href: "/admin/master/hari-libur", label: "Hari Libur" },
  { href: "/admin/master/ramadhan", label: "Ramadhan" },
];

export default function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="mb-8 flex flex-wrap items-center justify-between gap-3 border-b border-cardGreenDark/15 pb-4">
      <div className="flex flex-wrap gap-2">
        {LINKS.map((link) => {
          const active = pathname === link.href || pathname?.startsWith(link.href + "/");
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${
                active ? "bg-cardGreen text-canvas" : "text-ink hover:bg-cardGreenDark/10"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
      <button
        type="button"
        onClick={handleLogout}
        className="rounded-full border border-cardGreenDark/30 px-4 py-1.5 text-[12.5px] font-semibold text-ink hover:bg-cardGreenDark/10 transition-colors"
      >
        Keluar
      </button>
    </nav>
  );
}
