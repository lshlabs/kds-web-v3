import type { AuthResponse, AuthSession, AuthStore, AuthUser, CurrentUserResponse, Order, OrderStatus } from "../types";

export const DEV_PREVIEW_MODE = import.meta.env.VITE_KDS_DEV_PREVIEW === "true";

const PREVIEW_ACCESS_TOKEN_PREFIX = "dev-preview-access";
const PREVIEW_REFRESH_TOKEN_PREFIX = "dev-preview-refresh";
const PREVIEW_ORDERS_KEY = "deeporder.kds.previewOrders";

type PreviewAccountKey = "owner" | "staff";

export type PreviewAccount = {
  key: PreviewAccountKey;
  label: string;
  description: string;
  response: AuthResponse;
};

const baseStore: AuthStore = {
  id: 999,
  storeId: "STORE_PREVIEW",
  storeName: "DeepOrder Preview Store",
  phone: "02-0000-0000",
  zipNo: "04524",
  roadAddress: "서울 중구 프리뷰로 100",
  jibunAddress: "서울 중구 프리뷰동 100-1",
  addressDetail: "3층 테스트 주방",
  approvalStatus: "APPROVED",
};

function createPreviewUser(
  id: number,
  email: string,
  name: string,
  role: AuthUser["role"],
): AuthUser {
  return {
    id,
    email,
    name,
    role,
    approvalStatus: "APPROVED",
  };
}

function createPreviewAuthResponse(user: AuthUser, autoLogin = true): AuthResponse {
  return {
    accessToken: `${PREVIEW_ACCESS_TOKEN_PREFIX}:${user.role}:${user.id}`,
    refreshToken: `${PREVIEW_REFRESH_TOKEN_PREFIX}:${user.role}:${user.id}`,
    autoLogin,
    user,
    store: baseStore,
  };
}

export const PREVIEW_ACCOUNTS: PreviewAccount[] = [
  {
    key: "owner",
    label: "개발용 점주 계정",
    description: "점주 권한으로 직원/설정/통계 화면까지 모두 확인합니다.",
    response: createPreviewAuthResponse(createPreviewUser(901, "owner@dev.local", "프리뷰 점주", "STORE_OWNER")),
  },
  {
    key: "staff",
    label: "개발용 직원 계정",
    description: "직원 권한으로 기본 주문 보드 흐름만 확인합니다.",
    response: createPreviewAuthResponse(createPreviewUser(902, "staff@dev.local", "프리뷰 직원", "ADMIN")),
  },
];

export function getPreviewAccountByAccessToken(accessToken: string) {
  return PREVIEW_ACCOUNTS.find((account) => account.response.accessToken === accessToken) ?? null;
}

export function isDevPreviewAccessToken(accessToken: string | null | undefined) {
  return Boolean(accessToken?.startsWith(PREVIEW_ACCESS_TOKEN_PREFIX));
}

export function createPreviewSession(accountKey: PreviewAccountKey): AuthSession {
  const account = PREVIEW_ACCOUNTS.find((item) => item.key === accountKey) ?? PREVIEW_ACCOUNTS[0];
  return {
    accessToken: account.response.accessToken,
    refreshToken: account.response.refreshToken,
    autoLogin: account.response.autoLogin,
    user: account.response.user,
    store: account.response.store,
  };
}

export function createPreviewCurrentUser(accessToken: string): CurrentUserResponse | null {
  const account = getPreviewAccountByAccessToken(accessToken);
  if (!account) return null;
  return {
    user: account.response.user,
    store: account.response.store,
  };
}

function isoMinutesAgo(minutesAgo: number) {
  return new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
}

function createPreviewOrdersSeed(): Order[] {
  return [
    {
      id: 5001,
      platform: "MOCK_DELIVERY",
      store_id: baseStore.storeId,
      external_order_id: "PREVIEW_ORDER_5001",
      order_number: "PV1001",
      status: "NEW",
      customer_request: "치킨무는 1개만 주세요. 알레르기 때문에 땅콩류는 제외 부탁드립니다.",
      delivery_request: "문 앞에 두고 벨 눌러주세요.",
      ordered_at: isoMinutesAgo(3),
      created_at: isoMinutesAgo(3),
      updated_at: isoMinutesAgo(3),
      items: [
        {
          id: 5101,
          name: "후라이드치킨",
          quantity: 1,
          options: ["음료 추가: 받지 않음", "소스: 양념소스"],
          unit_price: 18000,
          total_price: 18000,
        },
        {
          id: 5102,
          name: "콜라 1.25L",
          quantity: 1,
          options: [],
          unit_price: 3000,
          total_price: 3000,
        },
      ],
      aiAnalysis: {
        summary: "알레르기 관련 요청과 포장 전달 요청이 감지되었습니다.",
        tags: ["알레르기", "배달요청"],
        cookingNotes: ["땅콩류 제외 여부 최종 확인"],
        packingNotes: ["문 앞 전달 요청 메모 동봉"],
        deliveryNotes: ["벨 알림 필요"],
        kitchenActions: [
          {
            type: "ALLERGY",
            label: "알레르기 주의",
            target: "후라이드치킨",
            displayText: "땅콩류 제외 여부 확인",
            severity: "HIGH",
            requiresHumanCheck: true,
            source: "preview",
            sourceText: "알레르기 때문에 땅콩류는 제외",
            matchedMenuItemIds: [5101],
          },
        ],
        packingActions: [],
        ignoredRequests: [],
        riskLevel: "HIGH",
        warnings: ["알레르기 요청은 최종 사람 확인 필요"],
        needsHumanCheck: true,
        analysisStatus: "COMPLETED",
      },
    },
    {
      id: 5002,
      platform: "MOCK_DELIVERY",
      store_id: baseStore.storeId,
      external_order_id: "PREVIEW_ORDER_5002",
      order_number: "PV1002",
      status: "COOKING",
      customer_request: "맵기 보통으로 부탁드립니다.",
      delivery_request: "기사님 도착 전 전화 부탁드립니다.",
      ordered_at: isoMinutesAgo(9),
      created_at: isoMinutesAgo(9),
      updated_at: isoMinutesAgo(4),
      items: [
        {
          id: 5201,
          name: "양념치킨",
          quantity: 1,
          options: ["맵기: 보통", "사이드: 감자튀김 추가"],
          unit_price: 21000,
          total_price: 21000,
        },
      ],
      aiAnalysis: {
        summary: "조리 강도 조절 요청이 있습니다.",
        tags: ["맵기조절"],
        cookingNotes: ["맵기 보통으로 조절"],
        packingNotes: [],
        deliveryNotes: ["기사 연락 요청"],
        kitchenActions: [
          {
            type: "TASTE_ADJUSTMENT",
            label: "맵기 조절",
            target: "양념치킨",
            displayText: "맵기 보통",
            severity: "MEDIUM",
            requiresHumanCheck: false,
            source: "preview",
            sourceText: "맵기 보통",
            matchedMenuItemIds: [5201],
          },
        ],
        packingActions: [],
        ignoredRequests: [],
        riskLevel: "MEDIUM",
        warnings: [],
        needsHumanCheck: false,
        analysisStatus: "COMPLETED",
      },
    },
    {
      id: 5003,
      platform: "MOCK_DELIVERY",
      store_id: baseStore.storeId,
      external_order_id: "PREVIEW_ORDER_5003",
      order_number: "PV1003",
      status: "DONE",
      customer_request: "감자튀김은 따로 포장해주세요.",
      delivery_request: null,
      ordered_at: isoMinutesAgo(18),
      created_at: isoMinutesAgo(18),
      updated_at: isoMinutesAgo(2),
      items: [
        {
          id: 5301,
          name: "치즈볼",
          quantity: 2,
          options: ["소스: 치즈 시즈닝"],
          unit_price: 5000,
          total_price: 10000,
        },
        {
          id: 5302,
          name: "감자튀김",
          quantity: 1,
          options: ["포장: 별도"],
          unit_price: 4000,
          total_price: 4000,
        },
      ],
      aiAnalysis: {
        summary: "포장 분리 요청이 있습니다.",
        tags: ["포장요청"],
        cookingNotes: [],
        packingNotes: ["감자튀김 별도 포장"],
        deliveryNotes: [],
        kitchenActions: [],
        packingActions: [
          {
            type: "COOKING_REQUEST",
            label: "포장 주의",
            target: "감자튀김",
            displayText: "감자튀김 별도 포장",
            severity: "LOW",
            requiresHumanCheck: false,
            source: "preview",
            sourceText: "감자튀김은 따로 포장",
            matchedMenuItemIds: [5302],
          },
        ],
        ignoredRequests: [],
        riskLevel: "LOW",
        warnings: [],
        needsHumanCheck: false,
        analysisStatus: "COMPLETED",
      },
    },
  ];
}

export function loadPreviewOrders() {
  const raw = window.localStorage.getItem(PREVIEW_ORDERS_KEY);
  if (!raw) {
    const seed = createPreviewOrdersSeed();
    savePreviewOrders(seed);
    return seed;
  }

  try {
    const parsed = JSON.parse(raw) as Order[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const seed = createPreviewOrdersSeed();
      savePreviewOrders(seed);
      return seed;
    }
    return parsed;
  } catch {
    const seed = createPreviewOrdersSeed();
    savePreviewOrders(seed);
    return seed;
  }
}

export function savePreviewOrders(orders: Order[]) {
  window.localStorage.setItem(PREVIEW_ORDERS_KEY, JSON.stringify(orders));
}

export function resetPreviewOrders() {
  const seed = createPreviewOrdersSeed();
  savePreviewOrders(seed);
  return seed;
}

export function updatePreviewOrderStatus(orders: Order[], orderId: number, status: OrderStatus) {
  const updatedAt = new Date().toISOString();
  const next = orders.map((order) => (order.id === orderId ? { ...order, status, updated_at: updatedAt } : order));
  savePreviewOrders(next);
  return next;
}
