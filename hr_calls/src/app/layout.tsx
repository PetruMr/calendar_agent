// /layout.tsx

// Serve ad utilizzare il font Geist e Geist Mono
// Importa i font da Google Fonts e li applica al layout globale

// In quanto sono dei bei font, li lascio così come erano impostati inizialmente
// da Next.js, con le variabili CSS per poterli usare in tutto il progetto

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HR Calls",
  description: "Web application per la gestione delle chiamate HR attraverso agente AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
