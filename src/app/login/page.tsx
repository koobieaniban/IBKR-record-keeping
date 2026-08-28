import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="mx-auto mt-24 max-w-sm">
      <h1 className="mb-4 text-xl font-semibold">Trade Journal</h1>
      <form action={login} className="space-y-3">
        <input type="hidden" name="next" value={params.next ?? "/"} />
        <input
          type="password"
          name="password"
          placeholder="Password"
          autoFocus
          className="w-full rounded border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700"
        />
        {params.error && <p className="text-sm text-red-600 dark:text-red-400">Wrong password.</p>}
        <button className="w-full rounded bg-neutral-900 px-3 py-2 text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900">
          Sign in
        </button>
      </form>
    </div>
  );
}
