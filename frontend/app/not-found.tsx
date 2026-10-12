import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-6 text-text-1">
      <div className="w-full max-w-md rounded-16 border border-border bg-surface p-8 text-center shadow-xs">
        <p className="text-sm font-medium text-accent">404</p>
        <h1 className="mt-2 font-jakarta text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-text-2">The page you requested does not exist.</p>
        <Link href="/" className="mt-6 inline-flex rounded-10 bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90">
          Back to home
        </Link>
      </div>
    </main>
  );
}
