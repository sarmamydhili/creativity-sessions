import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Creativity Sessions",
  description: "Multi-session creativity workflow (Hydrating Jogger sample in UI copy)",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
