import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Demos",
  description: "Live communal demo tracks.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-white text-black font-sans antialiased min-h-screen p-8">
        <header className="mb-16 font-mono text-sm">
          Demos
        </header>

        <main>
          {children}
        </main>
      </body>
    </html>
  );
}
