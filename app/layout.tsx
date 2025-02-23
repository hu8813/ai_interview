import "../styles/globals.css";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI-Powered Interviews",
  
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="scroll-smooth antialiased [font-feature-settings:'ss01']">
        
        {children}
      </body>
    </html>
  );
}
