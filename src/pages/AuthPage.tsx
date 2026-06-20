import { useEffect, useRef, useState } from "react";
import { ChefHat } from "lucide-react";

import { API_ORIGIN, ApiError, apiLogin, apiRegister } from "../lib/api";
import type {
  AuthResponse,
  AuthStore,
  AuthUser,
  LoginRequest,
  RegisterRequest,
  RegisterResponse,
} from "../types";

type PreviewAuthAccount = {
  key: "owner" | "staff";
  label: string;
  description: string;
};

type AuthPageProps = {
  onLoginSuccess: (response: AuthResponse) => void;
  onRegisterSuccess: (response: RegisterResponse) => void;
  pendingInfo?: { user: AuthUser; store: AuthStore } | null;
  onBackFromPending?: () => void;
  previewAccounts?: PreviewAuthAccount[];
  onPreviewLogin?: (accountKey: "owner" | "staff") => void;
};

const REMEMBERED_EMAIL_KEY = "deeporder.kds.rememberedEmail";
const AUTO_LOGIN_KEY = "deeporder.kds.autoLogin";

const defaultLoginForm: LoginRequest = {
  email: "",
  password: "",
  autoLogin: false,
};

const defaultRegisterForm: RegisterRequest = {
  name: "",
  email: "",
  password: "",
  storeName: "",
  storePhone: "",
  zipNo: "",
  roadAddress: "",
  jibunAddress: "",
  addressDetail: "",
};

export function AuthPage({
  onLoginSuccess,
  onRegisterSuccess,
  pendingInfo,
  onBackFromPending,
  previewAccounts = [],
  onPreviewLogin,
}: AuthPageProps) {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [loginForm, setLoginForm] = useState(defaultLoginForm);
  const [registerForm, setRegisterForm] = useState(defaultRegisterForm);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [addressHint, setAddressHint] = useState<string | null>(null);
  const [rememberEmail, setRememberEmail] = useState(false);
  const [autoLogin, setAutoLogin] = useState(false);
  const [view, setView] = useState<"form" | "pending">(pendingInfo ? "pending" : "form");
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const rememberedEmail = window.localStorage.getItem(REMEMBERED_EMAIL_KEY);
    const rememberedAutoLogin = window.localStorage.getItem(AUTO_LOGIN_KEY) === "true";
    setAutoLogin(rememberedAutoLogin);
    if (!rememberedEmail) {
      setLoginForm((current) => ({ ...current, autoLogin: rememberedAutoLogin }));
      return;
    }

    setLoginForm((current) => ({ ...current, email: rememberedEmail, autoLogin: rememberedAutoLogin }));
    setRememberEmail(true);
  }, []);

  useEffect(() => {
    if (pendingInfo) {
      setView("pending");
      return;
    }

    setView("form");
  }, [pendingInfo]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== API_ORIGIN) return;
      const data = event.data as { type?: string; payload?: Partial<RegisterRequest> };
      if (data?.type !== "deeporder.juso.selected" || !data.payload) return;

      const payload = data.payload;
      setRegisterForm((current) => ({
        ...current,
        zipNo: payload.zipNo ?? current.zipNo,
        roadAddress: payload.roadAddress ?? current.roadAddress,
        jibunAddress: payload.jibunAddress ?? current.jibunAddress,
        addressDetail: payload.addressDetail ?? current.addressDetail,
      }));
      setAddressHint(null);
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  function switchTab(next: "login" | "register") {
    setTab(next);
    setErrorMessage(null);
    setAddressHint(null);
  }

  async function handleLoginSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await apiLogin({
        email: loginForm.email.trim(),
        password: loginForm.password,
        autoLogin,
      });

      if (rememberEmail) {
        window.localStorage.setItem(REMEMBERED_EMAIL_KEY, loginForm.email.trim());
      } else {
        window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }

      if (autoLogin) {
        window.localStorage.setItem(AUTO_LOGIN_KEY, "true");
      } else {
        window.localStorage.removeItem(AUTO_LOGIN_KEY);
      }

      onLoginSuccess(response);
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : "로그인에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegisterSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await apiRegister({
        name: registerForm.name.trim(),
        email: registerForm.email.trim(),
        password: registerForm.password,
        storeName: registerForm.storeName.trim(),
        storePhone: registerForm.storePhone.trim(),
        zipNo: registerForm.zipNo.trim(),
        roadAddress: registerForm.roadAddress.trim(),
        jibunAddress: registerForm.jibunAddress.trim(),
        addressDetail: registerForm.addressDetail.trim(),
      });
      onRegisterSuccess(response);
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : "회원가입에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleAddressSearch() {
    const popupUrl = `${API_ORIGIN}/api/address/juso-popup?origin=${encodeURIComponent(window.location.origin)}`;
    const popup = window.open(
      popupUrl,
      "deeporder-juso-popup",
      "width=570,height=620,noopener=no,resizable=yes,scrollbars=yes",
    );

    if (!popup) {
      setAddressHint("팝업이 차단되었습니다. 팝업 차단을 해제하고 다시 시도해주세요.");
      return;
    }

    popup.focus();
  }

  function handleBack() {
    setView("form");
    onBackFromPending?.();
    window.setTimeout(() => emailRef.current?.focus(), 0);
  }

  const pendingUser = pendingInfo?.user ?? null;
  const pendingStore = pendingInfo?.store ?? null;

  const showPendingView = view === "pending" && Boolean(pendingInfo);
  const showFormView = !showPendingView;

  return (
    <main className="auth-shell">
      <section className="auth-hero" aria-hidden="true">
        <div className="auth-hero-top">
          <div className="auth-brand">
            <div className="auth-brand-icon">
              <ChefHat size={16} aria-hidden="true" />
            </div>
            <span className="auth-brand-name">DeepOrder KDS</span>
          </div>

          <div className="auth-hero-headline">
            <h1>
              주방을 더
              <br />
              스마트하게.
            </h1>
            <p>실시간 주문 접수부터 AI 분석까지. 매장 운영에 꼭 필요한 것만 담았습니다.</p>
          </div>
        </div>

        <p className="auth-hero-footer">© 2025 DeepOrder. All rights reserved.</p>
      </section>

      <section className="auth-card">
        <div className="auth-form-wrap">
          {showPendingView ? (
            <div className="auth-view auth-view--visible" aria-hidden={false}>
              <div className="pending-head">
                <span className="status-badge">승인 대기</span>
                <h2>가입 신청 완료</h2>
                <p>관리자 검토 후 승인되면 로그인할 수 있습니다.</p>
              </div>

              <div className="pending-summary">
                <div className="pending-row">
                  <span>매장명</span>
                  <strong>{pendingStore?.storeName ?? "-"}</strong>
                </div>
                <div className="pending-row">
                  <span>이름</span>
                  <strong>{pendingUser?.name ?? "-"}</strong>
                </div>
              </div>

              <button className="btn-outline auth-submit" onClick={handleBack} type="button">
                이전으로
              </button>
            </div>
          ) : null}

          {showFormView ? (
            <div className="auth-view auth-view--visible" aria-hidden={false}>
              <div className="auth-tabs" role="tablist" aria-label="인증 화면 선택">
              <button
                className={tab === "login" ? "auth-tab active" : "auth-tab"}
                onClick={() => switchTab("login")}
                role="tab"
                aria-selected={tab === "login"}
                type="button"
              >
                로그인
              </button>
              <button
                className={tab === "register" ? "auth-tab active" : "auth-tab"}
                onClick={() => switchTab("register")}
                role="tab"
                aria-selected={tab === "register"}
                type="button"
              >
                매장 가입
              </button>
            </div>

              {errorMessage ? (
              <div className="banner error" role="alert">
                {errorMessage}
              </div>
            ) : null}

              {previewAccounts.length > 0 && onPreviewLogin ? (
                <div className="banner" role="status">
                  <strong>개발용 프리뷰 모드</strong>
                  <div style={{ display: "grid", gap: "8px", marginTop: "8px" }}>
                    {previewAccounts.map((account) => (
                      <button
                        key={account.key}
                        className="btn-outline"
                        onClick={() => onPreviewLogin(account.key)}
                        type="button"
                      >
                        {account.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "grid", gap: "4px", marginTop: "8px" }}>
                    {previewAccounts.map((account) => (
                      <span key={`${account.key}-desc`} style={{ fontSize: "12px" }}>
                        {account.label}: {account.description}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="auth-tab-panels">
                <div
                  className={`auth-tab-panel${tab === "login" ? " auth-tab-panel--visible" : ""}`}
                  aria-hidden={tab !== "login"}
                >
                <form className="auth-form" onSubmit={handleLoginSubmit} noValidate>
                  <div className="field">
                    <label htmlFor="login-email">이메일</label>
                    <input
                      id="login-email"
                      ref={emailRef}
                      autoComplete="email"
                      name="email"
                      onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
                      required
                      type="email"
                      value={loginForm.email}
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="login-password">비밀번호</label>
                    <input
                      id="login-password"
                      autoComplete="current-password"
                      minLength={8}
                      name="password"
                      onChange={(event) =>
                        setLoginForm((current) => ({ ...current, password: event.target.value }))
                      }
                      required
                      type="password"
                      value={loginForm.password}
                    />
                  </div>

                  <div className="login-options">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={rememberEmail}
                        onChange={(event) => setRememberEmail(event.target.checked)}
                      />
                      아이디 저장
                    </label>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={autoLogin}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setAutoLogin(checked);
                          setLoginForm((current) => ({ ...current, autoLogin: checked }));
                        }}
                      />
                      자동 로그인
                    </label>
                  </div>

                  <button className="auth-submit" disabled={submitting} type="submit">
                    {submitting ? "로그인 중…" : "로그인"}
                  </button>
                </form>
              </div>

                <div
                  className={`auth-tab-panel${tab === "register" ? " auth-tab-panel--visible" : ""}`}
                  aria-hidden={tab !== "register"}
                >
                <form className="auth-form" onSubmit={handleRegisterSubmit} noValidate>
                  <div className="field">
                    <label htmlFor="reg-name">이름</label>
                    <input
                      id="reg-name"
                      name="name"
                      onChange={(event) => setRegisterForm((current) => ({ ...current, name: event.target.value }))}
                      required
                      value={registerForm.name}
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="reg-email">이메일</label>
                    <input
                      id="reg-email"
                      autoComplete="email"
                      name="email"
                      onChange={(event) => setRegisterForm((current) => ({ ...current, email: event.target.value }))}
                      required
                      type="email"
                      value={registerForm.email}
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="reg-password">비밀번호</label>
                    <input
                      id="reg-password"
                      autoComplete="new-password"
                      minLength={8}
                      name="password"
                      onChange={(event) =>
                        setRegisterForm((current) => ({ ...current, password: event.target.value }))
                      }
                      required
                      type="password"
                      value={registerForm.password}
                    />
                  </div>

                  <div className="field-row">
                    <div className="field">
                      <label htmlFor="reg-store-name">매장명</label>
                      <input
                        id="reg-store-name"
                        name="storeName"
                        onChange={(event) =>
                          setRegisterForm((current) => ({ ...current, storeName: event.target.value }))
                        }
                        required
                        value={registerForm.storeName}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="reg-phone">연락처</label>
                      <input
                        id="reg-phone"
                        name="storePhone"
                        onChange={(event) =>
                          setRegisterForm((current) => ({ ...current, storePhone: event.target.value }))
                        }
                        value={registerForm.storePhone}
                      />
                    </div>
                  </div>

                  <div className="field">
                    <label htmlFor="reg-store-address">매장주소</label>
                    <div className="field-inline">
                      <input
                        id="reg-store-address"
                        name="roadAddress"
                        readOnly
                        value={registerForm.roadAddress}
                        onChange={(event) =>
                          setRegisterForm((current) => ({ ...current, roadAddress: event.target.value }))
                        }
                      />
                      <button className="btn-outline" onClick={handleAddressSearch} type="button">
                        주소 검색
                      </button>
                    </div>
                  </div>

                  <div className="field">
                    <label htmlFor="reg-address-detail">상세주소</label>
                    <input
                      id="reg-address-detail"
                      name="addressDetail"
                      onChange={(event) =>
                        setRegisterForm((current) => ({ ...current, addressDetail: event.target.value }))
                      }
                      value={registerForm.addressDetail}
                    />
                  </div>

                  {addressHint ? (
                    <div className="banner" role="status">
                      {addressHint}
                    </div>
                  ) : null}

                  <button className="auth-submit" disabled={submitting} type="submit">
                    {submitting ? "신청 중…" : "가입 신청"}
                  </button>
                </form>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
