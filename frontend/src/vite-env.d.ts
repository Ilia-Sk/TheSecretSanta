/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Publishable key of the Clerk instance (pk_test_... / pk_live_...). See README → Clerk. */
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
