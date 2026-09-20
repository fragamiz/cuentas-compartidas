import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cuentas Compartidas",
  description: "Reparte gastos y salda cuentas sin complicaciones.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
