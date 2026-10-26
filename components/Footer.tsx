import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-bg-border">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-3 px-6 py-8 sm:flex-row sm:items-center">
        <div>
          <p className="font-serif text-sm italic tracking-[0.15em] text-ink-secondary">
            有點心，偏點心，存點心，留點心
          </p>
          <p className="mt-1 font-mono text-xs text-ink-muted">
            © {new Date().getFullYear()} puddingsworld
          </p>
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-2 font-mono text-xs">
          <li>
            <Link
              href="/contact"
              className="text-ink-muted transition-colors hover:text-accent"
            >
              contact
            </Link>
          </li>
          <li>
            <a
              href="https://github.com/puddings-world"
              target="_blank"
              rel="noreferrer"
              className="text-ink-muted transition-colors hover:text-accent"
            >
              github ↗
            </a>
          </li>
          <li>
            <a
              href="https://github.com/puddings-world/puddings-world"
              target="_blank"
              rel="noreferrer"
              className="text-ink-muted transition-colors hover:text-accent"
            >
              source ↗
            </a>
          </li>
        </ul>
      </div>
    </footer>
  );
}
