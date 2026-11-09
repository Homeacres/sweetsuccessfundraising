export const metadata = { title: "Admin sign in", robots: { index: false, follow: false } };

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="page wrap" style={{ maxWidth: 480 }}>
      <h1>Admin</h1>
      <form className="panel" action="/api/admin/login" method="post">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
        {error === "1" && <p className="alert error">That password didn't match.</p>}
        {error === "config" && <p className="alert error">ADMIN_PASSWORD is not set on the server.</p>}
        <button className="btn btn-navy" type="submit" style={{ marginTop: 12 }}>Sign in</button>
      </form>
    </main>
  );
}
