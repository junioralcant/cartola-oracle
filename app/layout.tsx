import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cartola Oracle",
  description: "Base do projeto para geracao automatizada de times do Cartola",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
