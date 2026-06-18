import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ApiError, apiGetKdsOrders, apiUpdateOrderStatus } from "../lib/api";
import { isDevPreviewAccessToken, loadPreviewOrders, updatePreviewOrderStatus } from "../lib/dev-preview";
import type { AnalysisAction, AuthSession, Order, OrderAIAnalysis, OrderStatus } from "../types";

const POLLING_INTERVAL_MS = 3000;
type BoardTab = "RECEIVED" | "DONE" | "MY_TASKS" | "STATS" | "SETTINGS" | "STAFF";

type StoreStatus = "OPEN" | "PAUSED" | "CLOSED";

type StaffMember = {
  id: string;
  name: string;
  email: string;
  pin: string;
  role: "staff" | "manager";
  active: boolean;
  createdAt: string;
};

type AssignedMenu = {
  id: string; // client-side uuid
  name: string;
};

type SoundOption = "none" | "bell" | "chime" | "beep";

type BreaktimeConfig = {
  enabled: boolean;
  startHour: number;
  startMinute: number;
  durationMinutes: number;
};

type SettingsState = {
  notificationsEnabled: boolean;
  sound: SoundOption;
  breaktime: BreaktimeConfig;
  autoAccept: boolean;
};

type KdsPageProps = {
  session: AuthSession;
  onLogout: () => Promise<void>;
  onUnauthorized: () => Promise<string | null>;
};

export function KdsPage({ session, onLogout, onUnauthorized }: KdsPageProps) {
  const isDevPreview = isDevPreviewAccessToken(session.accessToken);
  const localOnlyFeatureMessage = "이 기능은 아직 백엔드 연동 전입니다.";
  const localOnlyPanelDescription = "현재 패널은 UI/UX 검증용으로만 노출되며, 실제 저장/변경 기능은 아직 연결되지 않았습니다.";
  const [orders, setOrders] = useState<Order[]>(() => (isDevPreview ? loadPreviewOrders() : []));
  const [loading, setLoading] = useState(!isDevPreview);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "error" | "info" } | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [activeTab, setActiveTab] = useState<BoardTab>("RECEIVED");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  // Store status (local state — no backend)
  const [storeStatus, setStoreStatus] = useState<StoreStatus>("OPEN");
  const [storeStatusPopup, setStoreStatusPopup] = useState(false);
  const [pauseMinutes, setPauseMinutes] = useState(10);
  // Assigned menus for "내 업무" tab (local state — no backend)
  const [assignedMenus, setAssignedMenus] = useState<AssignedMenu[]>([
    { id: "demo-1", name: "짜장면" },
    { id: "demo-2", name: "짬뽕" },
  ]);
  // completedItemIds lifted to page level so MyTasksPanel can react to KDS completions
  const [completedItemIds, setCompletedItemIds] = useState<Set<number>>(new Set());
  // Front-only hidden order ids (제거 처리)
  const [hiddenOrderIds, setHiddenOrderIds] = useState<Set<number>>(new Set());
  // Context menu
  const [contextMenu, setContextMenu] = useState<{ orderId: number; x: number; y: number } | null>(null);
  // Modals
  const [detailOrderId, setDetailOrderId] = useState<number | null>(null);
  const [removeOrderId, setRemoveOrderId] = useState<number | null>(null);
  const [clearDoneConfirm, setClearDoneConfirm] = useState(false);
  // Settings (local state only — no backend yet)
  const [settings, setSettings] = useState<SettingsState>({
    notificationsEnabled: true,
    sound: "bell",
    breaktime: { enabled: false, startHour: 15, startMinute: 0, durationMinutes: 60 },
    autoAccept: false,
  });
  // Change-password modal
  const [pwModal, setPwModal] = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSubmitting, setPwSubmitting] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<number | null>(null);

  function showToast(message: string, type: "error" | "info" = "error") {
    setToast({ message, type });
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => setToast(null), 4000);
  }

  function showLocalOnlyNotice(feature: string) {
    showToast(`${feature} 기능은 아직 백엔드 연동 전입니다.`, "info");
  }

  const fetchOrders = useCallback(async () => {
    if (isDevPreview) {
      setOrders(loadPreviewOrders());
      setLoading(false);
      return;
    }

    try {
      const data = await requestWithReauth(session.accessToken, onUnauthorized, apiGetKdsOrders);

      setOrders(data.orders);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        showToast("로그인이 만료되었습니다.");
        return;
      }
      showToast(error instanceof Error ? error.message : "주문 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [isDevPreview, onUnauthorized, session.accessToken]);

  useEffect(() => {
    void fetchOrders();
    const pollingTimer = window.setInterval(fetchOrders, POLLING_INTERVAL_MS);
    const clockTimer = window.setInterval(() => setNow(Date.now()), 1000);

    return () => {
      window.clearInterval(pollingTimer);
      window.clearInterval(clockTimer);
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, [fetchOrders]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) {
        setAccountOpen(false);
      }
      // Close context menu on any click outside
      const target = event.target as Element;
      if (!target.closest(".kds-context-menu")) {
        setContextMenu(null);
      }
      // Close store status popup on any click outside
      if (!target.closest(".kds-store-status") && !target.closest(".kds-store-status-popup")) {
        setStoreStatusPopup(false);
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const counts = useMemo(
    () => ({
      NEW: orders.filter((order) => order.status === "NEW").length,
      COOKING: orders.filter((order) => order.status === "COOKING").length,
      DONE: orders.filter((order) => order.status === "DONE").length,
      CANCELLED: orders.filter((order) => order.status === "CANCELLED").length,
    }),
    [orders],
  );

  async function handleManualRefresh() {
    setRefreshing(true);
    await fetchOrders();
    // Keep spin visible for at least 600ms so the animation is perceptible
    window.setTimeout(() => setRefreshing(false), 600);
  }

  const receivedOrders = useMemo(
    () =>
      orders
        .filter((order) => (order.status === "NEW" || order.status === "COOKING") && !hiddenOrderIds.has(order.id))
        // Unaccepted (NEW) first, then Accepted (COOKING); within each group sort by order time ascending
        .sort((left, right) => {
          const sw = statusWeight(left.status) - statusWeight(right.status);
          if (sw !== 0) return sw;
          const lt = parseApiTimestamp(left.ordered_at ?? left.created_at).getTime();
          const rt = parseApiTimestamp(right.ordered_at ?? right.created_at).getTime();
          return lt - rt;
        }),
    [orders, hiddenOrderIds],
  );

  const doneOrders = useMemo(
    () =>
      orders
        .filter((order) => order.status === "DONE" && !hiddenOrderIds.has(order.id))
        // Most recently completed first
        .sort((left, right) => {
          const lt = parseApiTimestamp(left.updated_at).getTime();
          const rt = parseApiTimestamp(right.updated_at).getTime();
          return rt - lt;
        }),
    [orders, hiddenOrderIds],
  );

  async function updateOrderStatus(orderId: number, status: OrderStatus) {
    setUpdatingOrderId(orderId);
    try {
      if (isDevPreview) {
        const nextOrders = updatePreviewOrderStatus(loadPreviewOrders(), orderId, status);
        setOrders(nextOrders);
        return;
      }

      await requestWithReauth(session.accessToken, onUnauthorized, (accessToken) =>
        apiUpdateOrderStatus(accessToken, orderId, status),
      );
      await fetchOrders();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "주문 상태를 변경하지 못했습니다.");
    } finally {
      setUpdatingOrderId(null);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    setAccountOpen(false);
    try {
      await onLogout();
    } finally {
      setLoggingOut(false);
    }
  }

  function updateSettings(partial: Partial<SettingsState>) {
    setSettings((prev) => ({ ...prev, ...partial }));
  }

  async function handleChangePassword() {
    setPwError(localOnlyFeatureMessage);
    showLocalOnlyNotice("비밀번호 변경");
  }

  function openLocalOnlyTab(tab: Extract<BoardTab, "MY_TASKS" | "STAFF" | "SETTINGS">, feature: string) {
    setActiveTab(tab);
    setSidebarOpen(false);
    showLocalOnlyNotice(feature);
  }

  const isManager = session.user.role === "STORE_OWNER" || session.user.role === "ADMIN";
  const activeOrders = activeTab === "RECEIVED" ? receivedOrders : doneOrders;
  const initials = (session.user.name ?? session.store.storeName ?? "?").slice(0, 2).toUpperCase();

  return (
    <div className="kds-shell">
      <nav className={`kds-sidebar${sidebarOpen ? " open" : ""}`} aria-label="메인 내비게이션">
        <button
          aria-label={sidebarOpen ? "메뉴 닫기" : "메뉴 열기"}
          className="kds-sidebar-toggle"
          onClick={() => setSidebarOpen((value) => !value)}
          type="button"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            {sidebarOpen ? (
              <>
                <line
                  x1="3"
                  y1="3"
                  x2="15"
                  y2="15"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <line
                  x1="15"
                  y1="3"
                  x2="3"
                  y2="15"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </>
            ) : (
              <>
                <line
                  x1="3"
                  y1="5"
                  x2="15"
                  y2="5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <line
                  x1="3"
                  y1="9"
                  x2="15"
                  y2="9"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <line
                  x1="3"
                  y1="13"
                  x2="15"
                  y2="13"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </>
            )}
          </svg>
          {sidebarOpen && <span className="kds-sidebar-toggle-label">닫기</span>}
        </button>

        <div className="kds-sidebar-nav">
          {/* Work — navigates to RECEIVED (the default work view) */}
          <button
            className={`kds-sidebar-item${(activeTab === "RECEIVED" || activeTab === "DONE" || activeTab === "MY_TASKS") ? " active" : ""}`}
            onClick={() => {
              setActiveTab("RECEIVED");
              setSidebarOpen(false);
            }}
            type="button"
            title="업무"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <rect x="3" y="2" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
              <line x1="6" y1="6" x2="12" y2="6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <line x1="6" y1="9" x2="12" y2="9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <line x1="6" y1="12" x2="10" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            {sidebarOpen && (
              <span>
                업무
                {counts.NEW + counts.COOKING > 0 ? (
                  <em className="kds-sidebar-badge">{counts.NEW + counts.COOKING}</em>
                ) : null}
              </span>
            )}
            {!sidebarOpen && counts.NEW + counts.COOKING > 0 ? (
              <em className="kds-sidebar-dot" aria-hidden="true" />
            ) : null}
          </button>

          {isManager ? (
            <button
              className={`kds-sidebar-item${activeTab === "STAFF" ? " active" : ""}`}
              onClick={() => openLocalOnlyTab("STAFF", "직원 관리")}
              type="button"
              title="직원"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <circle cx="6.5" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M1 15c0-3.04 2.46-5.5 5.5-5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="13" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M17 15c0-3.04-2.46-5.5-5.5-5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {sidebarOpen && <span>직원</span>}
            </button>
          ) : null}

          {isManager ? (
            <button
              className={`kds-sidebar-item${activeTab === "STATS" ? " active" : ""}`}
              onClick={() => { setActiveTab("STATS"); setSidebarOpen(false); }}
              type="button"
              title="통계"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <rect x="3" y="10" width="3" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <rect x="7.5" y="6" width="3" height="9" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <rect x="12" y="3" width="3" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              {sidebarOpen && <span>통계</span>}
            </button>
          ) : null}

          <button
            className={`kds-sidebar-item${activeTab === "SETTINGS" ? " active" : ""}`}
            onClick={() => openLocalOnlyTab("SETTINGS", "설정")}
            type="button"
            title="설정"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M9 2v1.5M9 14.5V16M2 9h1.5M14.5 9H16M3.93 3.93l1.06 1.06M13.01 13.01l1.06 1.06M3.93 14.07l1.06-1.06M13.01 4.99l1.06-1.06" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {sidebarOpen && <span>설정</span>}
          </button>
        </div>

        <div className="kds-sidebar-account" ref={accountRef}>
          {accountOpen ? (
            <div className="kds-account-popover">
              <div className="kds-account-popover-info">
                <div className="kds-account-avatar large">{initials}</div>
                <div>
                  <p className="kds-account-name">{session.user.name ?? session.store.storeName}</p>
                  <p className="kds-account-email">{session.user.email}</p>
                </div>
              </div>
              <div className="kds-account-popover-divider" />
              <button
                className="kds-account-popover-item signout"
                disabled={loggingOut}
                onClick={handleLogout}
                type="button"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M11 11l3-3-3-3"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <line x1="14" y1="8" x2="6" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                {loggingOut ? "로그아웃 중…" : "로그아웃"}
              </button>
            </div>
          ) : null}

          <button
            className={`kds-account-trigger${accountOpen ? " active" : ""}`}
            onClick={() => setAccountOpen((value) => !value)}
            type="button"
            title={session.store.storeName}
            aria-expanded={accountOpen}
          >
            <div className="kds-account-avatar">{initials}</div>
            {sidebarOpen ? <span className="kds-account-trigger-name">{session.store.storeName}</span> : null}
          </button>
        </div>
      </nav>

      <div className="kds-main">
        <header className="kds-topbar">
          <div className="kds-topbar-left">
            {/* Store status indicator */}
            <button
              className={`kds-store-status kds-store-status--${storeStatus.toLowerCase()}`}
              onClick={() => showLocalOnlyNotice("매장 상태 변경")}
              type="button"
              aria-label="매장 상태 변경"
            >
              <span className="kds-store-status-dot" aria-hidden="true" />
              {storeStatus === "OPEN" ? "영업중" : storeStatus === "PAUSED" ? "일시중지" : "영업종료"}
            </button>

            {/* Store status popup */}
            {storeStatusPopup ? (
              <div className="kds-store-status-popup" role="dialog" aria-modal="true" aria-label="매장 상태 변경">
                <p className="kds-store-status-popup-title">매장 상태</p>
                {(["OPEN", "PAUSED", "CLOSED"] as StoreStatus[]).map((s) => (
                  <button
                    key={s}
                    className={`kds-store-status-popup-btn${storeStatus === s ? " active" : ""}`}
                    onClick={() => { setStoreStatus(s); if (s !== "PAUSED") setStoreStatusPopup(false); }}
                    type="button"
                  >
                    <span className={`kds-store-status-dot kds-store-status-dot--${s.toLowerCase()}`} aria-hidden="true" />
                    {s === "OPEN" ? "영업중" : s === "PAUSED" ? "일시중지" : "영업종료"}
                  </button>
                ))}
                {storeStatus === "PAUSED" ? (
                  <div className="kds-pause-duration">
                    <span className="kds-pause-duration-label">일시중지 시간</span>
                    <div className="kds-pause-duration-control">
                      <button
                        className="kds-pause-stepper"
                        onClick={() => setPauseMinutes((m) => Math.max(10, m - 10))}
                        type="button"
                        aria-label="10분 감소"
                      >−</button>
                      <span className="kds-pause-duration-value">{pauseMinutes}분</span>
                      <button
                        className="kds-pause-stepper"
                        onClick={() => setPauseMinutes((m) => m + 10)}
                        type="button"
                        aria-label="10분 증가"
                      >+</button>
                    </div>
                    <button
                      className="kds-pause-confirm"
                      onClick={() => setStoreStatusPopup(false)}
                      type="button"
                    >확인</button>
                  </div>
                ) : null}
                <button
                  className="kds-store-status-popup-close"
                  onClick={() => setStoreStatusPopup(false)}
                  type="button"
                  aria-label="닫기"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            ) : null}
          </div>

          {/* Top tabs — only shown on the Work page */}
          {(activeTab === "RECEIVED" || activeTab === "DONE" || activeTab === "MY_TASKS") ? (
            <div className="kds-topbar-tabs" role="tablist">
              <button
                aria-selected={activeTab === "RECEIVED"}
                className={`kds-tab${activeTab === "RECEIVED" ? " active" : ""}`}
                onClick={() => setActiveTab("RECEIVED")}
                role="tab"
                type="button"
              >
                접수
                <span className="kds-tab-count">{receivedOrders.length}</span>
              </button>
              <button
                aria-selected={activeTab === "DONE"}
                className={`kds-tab${activeTab === "DONE" ? " active" : ""}`}
                onClick={() => setActiveTab("DONE")}
                role="tab"
                type="button"
              >
                완료
                <span className="kds-tab-count">{doneOrders.length}</span>
              </button>
              <button
                aria-selected={activeTab === "MY_TASKS"}
                className={`kds-tab${activeTab === "MY_TASKS" ? " active" : ""}`}
                onClick={() => openLocalOnlyTab("MY_TASKS", "내 업무")}
                role="tab"
                type="button"
              >
                내 업무
              </button>
            </div>
          ) : (
            <div className="kds-topbar-page-title">
              {activeTab === "STAFF" ? "직원 관리" : activeTab === "STATS" ? "통계" : "설정"}
            </div>
          )}

          <div className="kds-topbar-right">
            {activeTab === "DONE" && doneOrders.length > 0 ? (
              <button
                aria-label="완료 주문 내역 정리"
                className="kds-refresh-btn"
                onClick={() => showLocalOnlyNotice("완료 주문 정리")}
                type="button"
              >
                <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M7 8v6M10 8v6M13 8v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  <path d="M3 5h14M8 5V3h4v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M5 5l1 12h8l1-12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ) : null}
            <button
              aria-label="주문 새로고침"
              className={`kds-refresh-btn${loading || refreshing ? " spinning" : ""}`}
              disabled={loading || refreshing}
              onClick={() => void handleManualRefresh()}
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </header>

        {counts.CANCELLED > 0 ? (
          <div className="banner">취소 주문 {counts.CANCELLED}건은 보드에서 제외하고 집계로만 관리합니다.</div>
        ) : null}

        {activeTab === "MY_TASKS" ? (
          <div className="kds-panel-shell">
            <MyTasksPanel
              assignedMenus={assignedMenus}
              completedItemIds={completedItemIds}
              onAssignedMenusChange={setAssignedMenus}
              orders={orders}
            />
            <PanelFeatureGate title="내 업무는 아직 읽기 전용입니다." description={localOnlyPanelDescription} />
          </div>
        ) : activeTab === "STAFF" && isManager ? (
          <div className="kds-panel-shell">
            <StaffPanel />
            <PanelFeatureGate title="직원 관리는 아직 읽기 전용입니다." description={localOnlyPanelDescription} />
          </div>
        ) : activeTab === "STATS" ? (
          <StatsPanel orders={orders} />
        ) : activeTab === "SETTINGS" ? (
          <div className="kds-panel-shell">
            <SettingsPanel
              settings={settings}
              onUpdate={updateSettings}
              onChangePasswordClick={() => { setPwModal(true); setPwError(null); setPwCurrent(""); setPwNew(""); setPwConfirm(""); }}
            />
            <PanelFeatureGate title="설정 저장 기능은 아직 연동되지 않았습니다." description={localOnlyPanelDescription} />
          </div>
        ) : (
          <section className="kds-board" aria-label="주문 보드">
            {activeOrders.length === 0 ? (
              <div className="kds-empty">
                {activeTab === "RECEIVED" ? "접수된 주문이 없습니다" : "완료된 주문이 없습니다"}
              </div>
            ) : (
              <div className="kds-lane">
                {activeOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    completedItemIds={completedItemIds}
                    now={now}
                    onContextMenu={(orderId, x, y) => setContextMenu({ orderId, x, y })}
                    onToggleItemDone={() => showLocalOnlyNotice("메뉴 완료 체크")}
                    onUpdateStatus={updateOrderStatus}
                    order={order}
                    updating={updatingOrderId === order.id}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {/* Context menu */}
      {contextMenu ? (
        <div
          className="kds-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
        >
          <button
            className="kds-context-menu-item"
            onClick={() => {
              setDetailOrderId(contextMenu.orderId);
              setContextMenu(null);
            }}
            role="menuitem"
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
              <line x1="8" y1="7" x2="8" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="8" cy="5" r="0.8" fill="currentColor" />
            </svg>
            상세정보
          </button>
          <button
            className="kds-context-menu-item danger"
            onClick={() => {
              showLocalOnlyNotice("주문 제거");
              setContextMenu(null);
            }}
            role="menuitem"
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M5.5 6.5v5M8 6.5v5M10.5 6.5v5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M2.5 4h11M6 4V2.5h4V4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 4l.8 9.5h6.4L12 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            제거
          </button>
        </div>
      ) : null}

      {/* Detail modal */}
      {detailOrderId !== null ? (() => {
        const order = orders.find((o) => o.id === detailOrderId);
        if (!order) return null;
        const totalAmount = order.items.reduce((sum, item) => sum + (item.total_price ?? 0), 0);
        return (
          <div className="kds-modal-backdrop" onClick={() => setDetailOrderId(null)}>
            <div className="kds-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="주문 상세정보">
              <div className="kds-modal-head">
                <h2 className="kds-modal-title">주문 상세정보</h2>
                <button className="kds-modal-close" onClick={() => setDetailOrderId(null)} type="button" aria-label="닫기">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <line x1="2" y1="2" x2="12" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    <line x1="12" y1="2" x2="2" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <div className="kds-modal-body">
                <div className="kds-detail-rows">
                  <div className="kds-detail-row"><span>주문번호</span><strong>#{order.order_number ?? order.id}</strong></div>
                  <div className="kds-detail-row"><span>주문 시간</span><strong>{order.ordered_at ? formatDetailTime(order.ordered_at) : formatDetailTime(order.created_at)}</strong></div>
                  <div className="kds-detail-row"><span>플랫폼</span><strong>{getOrderTypeLabel(order.platform)} ({order.platform})</strong></div>
                  {totalAmount > 0 ? (
                    <div className="kds-detail-row"><span>결제금액</span><strong>{totalAmount.toLocaleString()}원</strong></div>
                  ) : null}
                </div>
                <div className="kds-detail-section-label">메뉴</div>
                <div className="kds-detail-items">
                  {order.items.map((item) => (
                    <div className="kds-detail-item" key={item.id}>
                      <span className="kds-detail-item-qty">{item.quantity}</span>
                      <div>
                        <div className="kds-detail-item-name">{item.name}</div>
                        {item.options.length > 0 ? (
                          <ul className="kds-detail-item-options">
                            {item.options.map((opt, i) => <li key={i}>{opt}</li>)}
                          </ul>
                        ) : null}
                      </div>
                      {item.total_price ? (
                        <span className="kds-detail-item-price">{item.total_price.toLocaleString()}원</span>
                      ) : null}
                    </div>
                  ))}
                </div>
                {order.customer_request ? (
                  <>
                    <div className="kds-detail-section-label">요청사항</div>
                    <p className="kds-detail-text">{order.customer_request}</p>
                  </>
                ) : null}
                {order.delivery_request ? (
                  <>
                    <div className="kds-detail-section-label">배달 요청</div>
                    <p className="kds-detail-text">{order.delivery_request}</p>
                  </>
                ) : null}
                <div className="kds-detail-section-label kds-detail-sensitive-label">민감정보</div>
                <div className="kds-detail-rows">
                  {(() => {
                    const store = (session as AuthSession).store;
                    return (
                      <>
                        <div className="kds-detail-row"><span>주소</span><strong>{store.roadAddress ?? store.jibunAddress ?? "-"}{store.addressDetail ? ` ${store.addressDetail}` : ""}</strong></div>
                        <div className="kds-detail-row"><span>연락처</span><strong>{store.phone ?? "-"}</strong></div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        );
      })() : null}

      {/* Remove confirm modal */}
      {removeOrderId !== null ? (
        <div className="kds-modal-backdrop" onClick={() => setRemoveOrderId(null)}>
          <div className="kds-modal kds-modal--sm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="kds-modal-head">
              <h2 className="kds-modal-title">주문 제거</h2>
            </div>
            <div className="kds-modal-body">
              <p className="kds-modal-desc">주문을 제거하시겠습니까?</p>
            </div>
            <div className="kds-modal-foot">
              <button
                className="kds-modal-btn secondary"
                onClick={() => setRemoveOrderId(null)}
                type="button"
              >
                아니오
              </button>
              <button
                className="kds-modal-btn danger"
                onClick={() => {
                  setHiddenOrderIds((prev) => new Set(prev).add(removeOrderId));
                  setRemoveOrderId(null);
                }}
                type="button"
              >
                예
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Clear done confirm modal */}
      {clearDoneConfirm ? (
        <div className="kds-modal-backdrop" onClick={() => setClearDoneConfirm(false)}>
          <div className="kds-modal kds-modal--sm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="kds-modal-head">
              <h2 className="kds-modal-title">완료 내역 정리</h2>
            </div>
            <div className="kds-modal-body">
              <p className="kds-modal-desc">주문완료 내역을 삭제할까요?</p>
            </div>
            <div className="kds-modal-foot">
              <button
                className="kds-modal-btn secondary"
                onClick={() => setClearDoneConfirm(false)}
                type="button"
              >
                아니오
              </button>
              <button
                className="kds-modal-btn danger"
                onClick={() => {
                  const doneIds = orders.filter((o) => o.status === "DONE").map((o) => o.id);
                  setHiddenOrderIds((prev) => {
                    const next = new Set(prev);
                    doneIds.forEach((id) => next.add(id));
                    return next;
                  });
                  setClearDoneConfirm(false);
                }}
                type="button"
              >
                예
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Change password modal */}
      {pwModal ? (
        <div className="kds-modal-backdrop" onClick={() => setPwModal(false)}>
          <div className="kds-modal kds-modal--sm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="비밀번호 변경">
            <div className="kds-modal-head">
              <h2 className="kds-modal-title">비밀번호 변경</h2>
              <button className="kds-modal-close" onClick={() => setPwModal(false)} type="button" aria-label="닫기">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <line x1="2" y1="2" x2="12" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  <line x1="12" y1="2" x2="2" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="kds-modal-body">
              <div className="kds-settings-field">
                <label className="kds-settings-label" htmlFor="pw-current">현재 비밀번호</label>
                <input id="pw-current" type="password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} placeholder="현재 비밀번호" autoComplete="current-password" />
              </div>
              <div className="kds-settings-field">
                <label className="kds-settings-label" htmlFor="pw-new">새 비밀번호</label>
                <input id="pw-new" type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} placeholder="8자 이상" autoComplete="new-password" />
              </div>
              <div className="kds-settings-field">
                <label className="kds-settings-label" htmlFor="pw-confirm">새 비밀번호 확인</label>
                <input id="pw-confirm" type="password" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} placeholder="비밀번호 재입력" autoComplete="new-password" />
              </div>
              {pwError ? <p className="kds-settings-error">{pwError}</p> : null}
              <p className="kds-settings-hint">변경 성공 시 현재 세션이 로그아웃됩니다.</p>
            </div>
            <div className="kds-modal-foot">
              <button className="kds-modal-btn secondary" onClick={() => setPwModal(false)} type="button">취소</button>
              <button className="kds-modal-btn primary" disabled={pwSubmitting} onClick={() => void handleChangePassword()} type="button">
                {pwSubmitting ? "변경중…" : "변경"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div
          className={`kds-toast${toast.type === "error" ? " error" : ""}`}
          role="alert"
          aria-live="assertive"
        >
          {toast.type === "error" ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4" />
              <line x1="7" y1="4" x2="7" y2="7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <circle cx="7" cy="9.5" r="0.7" fill="currentColor" />
            </svg>
          ) : null}
          <span>{toast.message}</span>
          <button className="kds-toast-close" onClick={() => setToast(null)} type="button" aria-label="닫기">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ) : null}
    </div>
  );
}

async function requestWithReauth<T>(
  accessToken: string,
  onUnauthorized: () => Promise<string | null>,
  request: (token: string) => Promise<T>,
) {
  try {
    return await request(accessToken);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) {
      throw error;
    }

    const nextAccessToken = await onUnauthorized();
    if (!nextAccessToken) {
      throw error;
    }
    return request(nextAccessToken);
  }
}

// Threshold: cards with >3 items use 2-column item layout
const ITEMS_2COL_THRESHOLD = 4;

function OrderCard({
  completedItemIds,
  now,
  onContextMenu,
  onToggleItemDone,
  onUpdateStatus,
  order,
  updating,
}: {
  completedItemIds: Set<number>;
  now: number;
  onContextMenu: (orderId: number, x: number, y: number) => void;
  onToggleItemDone: (itemId: number) => void;
  onUpdateStatus: (orderId: number, status: OrderStatus) => Promise<void>;
  order: Order;
  updating: boolean;
}) {
  const longPressTimerRef = useRef<number | null>(null);

  const elapsed = formatElapsed(now, order.ordered_at ?? order.created_at);
  const elapsedMinutes = getElapsedMinutes(now, order.ordered_at ?? order.created_at);
  const allergyRiskItemIds = getAllergyRiskItemIds(order.aiAnalysis);
  const isUrgent = elapsedMinutes >= 15;
  const isWarning = elapsedMinutes >= 8 && elapsedMinutes < 15;
  const orderTypeLabel = getOrderTypeLabel(order.platform);
  const use2Col = order.items.length >= ITEMS_2COL_THRESHOLD;

  function handlePointerDown(e: React.PointerEvent<HTMLElement>) {
    if (e.button !== 0) return; // only primary button for long press
    longPressTimerRef.current = window.setTimeout(() => {
      onContextMenu(order.id, e.clientX, e.clientY);
    }, 600);
  }

  function handlePointerUp() {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function handleContextMenu(e: React.MouseEvent<HTMLElement>) {
    e.preventDefault();
    onContextMenu(order.id, e.clientX, e.clientY);
  }

  return (
    <article
      className={`kds-card ${order.status.toLowerCase()}${isUrgent ? " urgent" : isWarning ? " warning" : ""}`}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onContextMenu={handleContextMenu}
    >
      <div className="kds-card-head">
        <div className="kds-card-head-left">
          <span className="kds-order-num">#{order.order_number ?? order.id}</span>
          <span className={`kds-elapsed-badge${isUrgent ? " urgent" : isWarning ? " warning" : ""}`}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M6 3.5V6L7.5 7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            {elapsed} 경과
          </span>
        </div>
        <span className="kds-order-type">{orderTypeLabel}</span>
      </div>

      <div className={`kds-items${use2Col ? " kds-items--2col" : ""}`}>
        {order.items.map((item, idx) => {
          const isDone = completedItemIds.has(item.id);
          const isLast = idx === order.items.length - 1;
          return (
            <div
              className={`kds-item${allergyRiskItemIds.has(item.id) ? " allergy-risk" : ""}${isDone ? " item-done" : ""}${isLast ? " kds-item--last" : ""}`}
              key={item.id}
              onClick={() => onToggleItemDone(item.id)}
              role="button"
              tabIndex={0}
              aria-pressed={isDone}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onToggleItemDone(item.id); }}
            >
              <span className={`kds-item-qty${isDone ? " done" : ""}`}>{item.quantity}</span>
              <div className="kds-item-body">
                <span className={`kds-item-name${isDone ? " done" : ""}`}>{item.name}</span>
                {item.options.length > 0 ? (
                  <ul className="kds-item-options" aria-label="옵션">
                    {item.options.map((option, index) => (
                      <li key={`${item.id}-${index}`}>{option}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <RequestPanel analysis={order.aiAnalysis} customerRequest={order.customer_request} />

      {order.status === "NEW" ? (
        <button
          className="kds-action-btn"
          disabled={updating}
          onClick={() => void onUpdateStatus(order.id, "COOKING")}
          type="button"
        >
          {updating ? "변경중…" : "조리 시작"}
        </button>
      ) : null}
      {order.status === "COOKING" ? (
        <button
          className="kds-action-btn complete"
          disabled={updating}
          onClick={() => void onUpdateStatus(order.id, "DONE")}
          type="button"
        >
          {updating ? "변경중…" : "완료"}
        </button>
      ) : null}
    </article>
  );
}

function PanelFeatureGate({ title, description }: { title: string; description: string }) {
  return (
    <div className="kds-panel-feature-gate" aria-hidden="true">
      <div className="kds-panel-feature-gate-card">
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    </div>
  );
}

function RequestPanel({
  analysis,
  customerRequest,
}: {
  analysis: OrderAIAnalysis | null;
  customerRequest: string | null;
}) {
  const rawText = customerRequest?.trim() ?? "";
  if (!analysis && !rawText) {
    return null;
  }

  if (!analysis) {
    return (
      <div className="kds-request-panel">
        <span className="kds-request-label">요청사항</span>
        <p className="kds-request-text">{rawText}</p>
      </div>
    );
  }

  const actions = analysis.kitchenActions ?? [];
  const hasActions = actions.length > 0;
  const hasRaw = rawText.length > 0;
  if (!hasActions && !hasRaw) {
    return null;
  }

  return (
    <div className={`kds-request-panel${analysis.needsHumanCheck ? " needs-check" : ""}`}>
      {analysis.needsHumanCheck ? (
        <span className="kds-request-label urgent">AI 주의 요청</span>
      ) : (
        <span className="kds-request-label">요청사항</span>
      )}
      {hasActions ? (
        <div className="kds-action-chips">
          {actions.map((action, index) => (
            <span className={`kds-chip ${getActionTone(action)}`} key={`${action.displayText}-${index}`}>
              {action.displayText}
            </span>
          ))}
        </div>
      ) : null}
      {hasRaw ? <p className="kds-request-text">{rawText}</p> : null}
    </div>
  );
}

// ─────────────────────────────────────────────
// Staff Panel
// ─────────────────────────────────────────────
const DEMO_STAFF: StaffMember[] = [
  { id: "s1", name: "김민준", email: "minjun@example.com", pin: "1234", role: "staff", active: true, createdAt: "2025-01-10T09:00:00" },
  { id: "s2", name: "이서연", email: "seoyeon@example.com", pin: "5678", role: "manager", active: true, createdAt: "2025-01-12T10:30:00" },
  { id: "s3", name: "박지호", email: "jiho@example.com", pin: "9012", role: "staff", active: false, createdAt: "2025-02-01T14:00:00" },
];

type StaffModalMode =
  | { type: "add" }
  | { type: "edit"; member: StaffMember }
  | { type: "pin"; member: StaffMember }
  | { type: "deactivate"; member: StaffMember };

function StaffPanel() {
  const [staffList, setStaffList] = useState<StaffMember[]>(DEMO_STAFF);
  const [modal, setModal] = useState<StaffModalMode | null>(null);
  const [form, setForm] = useState({ name: "", email: "", role: "staff" as StaffMember["role"] });
  const [formError, setFormError] = useState<string | null>(null);
  const [pinVisible, setPinVisible] = useState<string | null>(null);

  function openAdd() {
    setForm({ name: "", email: "", role: "staff" });
    setFormError(null);
    setModal({ type: "add" });
  }

  function openEdit(member: StaffMember) {
    setForm({ name: member.name, email: member.email, role: member.role });
    setFormError(null);
    setModal({ type: "edit", member });
  }

  function saveStaff() {
    if (!form.name.trim()) { setFormError("이름을 입력하세요."); return; }
    if (!form.email.trim() || !form.email.includes("@")) { setFormError("올바른 이메일을 입력하세요."); return; }
    setFormError(null);

    if (modal?.type === "add") {
      const pin = String(Math.floor(1000 + Math.random() * 9000));
      const newMember: StaffMember = {
        id: `s${Date.now()}`,
        name: form.name.trim(),
        email: form.email.trim(),
        pin,
        role: form.role,
        active: true,
        createdAt: new Date().toISOString(),
      };
      setStaffList((prev) => [...prev, newMember]);
      setPinVisible(newMember.id);
    } else if (modal?.type === "edit") {
      setStaffList((prev) =>
        prev.map((m) => m.id === modal.member.id ? { ...m, name: form.name.trim(), email: form.email.trim(), role: form.role } : m),
      );
    }
    setModal(null);
  }

  function reissuePin(member: StaffMember) {
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    setStaffList((prev) => prev.map((m) => m.id === member.id ? { ...m, pin } : m));
    setPinVisible(member.id);
    setModal(null);
  }

  function toggleActive(member: StaffMember) {
    setStaffList((prev) => prev.map((m) => m.id === member.id ? { ...m, active: !m.active } : m));
    setModal(null);
  }

  const activeCount = staffList.filter((m) => m.active).length;

  return (
    <section className="kds-panel" aria-label="직원 관리">
      <div className="kds-my-tasks-head">
        <div className="kds-panel-head">
          <h2 className="kds-panel-title">직원 관리</h2>
          <p className="kds-panel-subtitle">총 {staffList.length}명 · 활성 {activeCount}명</p>
        </div>
        <button className="kds-add-menu-btn" onClick={openAdd} type="button">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
            <line x1="6.5" y1="1" x2="6.5" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <line x1="1" y1="6.5" x2="12" y2="6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          직원 추가
        </button>
      </div>

      {/* Staff list */}
      <div className="kds-staff-list">
        {staffList.map((member) => (
          <div className={`kds-staff-row${!member.active ? " inactive" : ""}`} key={member.id}>
            <div className="kds-staff-avatar" aria-hidden="true">
              {member.name.slice(0, 1)}
            </div>
            <div className="kds-staff-info">
              <div className="kds-staff-name">
                {member.name}
                <span className={`kds-staff-role-badge${member.role === "manager" ? " manager" : ""}`}>
                  {member.role === "manager" ? "매니저" : "직원"}
                </span>
                {!member.active ? <span className="kds-staff-inactive-badge">비활성</span> : null}
              </div>
              <div className="kds-staff-email">{member.email}</div>
            </div>
            <div className="kds-staff-pin-area">
              {pinVisible === member.id ? (
                <div className="kds-staff-pin-reveal">
                  <span className="kds-staff-pin-label">PIN</span>
                  <span className="kds-staff-pin-value">{member.pin}</span>
                  <button
                    className="kds-staff-pin-hide"
                    onClick={() => setPinVisible(null)}
                    type="button"
                    aria-label="PIN 숨기기"
                  >
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <line x1="2" y1="2" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      <line x1="12" y1="2" x2="2" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              ) : null}
            </div>
            <div className="kds-staff-actions">
              <button
                className="kds-staff-action-btn"
                onClick={() => setModal({ type: "pin", member })}
                title="PIN 발급"
                type="button"
              >
                PIN
              </button>
              <button
                className="kds-staff-action-btn"
                onClick={() => openEdit(member)}
                title="수정"
                type="button"
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                  <path d="M2 10l7-7 2 2-7 7H2v-2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                className={`kds-staff-action-btn${member.active ? " danger" : " restore"}`}
                onClick={() => setModal({ type: "deactivate", member })}
                title={member.active ? "비활성화" : "활성화"}
                type="button"
              >
                {member.active ? (
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                    <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.3" />
                    <line x1="4" y1="6.5" x2="9" y2="6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                    <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M4.5 6.5l2 2 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add / Edit modal */}
      {(modal?.type === "add" || modal?.type === "edit") ? (
        <div className="kds-modal-backdrop" onClick={() => setModal(null)}>
          <div
            className="kds-modal kds-modal--sm"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={modal.type === "add" ? "직원 추가" : "직원 정보 수정"}
          >
            <div className="kds-modal-head">
              <h2 className="kds-modal-title">{modal.type === "add" ? "직원 추가" : "직원 정보 수정"}</h2>
              <button className="kds-modal-close" onClick={() => setModal(null)} type="button" aria-label="닫기">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <line x1="2" y1="2" x2="12" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  <line x1="12" y1="2" x2="2" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="kds-modal-body">
              <div className="kds-settings-field">
                <label className="kds-settings-label" htmlFor="staff-name">이름</label>
                <input id="staff-name" type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="직원 이름" autoFocus />
              </div>
              <div className="kds-settings-field">
                <label className="kds-settings-label" htmlFor="staff-email">이메일</label>
                <input id="staff-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="이메일 주소" />
              </div>
              <div className="kds-settings-field">
                <label className="kds-settings-label">역할</label>
                <div className="kds-segmented">
                  {([["staff", "직원"], ["manager", "매니저"]] as const).map(([val, label]) => (
                    <button
                      key={val}
                      className={`kds-segmented-btn${form.role === val ? " active" : ""}`}
                      onClick={() => setForm((f) => ({ ...f, role: val }))}
                      type="button"
                    >{label}</button>
                  ))}
                </div>
              </div>
              {modal.type === "add" ? (
                <p className="kds-settings-hint">추가 후 4자리 PIN이 자동 발급됩니다.</p>
              ) : null}
              {formError ? <p className="kds-settings-error">{formError}</p> : null}
            </div>
            <div className="kds-modal-foot">
              <button className="kds-modal-btn secondary" onClick={() => setModal(null)} type="button">취소</button>
              <button className="kds-modal-btn primary" onClick={saveStaff} type="button">저장</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* PIN reissue modal */}
      {modal?.type === "pin" ? (
        <div className="kds-modal-backdrop" onClick={() => setModal(null)}>
          <div
            className="kds-modal kds-modal--sm"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="kds-modal-head">
              <h2 className="kds-modal-title">PIN 재발급</h2>
            </div>
            <div className="kds-modal-body">
              <p className="kds-modal-desc">
                <strong>{modal.member.name}</strong>의 PIN을 새로 발급하시겠습니까?<br />
                기존 PIN은 즉시 사용 불가 처리됩니다.
              </p>
            </div>
            <div className="kds-modal-foot">
              <button className="kds-modal-btn secondary" onClick={() => setModal(null)} type="button">취소</button>
              <button className="kds-modal-btn primary" onClick={() => reissuePin(modal.member)} type="button">발급</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Deactivate / Activate modal */}
      {modal?.type === "deactivate" ? (
        <div className="kds-modal-backdrop" onClick={() => setModal(null)}>
          <div
            className="kds-modal kds-modal--sm"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="kds-modal-head">
              <h2 className="kds-modal-title">{modal.member.active ? "직원 비활성화" : "직원 활성화"}</h2>
            </div>
            <div className="kds-modal-body">
              <p className="kds-modal-desc">
                <strong>{modal.member.name}</strong>을(를) {modal.member.active ? "비활성화" : "활성화"}하시겠습니까?
                {modal.member.active ? " 비활성화된 직원은 로그인할 수 없습니다." : ""}
              </p>
            </div>
            <div className="kds-modal-foot">
              <button className="kds-modal-btn secondary" onClick={() => setModal(null)} type="button">취소</button>
              <button
                className={`kds-modal-btn${modal.member.active ? " danger" : " primary"}`}
                onClick={() => toggleActive(modal.member)}
                type="button"
              >
                {modal.member.active ? "비활성화" : "활성화"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ─────────────────────────────────────────────
// My Tasks Panel
// ─────────────────────────────────────────────
type MenuModalMode = { type: "add" } | { type: "edit"; menu: AssignedMenu };

function MyTasksPanel({
  assignedMenus,
  completedItemIds,
  onAssignedMenusChange,
  orders,
}: {
  assignedMenus: AssignedMenu[];
  completedItemIds: Set<number>;
  onAssignedMenusChange: (menus: AssignedMenu[]) => void;
  orders: Order[];
}) {
  const [menuModal, setMenuModal] = useState<MenuModalMode | null>(null);
  const [menuInput, setMenuInput] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AssignedMenu | null>(null);

  // Items from active (NEW/COOKING) orders that match assigned menus
  const assignedNames = useMemo(() => new Set(assignedMenus.map((m) => m.name.trim())), [assignedMenus]);

  // Count remaining (not completed) items per assigned menu from active orders
  const remainingCounts = useMemo(() => {
    const counts = new Map<string, number>();
    assignedMenus.forEach((m) => counts.set(m.name, 0));
    orders
      .filter((o) => o.status === "NEW" || o.status === "COOKING")
      .forEach((order) => {
        order.items.forEach((item) => {
          const key = item.name.trim();
          if (assignedNames.has(key) && !completedItemIds.has(item.id)) {
            counts.set(key, (counts.get(key) ?? 0) + item.quantity);
          }
        });
      });
    return counts;
  }, [assignedMenus, assignedNames, completedItemIds, orders]);

  // History rows: all order items matching assigned menus, sorted newest first
  type HistoryRow = {
    orderNumber: string;
    menuName: string;
    quantity: number;
    timestamp: string;
    status: "진행중" | "완료";
    itemId: number;
  };

  const historyRows = useMemo<HistoryRow[]>(() => {
    const rows: HistoryRow[] = [];
    orders
      .filter((o) => o.status === "NEW" || o.status === "COOKING" || o.status === "DONE")
      .forEach((order) => {
        order.items.forEach((item) => {
          if (!assignedNames.has(item.name.trim())) return;
          rows.push({
            orderNumber: order.order_number ?? String(order.id),
            menuName: item.name,
            quantity: item.quantity,
            timestamp: order.ordered_at ?? order.created_at,
            status: order.status === "DONE" || completedItemIds.has(item.id) ? "완료" : "진행중",
            itemId: item.id,
          });
        });
      });
    // newest first
    rows.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return rows;
  }, [assignedNames, completedItemIds, orders]);

  function openAdd() {
    setMenuInput("");
    setMenuModal({ type: "add" });
  }

  function openEdit(menu: AssignedMenu) {
    setMenuInput(menu.name);
    setMenuModal({ type: "edit", menu });
  }

  function saveMenu() {
    const name = menuInput.trim();
    if (!name) return;
    if (menuModal?.type === "add") {
      onAssignedMenusChange([...assignedMenus, { id: `menu-${Date.now()}`, name }]);
    } else if (menuModal?.type === "edit") {
      onAssignedMenusChange(assignedMenus.map((m) => (m.id === menuModal.menu.id ? { ...m, name } : m)));
    }
    setMenuModal(null);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    onAssignedMenusChange(assignedMenus.filter((m) => m.id !== deleteTarget.id));
    setDeleteTarget(null);
  }

  function formatHistoryTime(timestamp: string) {
    const d = parseApiTimestamp(timestamp);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString("ko-KR", {
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <section className="kds-panel" aria-label="내 업무">
      {/* Header */}
      <div className="kds-my-tasks-head">
        <div className="kds-panel-head">
          <h2 className="kds-panel-title">내 업무</h2>
          <p className="kds-panel-subtitle">담당 메뉴의 진행 중 수량</p>
        </div>
        <button className="kds-add-menu-btn" onClick={openAdd} type="button">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
            <line x1="6.5" y1="1" x2="6.5" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <line x1="1" y1="6.5" x2="12" y2="6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          메뉴 추가
        </button>
      </div>

      {/* Menu summary cards */}
      {assignedMenus.length === 0 ? (
        <div className="kds-my-tasks-empty">
          <p>담당 메뉴가 없습니다. [메뉴 추가]를 눌러 추가하세요.</p>
        </div>
      ) : (
        <div className="kds-menu-cards">
          {assignedMenus.map((menu) => {
            const count = remainingCounts.get(menu.name) ?? 0;
            return (
              <div className={`kds-menu-card${count === 0 ? " inactive" : ""}`} key={menu.id}>
                <div className="kds-menu-card-actions">
                  <button
                    className="kds-menu-card-btn"
                    onClick={() => openEdit(menu)}
                    title="수정"
                    type="button"
                    aria-label={`${menu.name} 수정`}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="M2 9.5l6.5-6.5 2 2L4 11.5H2V9.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    className="kds-menu-card-btn danger"
                    onClick={() => setDeleteTarget(menu)}
                    title="삭제"
                    type="button"
                    aria-label={`${menu.name} 삭제`}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                      <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
                <span className="kds-menu-card-name">{menu.name}</span>
                <span className="kds-menu-card-count">{count}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* History table */}
      <div className="kds-history-section">
        <h3 className="kds-stats-section-title">업무 히스토리</h3>
        {historyRows.length === 0 ? (
          <p className="kds-stats-empty">관련 주문 내역이 없습니다.</p>
        ) : (
          <div className="kds-history-table-wrap">
            <table className="kds-history-table">
              <thead>
                <tr>
                  <th>주문번호</th>
                  <th>메뉴</th>
                  <th>갯수</th>
                  <th>시각</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map((row, idx) => (
                  <tr key={`${row.orderNumber}-${row.itemId}-${idx}`} className={row.status === "완료" ? "row-done" : ""}>
                    <td className="cell-order-num">{row.orderNumber}</td>
                    <td>{row.menuName}</td>
                    <td className="cell-qty">{row.quantity}</td>
                    <td className="cell-time">{formatHistoryTime(row.timestamp)}</td>
                    <td>
                      <span className={`kds-status-chip ${row.status === "완료" ? "done" : "active"}`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit menu modal */}
      {menuModal ? (
        <div className="kds-modal-backdrop" onClick={() => setMenuModal(null)}>
          <div
            className="kds-modal kds-modal--sm"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={menuModal.type === "add" ? "담당 메뉴 추가" : "담당 메뉴 수정"}
          >
            <div className="kds-modal-head">
              <h2 className="kds-modal-title">{menuModal.type === "add" ? "담당 메뉴 추가" : "담당 메뉴 수정"}</h2>
              <button className="kds-modal-close" onClick={() => setMenuModal(null)} type="button" aria-label="닫기">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <line x1="2" y1="2" x2="12" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  <line x1="12" y1="2" x2="2" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="kds-modal-body">
              <div className="kds-settings-field">
                <label className="kds-settings-label" htmlFor="menu-name-input">메뉴명</label>
                <input
                  id="menu-name-input"
                  type="text"
                  value={menuInput}
                  onChange={(e) => setMenuInput(e.target.value)}
                  placeholder="예: 짜장면"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") saveMenu(); }}
                />
              </div>
            </div>
            <div className="kds-modal-foot">
              <button className="kds-modal-btn secondary" onClick={() => setMenuModal(null)} type="button">취소</button>
              <button className="kds-modal-btn primary" disabled={!menuInput.trim()} onClick={saveMenu} type="button">저장</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Delete confirm modal */}
      {deleteTarget ? (
        <div className="kds-modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div
            className="kds-modal kds-modal--sm"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="kds-modal-head">
              <h2 className="kds-modal-title">담당 메뉴 삭제</h2>
            </div>
            <div className="kds-modal-body">
              <p className="kds-modal-desc">
                <strong>{deleteTarget.name}</strong> 담당 메뉴를 삭제하시겠습니까?
              </p>
            </div>
            <div className="kds-modal-foot">
              <button className="kds-modal-btn secondary" onClick={() => setDeleteTarget(null)} type="button">아니오</button>
              <button className="kds-modal-btn danger" onClick={confirmDelete} type="button">예</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ─────────────────────────────────────────────
// Stats Panel
// ─────────────────────────────────────────────
function StatsPanel({ orders }: { orders: Order[] }) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const todayOrders = orders.filter((o) => {
    const ts = o.ordered_at ?? o.created_at;
    return ts.startsWith(todayStr);
  });

  const doneOrders = todayOrders.filter((o) => o.status === "DONE");
  const totalRevenue = todayOrders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + (i.total_price ?? 0), 0), 0);

  // Menu count map
  const menuMap = new Map<string, number>();
  todayOrders.forEach((o) => {
    o.items.forEach((item) => {
      menuMap.set(item.name, (menuMap.get(item.name) ?? 0) + item.quantity);
    });
  });
  const sortedMenus = Array.from(menuMap.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <section className="kds-panel" aria-label="통계">
      <div className="kds-panel-head">
        <h2 className="kds-panel-title">오늘 통계</h2>
        <p className="kds-panel-subtitle">{todayStr}</p>
      </div>

      <div className="kds-stats-summary">
        <div className="kds-stat-card">
          <span className="kds-stat-label">총 주문</span>
          <span className="kds-stat-value">{todayOrders.length}<small>건</small></span>
        </div>
        <div className="kds-stat-card">
          <span className="kds-stat-label">완료</span>
          <span className="kds-stat-value accent">{doneOrders.length}<small>건</small></span>
        </div>
        <div className="kds-stat-card">
          <span className="kds-stat-label">총 매출</span>
          <span className="kds-stat-value">{totalRevenue > 0 ? totalRevenue.toLocaleString() : "-"}<small>{totalRevenue > 0 ? "원" : ""}</small></span>
        </div>
      </div>

      <div className="kds-stats-section">
        <h3 className="kds-stats-section-title">메뉴별 주문 수</h3>
        {sortedMenus.length === 0 ? (
          <p className="kds-stats-empty">오늘 주문된 메뉴가 없습니다.</p>
        ) : (
          <div className="kds-menu-stats">
            {sortedMenus.map(([name, count]) => {
              const max = sortedMenus[0][1];
              return (
                <div className="kds-menu-stat-row" key={name}>
                  <span className="kds-menu-stat-name">{name}</span>
                  <div className="kds-menu-stat-bar-wrap">
                    <div className="kds-menu-stat-bar" style={{ width: `${Math.round((count / max) * 100)}%` }} />
                  </div>
                  <span className="kds-menu-stat-count">{count}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// Settings Panel
// ─────────────────────────────────────────────
const SOUND_OPTIONS: { value: SoundOption; label: string }[] = [
  { value: "none", label: "없음" },
  { value: "bell", label: "벨" },
  { value: "chime", label: "차임" },
  { value: "beep", label: "비프" },
];

function SettingsPanel({
  settings,
  onUpdate,
  onChangePasswordClick,
}: {
  settings: SettingsState;
  onUpdate: (partial: Partial<SettingsState>) => void;
  onChangePasswordClick: () => void;
}) {
  function padHHMM(h: number, m: number) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  function parseHHMM(value: string) {
    const [h, m] = value.split(":").map(Number);
    return { hour: Number.isNaN(h) ? 0 : h, minute: Number.isNaN(m) ? 0 : m };
  }

  return (
    <section className="kds-panel" aria-label="설정">
      <div className="kds-panel-head">
        <h2 className="kds-panel-title">설정</h2>
      </div>

      <div className="kds-settings-groups">
        {/* 알림 */}
        <div className="kds-settings-group">
          <h3 className="kds-settings-group-title">알림</h3>

          <div className="kds-settings-row">
            <div className="kds-settings-row-info">
              <span className="kds-settings-row-label">알림</span>
              <span className="kds-settings-row-desc">주문 도착 시 알림을 받습니다</span>
            </div>
            <button
              className={`kds-toggle${settings.notificationsEnabled ? " on" : ""}`}
              onClick={() => onUpdate({ notificationsEnabled: !settings.notificationsEnabled })}
              type="button"
              role="switch"
              aria-checked={settings.notificationsEnabled}
            >
              <span className="kds-toggle-knob" />
            </button>
          </div>

          <div className="kds-settings-row">
            <div className="kds-settings-row-info">
              <span className="kds-settings-row-label">알림 사운드</span>
              <span className="kds-settings-row-desc">주문 도착 시 재생할 사운드</span>
            </div>
            <div className="kds-segmented">
              {SOUND_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={`kds-segmented-btn${settings.sound === opt.value ? " active" : ""}`}
                  disabled={!settings.notificationsEnabled}
                  onClick={() => onUpdate({ sound: opt.value })}
                  type="button"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 브레이크타임 */}
        <div className="kds-settings-group">
          <h3 className="kds-settings-group-title">브레이크타임</h3>

          <div className="kds-settings-row">
            <div className="kds-settings-row-info">
              <span className="kds-settings-row-label">브레이크타임 사용</span>
              <span className="kds-settings-row-desc">설정 시간에 자동으로 일시중지</span>
            </div>
            <button
              className={`kds-toggle${settings.breaktime.enabled ? " on" : ""}`}
              onClick={() => onUpdate({ breaktime: { ...settings.breaktime, enabled: !settings.breaktime.enabled } })}
              type="button"
              role="switch"
              aria-checked={settings.breaktime.enabled}
            >
              <span className="kds-toggle-knob" />
            </button>
          </div>

          {settings.breaktime.enabled ? (
            <div className="kds-settings-breaktime">
              <div className="kds-settings-field">
                <label className="kds-settings-label" htmlFor="bt-start">시작 시간</label>
                <input
                  id="bt-start"
                  type="time"
                  value={padHHMM(settings.breaktime.startHour, settings.breaktime.startMinute)}
                  onChange={(e) => {
                    const { hour, minute } = parseHHMM(e.target.value);
                    onUpdate({ breaktime: { ...settings.breaktime, startHour: hour, startMinute: minute } });
                  }}
                />
              </div>
              <div className="kds-settings-field">
                <label className="kds-settings-label" htmlFor="bt-duration">중지 시간 (분)</label>
                <input
                  id="bt-duration"
                  type="number"
                  min={5}
                  max={480}
                  value={settings.breaktime.durationMinutes}
                  onChange={(e) => onUpdate({ breaktime: { ...settings.breaktime, durationMinutes: Math.max(5, Number(e.target.value)) } })}
                />
              </div>
            </div>
          ) : null}
        </div>

        {/* 주문 자동수락 */}
        <div className="kds-settings-group">
          <h3 className="kds-settings-group-title">주문 처리</h3>

          <div className="kds-settings-row">
            <div className="kds-settings-row-info">
              <span className="kds-settings-row-label">주문 자동수락</span>
              <span className="kds-settings-row-desc">
                {settings.autoAccept ? "주문 수신 즉시 진행중 표시" : "수락 버튼을 눌러야 진행중 표시"}
              </span>
            </div>
            <button
              className={`kds-toggle${settings.autoAccept ? " on" : ""}`}
              onClick={() => onUpdate({ autoAccept: !settings.autoAccept })}
              type="button"
              role="switch"
              aria-checked={settings.autoAccept}
            >
              <span className="kds-toggle-knob" />
            </button>
          </div>
        </div>

        {/* 계정 */}
        <div className="kds-settings-group">
          <h3 className="kds-settings-group-title">계정</h3>
          <div className="kds-settings-row">
            <div className="kds-settings-row-info">
              <span className="kds-settings-row-label">비밀번호 변경</span>
              <span className="kds-settings-row-desc">변경 후 자동 로그아웃됩니다</span>
            </div>
            <button className="kds-settings-action-btn" onClick={onChangePasswordClick} type="button">
              변경
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function getOrderTypeLabel(platform: string) {
  const normalized = platform?.toLowerCase() ?? "";
  if (normalized.includes("delivery") || normalized.includes("배달")) {
    return "배달";
  }
  if (normalized.includes("takeout") || normalized.includes("포장") || normalized.includes("take")) {
    return "포장";
  }
  return "매장";
}

function getActionTone(action: AnalysisAction) {
  if (action.type === "ALLERGY" || action.type === "SAFETY_CHECK" || action.severity === "HIGH") {
    return "danger";
  }
  if (action.type === "COOKING_REQUEST" || action.type === "TASTE_ADJUSTMENT") {
    return "cook";
  }
  if (action.type === "EXCLUDE_INGREDIENT") {
    return "exclude";
  }
  return "neutral";
}

function getAllergyRiskItemIds(analysis: OrderAIAnalysis | null) {
  const ids = new Set<number>();
  analysis?.kitchenActions
    ?.filter((action) => action.type === "ALLERGY")
    .forEach((action) => action.matchedMenuItemIds?.forEach((id) => ids.add(id)));
  return ids;
}

function getElapsedMinutes(now: number, timestamp: string) {
  const start = parseApiTimestamp(timestamp).getTime();
  if (Number.isNaN(start)) {
    return 0;
  }
  return Math.floor((now - start) / 60000);
}

function formatElapsed(now: number, timestamp: string) {
  const start = parseApiTimestamp(timestamp).getTime();
  if (Number.isNaN(start)) {
    return "-";
  }

  const seconds = Math.max(0, Math.floor((now - start) / 1000));
  if (seconds < 60) {
    return `${seconds}초`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}분`;
  }

  return `${Math.floor(minutes / 60)}시간`;
}

function parseApiTimestamp(timestamp: string) {
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(timestamp)) {
    return new Date(timestamp);
  }
  return new Date(`${timestamp}Z`);
}

function statusWeight(status: OrderStatus) {
  if (status === "NEW") return 0;
  if (status === "COOKING") return 1;
  if (status === "DONE") return 2;
  return 3;
}

function formatDetailTime(timestamp: string) {
  const date = parseApiTimestamp(timestamp);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
