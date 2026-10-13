"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Map, Factory, PawPrint } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Livemap", icon: Map },
  { href: "/productions", label: "Productions", icon: Factory },
  { href: "/animals", label: "Animals", icon: PawPrint },
] as const;

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 rounded-xl bg-stone-900/90 p-1.5 shadow-lg backdrop-blur">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex min-h-12 min-w-[7.5rem] flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors touch-manipulation",
              active
                ? "bg-lime-600 text-stone-950"
                : "text-stone-200 hover:bg-stone-800 active:bg-stone-700",
            )}
          >
            <Icon className="size-5 shrink-0" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
