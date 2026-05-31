import '../styles/globals.css';

export const metadata = {
  title: 'Order Flow Factor Dashboard',
  description: 'Real-time order flow factor visualization and backtesting',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
