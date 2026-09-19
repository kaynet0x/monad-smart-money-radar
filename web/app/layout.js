export const metadata = {
  title: 'Monad Smart Money Radar',
  description: 'Monitor smart money activity on Monad.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
