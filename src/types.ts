export type OrderStatus = "NEW" | "COOKING" | "DONE" | "CANCELLED";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type AnalysisStatus = "PENDING" | "COMPLETED" | "FALLBACK" | "FAILED";
export type ApprovalStatus = "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
export type UserRole = "STORE_OWNER" | "ADMIN";

export type OrderItem = {
  id: number;
  name: string;
  quantity: number;
  options: string[];
  unit_price: number | null;
  total_price: number | null;
};

export type AnalysisAction = {
  type: "ALLERGY" | "EXCLUDE_INGREDIENT" | "TASTE_ADJUSTMENT" | "COOKING_REQUEST" | "SAFETY_CHECK" | string;
  label: string;
  target: string;
  displayText: string;
  severity: RiskLevel;
  requiresHumanCheck: boolean;
  source: string;
  sourceText: string;
  matchedMenuItemIds: number[];
};

export type OrderAIAnalysis = {
  summary: string;
  tags: string[];
  cookingNotes: string[];
  packingNotes: string[];
  deliveryNotes: string[];
  kitchenActions: AnalysisAction[];
  packingActions: AnalysisAction[];
  ignoredRequests: Array<{ type: string; text: string }>;
  riskLevel: RiskLevel;
  warnings: string[];
  needsHumanCheck: boolean;
  analysisStatus: AnalysisStatus;
};

export type Order = {
  id: number;
  platform: string;
  store_id: string;
  external_order_id: string;
  order_number: string;
  status: OrderStatus;
  customer_request: string | null;
  delivery_request: string | null;
  ordered_at: string | null;
  created_at: string;
  updated_at: string;
  items: OrderItem[];
  aiAnalysis: OrderAIAnalysis | null;
};

export type KdsOrdersResponse = {
  orders: Order[];
};

export type AuthUser = {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  approvalStatus: ApprovalStatus;
};

export type AuthStore = {
  id: number;
  storeId: string;
  storeName: string;
  phone: string | null;
  zipNo: string | null;
  roadAddress: string | null;
  jibunAddress: string | null;
  addressDetail: string | null;
  approvalStatus: ApprovalStatus;
};

export type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  autoLogin: boolean;
  user: AuthUser;
  store: AuthStore;
};

export type CurrentUserResponse = {
  user: AuthUser;
  store: AuthStore;
};

export type RegisterResponse = {
  user: AuthUser;
  store: AuthStore;
};

export type RefreshResponse = {
  accessToken: string;
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  autoLogin: boolean;
  user: AuthUser;
  store: AuthStore;
};

export type LoginRequest = {
  email: string;
  password: string;
  autoLogin: boolean;
};

export type RegisterRequest = {
  name: string;
  email: string;
  password: string;
  storeName: string;
  storePhone: string;
  zipNo: string;
  roadAddress: string;
  jibunAddress: string;
  addressDetail: string;
};
