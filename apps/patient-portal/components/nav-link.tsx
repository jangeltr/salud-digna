"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { LinkPending } from "@/components/link-pending";

type NavLinkProps = {
  href: string;
  className?: string;
  /** Las rutas protegidas lo desactivan para no validar la sesión en cada precarga. */
  prefetch?: boolean;
  children: ReactNode;
};

export function NavLink({ href, className, prefetch, children }: NavLinkProps) {
  const pathname = usePathname();
  const current = pathname === href ? "page" : pathname.startsWith(`${href}/`) ? "true" : undefined;

  return (
    <Link
      href={href}
      prefetch={prefetch}
      aria-current={current}
      className={`${className ?? ""} has-[[data-pending]]:opacity-60`}
    >
      {children}
      <LinkPending />
    </Link>
  );
}
