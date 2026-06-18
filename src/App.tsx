import { useEffect, useState } from "react";

import { ApiError, apiGetCurrentUser, apiLogout, apiRefresh } from "./lib/api";
import { clearStoredTokens, loadStoredTokens, saveAccessToken, saveStoredTokens } from "./lib/auth";
import { AuthPage } from "./pages/AuthPage";
import { KdsPage } from "./pages/KdsPage";
import type { AuthResponse, AuthSession, CurrentUserResponse, RegisterResponse } from "./types";

export default function App() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [registeredPending, setRegisteredPending] = useState<RegisterResponse | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    void bootstrapSession();
  }, []);

  async function bootstrapSession() {
    const tokens = loadStoredTokens();
    if (!tokens.accessToken) {
      setBooting(false);
      return;
    }

    try {
      const current = await apiGetCurrentUser(tokens.accessToken);
      setSession(createSession(current, tokens.accessToken, tokens.refreshToken ?? "", tokens.storage === "local"));
      setRegisteredPending(null);
      setBootError(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && tokens.refreshToken) {
        const nextAccessToken = await reauthorize(tokens.refreshToken);
        if (nextAccessToken) {
          return;
        }
      }
      clearStoredTokens();
      setSession(null);
      setBootError(error instanceof Error ? error.message : "세션을 복원하지 못했습니다.");
    } finally {
      setBooting(false);
    }
  }

  async function reauthorize(overrideRefreshToken?: string) {
    const refreshToken = overrideRefreshToken ?? loadStoredTokens().refreshToken;
    if (!refreshToken) {
      clearStoredTokens();
      setSession(null);
      setRegisteredPending(null);
      return null;
    }

    try {
      const refreshed = await apiRefresh(refreshToken);
      const persistent = session?.autoLogin ?? loadStoredTokens().storage === "local";
      saveAccessToken(refreshed.accessToken, persistent ? "local" : "session");
      const current = await apiGetCurrentUser(refreshed.accessToken);
      setSession(createSession(current, refreshed.accessToken, refreshToken, persistent));
      setBootError(null);
      return refreshed.accessToken;
    } catch {
      clearStoredTokens();
      setSession(null);
      setRegisteredPending(null);
      return null;
    }
  }

  function handleLoginSuccess(response: AuthResponse) {
    saveStoredTokens(response.accessToken, response.refreshToken, response.autoLogin);
    setSession({
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      autoLogin: response.autoLogin,
      user: response.user,
      store: response.store,
    });
    setRegisteredPending(null);
    setBootError(null);
  }

  function handleRegisterSuccess(response: RegisterResponse) {
    clearStoredTokens();
    setSession(null);
    setRegisteredPending(response);
    setBootError(null);
  }

  async function handleLogout() {
    const refreshToken = session?.refreshToken ?? loadStoredTokens().refreshToken;
    try {
      if (refreshToken) {
        await apiLogout(refreshToken);
      }
    } catch {
      // Logout should clear the local session even if revoke fails.
    } finally {
      clearStoredTokens();
      setSession(null);
      setRegisteredPending(null);
    }
  }

  function handleBackFromPending() {
    clearStoredTokens();
    setSession(null);
    setRegisteredPending(null);
    setBootError(null);
  }

  if (booting) {
    return (
      <main className="auth-shell">
        <section className="status-card">
          <p className="eyebrow">AUTH SESSION</p>
          <h1>세션 확인 중</h1>
          <p className="auth-copy">저장된 토큰을 확인하고 매장 계정 상태를 복원하고 있습니다.</p>
        </section>
      </main>
    );
  }

  if (registeredPending) {
    return (
      <AuthPage
        onLoginSuccess={handleLoginSuccess}
        onRegisterSuccess={handleRegisterSuccess}
        pendingInfo={{ user: registeredPending.user, store: registeredPending.store }}
        onBackFromPending={handleBackFromPending}
      />
    );
  }

  if (!session) {
    return (
      <>
        {bootError ? <div className="boot-banner error">{bootError}</div> : null}
        <AuthPage onLoginSuccess={handleLoginSuccess} onRegisterSuccess={handleRegisterSuccess} />
      </>
    );
  }

  if (session.user.approvalStatus !== "APPROVED") {
    return (
      <AuthPage
        onLoginSuccess={handleLoginSuccess}
        onRegisterSuccess={handleRegisterSuccess}
        pendingInfo={{ user: session.user, store: session.store }}
        onBackFromPending={handleBackFromPending}
      />
    );
  }

  return <KdsPage onLogout={handleLogout} onUnauthorized={reauthorize} session={session} />;
}

function createSession(
  current: CurrentUserResponse,
  accessToken: string,
  refreshToken: string,
  autoLogin: boolean,
): AuthSession {
  return {
    accessToken,
    refreshToken,
    autoLogin,
    user: current.user,
    store: current.store,
  };
}
