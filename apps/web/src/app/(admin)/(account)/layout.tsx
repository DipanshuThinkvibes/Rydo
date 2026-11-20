import { AccountFrame } from "@/components/account-hub";

/** Profile, Preferences, Security, Safety and Role share one identity header and tab bar. */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <AccountFrame>{children}</AccountFrame>;
}
