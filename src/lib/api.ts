import type {
  AuthResponse,
  CurrentUserResponse,
  KdsOrdersResponse,
  LoginRequest,
  OrderStatus,
  RefreshResponse,
  RegisterRequest,
  RegisterResponse,
} from "../types";

const API_URL = import.meta.env.VITE_DEEPORDER_API_URL ?? "http://127.0.0.1:8000";
export const API_ORIGIN = new URL(API_URL).origin;

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiLogin(payload: LoginRequest) {
  return request<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function apiRegister(payload: RegisterRequest) {
  return request<RegisterResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function apiRefresh(refreshToken: string) {
  return request<RefreshResponse>("/api/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });
}

export async function apiLogout(refreshToken: string) {
  await request<void>("/api/auth/logout", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });
}

export async function apiGetCurrentUser(accessToken: string) {
  return request<CurrentUserResponse>("/api/auth/me", {
    headers: createAuthHeaders(accessToken),
  });
}

export async function apiGetKdsOrders(accessToken: string) {
  return request<KdsOrdersResponse>("/api/kds/orders", {
    headers: createAuthHeaders(accessToken),
  });
}

export async function apiUpdateOrderStatus(accessToken: string, orderId: number, status: OrderStatus) {
  return request<{ id: number; status: OrderStatus }>(`/api/orders/${orderId}/status`, {
    method: "PATCH",
    headers: createAuthHeaders(accessToken),
    body: JSON.stringify({ status }),
  });
}

function createAuthHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

async function request<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new ApiError(response.status, await extractErrorMessage(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function extractErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as { detail?: string | Array<{ msg?: string }> };
    if (typeof data.detail === "string" && data.detail.trim()) {
      return data.detail;
    }
    if (Array.isArray(data.detail)) {
      return data.detail.map((item) => item.msg ?? "입력값을 확인해주세요.").join(", ");
    }
  } catch {
    return `요청 실패: ${response.status}`;
  }

  return `요청 실패: ${response.status}`;
}
