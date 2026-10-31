import Link from "next/link";
import { NavLinks } from "./NavLinks";

const LINKS = [
  { href: "/", label: "home" },
  { href: "/about", label: "about" },
  { href: "/interests", label: "interests" },
  { href: "/musings", label: "musings" },
  { href: "/projects", label: "projects" },
  { href: "/services", label: "services" },
  { href: "/playground", label: "playground" },
  { href: "/contact", label: "contact" },
];

export function Nav() {
  return (
    <nav className="sticky top-0 z-40 border-b border-bg-border bg-bg-base/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 pt-3 pb-1.5 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
        <Link
          href="/"
          className="w-fit font-mono text-sm font-semibold tracking-tight text-ink-primary transition-colors hover:text-accent"
        >
          puddingsworld
        </Link>
        <NavLinks links={LINKS.slice(1)} />
      </div>
    </nav>
  );
}
