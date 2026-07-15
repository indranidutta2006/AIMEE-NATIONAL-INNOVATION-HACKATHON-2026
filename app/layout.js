import "./globals.css";

export const metadata = {
  title: "ApexTrader Sim",
  description: "Real-Time Global Market Sandbox with Twelve Data Ingestion",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased dark">
      <body className="min-h-full bg-slate-950 text-slate-100 flex flex-col">
        {children}
      </body>
    </html>
  );
}
