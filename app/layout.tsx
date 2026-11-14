import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "AccraFlow AI | Drainage Operations",
  description:
    "Accra urban drainage monitoring, incident reporting, maintenance and engineering scenario workspace. Phase 1 demonstration.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
