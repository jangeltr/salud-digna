"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type NavLinkProps = {
  href: string;
  className?: string;
  children: ReactNode;
};

export function NavLink({ href, className, children }: NavLinkProps) {
  const pathname = usePathname();
  const current = pathname === href ? "page" : pathname.startsWith(`${href}/`) ? "true" : undefined;

  return (
    <Link href={href} aria-current={current} className={className}>
      {children}
    </Link>
  );
}
