import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config";
const AUTH_STORAGE_KEY = "the-blk-shelf-reader-session";

export type ReaderUser = {
  id: string;
  email?: string;
  user_metadata?: { display_name?: string };
};

export type ReaderSession = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at: number;
  user: ReaderUser;
};

type AuthPayload = Partial<ReaderSession> & Partial<ReaderUser> & {
  user?: ReaderUser;
  message?: string;
  msg?: string;
  error_description?: string;
  error_code?: string;
  code?: string | number;
};

function authError(payload: AuthPayload, fallback: string) {
  return payload.error_description || payload.msg || payload.message || fallback;
}

async function authRequest(path: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
    const payload = (await response.json().catch(() => ({}))) as AuthPayload;
    if (controller.signal.aborted) throw new Error("Request timed out");
    if (!response.ok) {
      const code = payload.code || payload.error_code;
      if (code === "email_address_not_authorized") {
        throw new Error("The email service isn't configured to send confirmation emails to this address yet. Please contact The BLK Shelf.");
      }
      if (code === "over_email_send_rate_limit") {
        throw new Error("The confirmation email sending limit has been reached. Please try again later.");
      }
      throw new Error(authError(payload, "We couldn't complete that request."));
    }
    return payload;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("The account service is taking too long to respond. Please try again.");
    }
    if (error instanceof TypeError) {
      throw new Error("Couldn't connect to the account service. Check your connection and try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function toSession(payload: AuthPayload): ReaderSession {
  if (!payload.access_token || !payload.refresh_token || !payload.user) {
    throw new Error("Your session could not be started. Please try again.");
  }
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_in: payload.expires_in,
    expires_at: Date.now() + Math.max(60, payload.expires_in || 3600) * 1000,
    user: payload.user,
  };
}

function saveSession(session: ReaderSession | null) {
  if (typeof window === "undefined") return;
  if (session) window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  else window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

export function readerDisplayName(session: ReaderSession) {
  return session.user.user_metadata?.display_name?.trim() || session.user.email || "Reader";
}

export async function createReaderAccount(name: string, email: string, password: string, redirectTo: string) {
  const payload = await authRequest(`/signup?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: "POST",
    body: JSON.stringify({ email, password, data: { display_name: name.trim() } }),
  });
  if (!payload.access_token) return null;
  const session = toSession(payload);
  saveSession(session);
  return session;
}

export async function resendReaderConfirmation(email: string, redirectTo: string) {
  const address = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    throw new Error("Enter the email address you used to create your account.");
  }
  await authRequest(`/resend?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: "POST",
    body: JSON.stringify({ type: "signup", email: address }),
  });
}

export async function signInReader(email: string, password: string) {
  const payload = await authRequest("/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const session = toSession(payload);
  saveSession(session);
  return session;
}

export async function restoreReaderSession() {
  if (typeof window === "undefined") return null;
  const saved = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!saved) return null;

  try {
    let session = JSON.parse(saved) as ReaderSession;
    if (!session.access_token || !session.refresh_token) throw new Error("Missing session");
    if (session.expires_at <= Date.now() + 60_000) {
      const payload = await authRequest("/token?grant_type=refresh_token", {
        method: "POST",
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      });
      session = toSession(payload);
    } else {
      const payload = await authRequest("/user", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      session.user = payload.user || (payload as ReaderUser);
    }
    saveSession(session);
    return session;
  } catch {
    saveSession(null);
    return null;
  }
}

export async function signOutReader(session: ReaderSession | null) {
  try {
    if (session?.access_token) {
      await authRequest("/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
    }
  } finally {
    saveSession(null);
  }
}
