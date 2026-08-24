import './globals.css';

export const metadata = {
  title: 'STRATUM Verified',
  description: 'Verified infrastructure lifecycle and provenance platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
