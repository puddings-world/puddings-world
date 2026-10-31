"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { isCurrent } from "@/lib/nav";

export type NavItem = { href: string; label: string };

export function NavLinks({ links }: { links: NavItem[] }) {
  const pathname = usePathname() ?? "/";
  const list = useRef<HTMLUListElement>(null);

  // On phones the list scrolls sideways; keep the current page in view.
  useEffect(() => {
    const current = list.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!list.current || !current || list.current.scrollWidth <= list.current.clientWidth) return;
    list.current.scrollTo({ left: current.offsetLeft - list.current.offsetLeft - 16, behavior: "smooth" });
  }, [pathname]);

  return (
    <ul
      ref={list}
      className="nav-scroll -mx-4 flex items-center gap-x-5 overflow-x-auto px-4 pb-1.5 text-sm sm:mx-0 sm:overflow-visible sm:px-0 sm:pb-0">
      {links.map((link) => (
        <li key={link.href} className="shrink-0">
          <Link
            href={link.href}
            aria-current={isCurrent(pathname, link.href) ? "page" : undefined}
            className="nav-link font-mono text-ink-secondary hover:text-ink-primary"
          >
            {link.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
