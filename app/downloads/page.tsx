import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Downloads",
  robots: { index: false, follow: true },
};

export default function DownloadsPage() {
  return (
    <main className="page py-20 [--col:42rem]">
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-accent">downloads</p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Shared by link.</h1>
      <p className="mt-6 text-base leading-relaxed text-ink-secondary">
        Files here aren&apos;t listed publicly. If someone sent you a download link, open it directly; it
        leads to the files meant for you. Looking for something else?{" "}
        <Link href="/contact" className="text-accent hover:underline">
          Ask me
        </Link>
        .
      </p>
    </main>
  );
}
