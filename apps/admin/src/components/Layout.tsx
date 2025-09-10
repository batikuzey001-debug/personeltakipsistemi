export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <header>Header (placeholder)</header>
      <main>{children}</main>
    </div>
  );
}
