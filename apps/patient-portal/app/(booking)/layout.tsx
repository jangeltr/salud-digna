import type { ReactNode } from "react";
import { AccountFrame } from "@/components/account-frame";

export default function BookingLayout({ children }: { children: ReactNode }) {
  return <AccountFrame>{children}</AccountFrame>;
}
