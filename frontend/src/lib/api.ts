/**
 * API client for the Electronics Comparison Assistant backend.
 */

const API_BASE = "/api";

export interface SessionStartResponse {
  session_id: string;
  mode: string;
}

export interface ComparisonProduct {
  id: number;
  name: string;
  brand: string;
  category?: string;
}

export interface ComparisonField {
  name: string;
  display_name: string;
  values: Record<number, string | null>;
}

export interface ComparisonSection {
  name: string;
  fields: ComparisonField[];
}

export interface ComparisonTable {
  products: ComparisonProduct[];
  sections: ComparisonSection[];
}

export interface RecommendedProduct {
  id: number;
  name: string;
  brand: string;
  score: number;
  details?: Record<string, unknown>;
}

export interface ChatMessageResponse {
  session_id: string;
  role: string;
  content: string;
  mode?: string;
  comparison_table?: ComparisonTable;
  recommendations?: RecommendedProduct[];
  product_ids?: number[];
}

export interface ChatHistoryMessage {
  id: number;
  role: string;
  content: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

export interface ChatHistoryResponse {
  session_id: string;
  mode: string;
  messages: ChatHistoryMessage[];
}

export interface SessionInfo {
  session_id: string;
  mode: string;
  title: string;
  created_at: string;
}

export interface ProductSearchResult {
  id: number;
  name: string;
  slug?: string;
  brand: string;
  category: string;
}

export interface CategoryInfo {
  id: number;
  name: string;
  slug: string;
}

/** Helper to attach auth token */
async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem("access_token");
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  } as Record<string, string>;
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  
  return fetch(url, { ...options, headers });
}

/** Start a new chat session */
export async function startSession(
  mode: string = "compare_specific"
): Promise<SessionStartResponse> {
  const res = await fetchWithAuth(`${API_BASE}/session/start`, {
    method: "POST",
    body: JSON.stringify({ mode }),
  });
  if (res.status === 401) {
    window.location.href = "/auth";
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(`Failed to start session: ${res.status}`);
  return res.json();
}

/** Send a message and get response */
export async function sendMessage(
  sessionId: string,
  message: string
): Promise<ChatMessageResponse> {
  const res = await fetchWithAuth(`${API_BASE}/chat/message`, {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, message }),
  });
  if (res.status === 401) {
    window.location.href = "/auth";
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(`Failed to send message: ${res.status}`);
  return res.json();
}

/** Get full chat history */
export async function getHistory(
  sessionId: string
): Promise<ChatHistoryResponse> {
  const res = await fetchWithAuth(`${API_BASE}/session/history/${sessionId}`);
  if (res.status === 401) {
    window.location.href = "/auth";
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(`Failed to get history: ${res.status}`);
  return res.json();
}

/** Get list of all past sessions */
export async function getSessionsList(): Promise<SessionInfo[]> {
  const res = await fetchWithAuth(`${API_BASE}/session/list`);
  if (!res.ok) throw new Error(`Failed to list sessions: ${res.status}`);
  return res.json();
}

/** Delete a session */
export async function deleteSession(sessionId: string): Promise<void> {
  const res = await fetchWithAuth(`${API_BASE}/session/${sessionId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete session: ${res.status}`);
}

/** Compare specific products by IDs */
export async function compareProducts(
  productIds: number[]
): Promise<ComparisonTable> {
  const res = await fetchWithAuth(`${API_BASE}/compare/products`, {
    method: "POST",
    body: JSON.stringify(productIds),
  });
  if (!res.ok) throw new Error(`Failed to compare: ${res.status}`);
  return res.json();
}

/** Search products by name */
export async function searchProducts(
  query: string
): Promise<{ query: string; results: ProductSearchResult[] }> {
  const res = await fetchWithAuth(
    `${API_BASE}/products/search?q=${encodeURIComponent(query)}`
  );
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json();
}

/** Get all categories */
export async function getCategories(): Promise<CategoryInfo[]> {
  const res = await fetchWithAuth(`${API_BASE}/categories`);
  if (!res.ok) throw new Error(`Failed to get categories: ${res.status}`);
  return res.json();
}

/** Get product recommendations */
export async function getRecommendations(params: {
  category?: string;
  budget?: number;
  use_case?: string;
  filters?: Record<string, string>;
}): Promise<{ results: RecommendedProduct[]; total_candidates?: number }> {
  const res = await fetchWithAuth(`${API_BASE}/recommend`, {
    method: "POST",
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Failed to get recommendations: ${res.status}`);
  return res.json();
}
