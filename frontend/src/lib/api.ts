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

/** Start a new chat session */
export async function startSession(
  mode: string = "compare_specific"
): Promise<SessionStartResponse> {
  const res = await fetch(`${API_BASE}/session/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  });
  if (!res.ok) throw new Error(`Failed to start session: ${res.status}`);
  return res.json();
}

/** Send a chat message and get AI response */
export async function sendMessage(
  sessionId: string,
  message: string
): Promise<ChatMessageResponse> {
  const res = await fetch(`${API_BASE}/chat/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, message }),
  });
  if (!res.ok) throw new Error(`Failed to send message: ${res.status}`);
  return res.json();
}

/** Get chat history for a session */
export async function getHistory(
  sessionId: string
): Promise<ChatHistoryResponse> {
  const res = await fetch(`${API_BASE}/session/history/${sessionId}`);
  if (!res.ok) throw new Error(`Failed to get history: ${res.status}`);
  return res.json();
}

/** Get list of all past sessions */
export async function getSessionsList(): Promise<SessionInfo[]> {
  const res = await fetch(`${API_BASE}/session/list`);
  if (!res.ok) throw new Error(`Failed to list sessions: ${res.status}`);
  return res.json();
}

/** Delete a session */
export async function deleteSession(sessionId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/session/${sessionId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete session: ${res.status}`);
}

/** Compare specific products by IDs */
export async function compareProducts(
  productIds: number[]
): Promise<ComparisonTable> {
  const res = await fetch(`${API_BASE}/compare/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(productIds),
  });
  if (!res.ok) throw new Error(`Failed to compare: ${res.status}`);
  return res.json();
}

/** Search products by name */
export async function searchProducts(
  query: string
): Promise<{ query: string; results: ProductSearchResult[] }> {
  const res = await fetch(
    `${API_BASE}/products/search?q=${encodeURIComponent(query)}`
  );
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json();
}

/** Get all categories */
export async function getCategories(): Promise<CategoryInfo[]> {
  const res = await fetch(`${API_BASE}/categories`);
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
  const res = await fetch(`${API_BASE}/recommend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Recommendation failed: ${res.status}`);
  return res.json();
}
