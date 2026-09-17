import "./globals.css";
export const metadata = {
  title: "DIAM APAC · Sales Performance",
  description: "APAC sales performance and China entity reporting",
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
