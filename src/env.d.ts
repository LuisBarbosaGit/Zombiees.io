interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_GAME_API_URL?: string;
  readonly VITE_GAME_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
