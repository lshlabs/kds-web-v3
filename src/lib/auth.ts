const ACCESS_TOKEN_KEY = "deeporder.accessToken";
const REFRESH_TOKEN_KEY = "deeporder.refreshToken";

export type TokenStorageMode = "local" | "session";

export type StoredTokens = {
  accessToken: string | null;
  refreshToken: string | null;
  storage: TokenStorageMode | null;
};

export function loadStoredTokens(): StoredTokens {
  const localAccessToken = window.localStorage.getItem(ACCESS_TOKEN_KEY);
  const localRefreshToken = window.localStorage.getItem(REFRESH_TOKEN_KEY);
  if (localAccessToken || localRefreshToken) {
    return {
      accessToken: localAccessToken,
      refreshToken: localRefreshToken,
      storage: "local",
    };
  }

  return {
    accessToken: window.sessionStorage.getItem(ACCESS_TOKEN_KEY),
    refreshToken: window.sessionStorage.getItem(REFRESH_TOKEN_KEY),
    storage:
      window.sessionStorage.getItem(ACCESS_TOKEN_KEY) || window.sessionStorage.getItem(REFRESH_TOKEN_KEY)
        ? "session"
        : null,
  };
}

export function saveStoredTokens(accessToken: string, refreshToken: string, persistent: boolean) {
  clearStoredTokens();
  const storage = persistent ? window.localStorage : window.sessionStorage;
  storage.setItem(ACCESS_TOKEN_KEY, accessToken);
  storage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function saveAccessToken(accessToken: string, storageMode: TokenStorageMode) {
  const storage = storageMode === "local" ? window.localStorage : window.sessionStorage;
  const otherStorage = storageMode === "local" ? window.sessionStorage : window.localStorage;
  storage.setItem(ACCESS_TOKEN_KEY, accessToken);
  otherStorage.removeItem(ACCESS_TOKEN_KEY);
}

export function clearStoredTokens() {
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  window.sessionStorage.removeItem(REFRESH_TOKEN_KEY);
}
