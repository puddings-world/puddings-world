/** The section a path belongs to: `/projects/paperfact` is under `/projects`. */
export function isCurrent(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
