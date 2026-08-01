import 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email?: string;
        // Supabase user_metadata — set by signup (e.g. { username, display_name }).
        // We use it to back-fill a profiles row if the auth.users → profiles trigger
        // wasn't installed before the account existed.
        user_metadata?: Record<string, unknown>;
      };
    }
  }
}
