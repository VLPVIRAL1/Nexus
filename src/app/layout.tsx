import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import "./workbench.css";

export const metadata: Metadata = {
  title: "Nexus Tax | Professional Preparation",
  description: "Professional tax preparation and review workstation",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
