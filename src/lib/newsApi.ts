import { Article, Category, AiConfig, MediaAsset, MetaConfig } from "../types";

const jsonHeaders = {
  'Content-Type': 'application/json',
};

export type OpenAIKeySource = 'database' | 'environment' | 'none';
export type AdminAuthState = {
  authenticated: boolean;
  token?: string;
  expiresAt?: string;
};

const getAuthHeaders = () => {
  const headers: Record<string, string> = { ...jsonHeaders };
  const token = localStorage.getItem('nova_admin_session_token');
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

const parseResponseBody = async <T = Record<string, unknown>>(response: Response): Promise<{ raw: string; data: T }> => {
  const raw = await response.text();
  if (!raw.trim()) {
    return { raw: '', data: {} as T };
  }

  try {
    return { raw, data: JSON.parse(raw) as T };
  } catch {
    return { raw, data: { raw } as T };
  }
};

export async function checkAdminSession(): Promise<{ authenticated: boolean }> {
  const response = await fetch('/api/admin/me', {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    return { authenticated: false };
  }

  return response.json();
}

export async function loginAdmin(username: string, password: string): Promise<AdminAuthState> {
  const response = await fetch('/api/admin/login', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ username, password }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Failed to log in');
  }

  return data;
}

export async function logoutAdmin(): Promise<void> {
  await fetch('/api/admin/logout', {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  localStorage.removeItem('nova_admin_session_token');
}

export async function changeAdminPassword(currentPassword: string, newPassword: string): Promise<{ updated: boolean; message?: string }> {
  const response = await fetch('/api/admin/password', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ currentPassword, newPassword }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Failed to change password');
  }

  return data;
}

export async function saveOpenAIKey(apiKey: string): Promise<{ saved: boolean; source: OpenAIKeySource }> {
  const response = await fetch('/api/admin/openai-key', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ apiKey }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Failed to save OpenAI key');
  }

  return data;
}

export async function clearOpenAIKey(): Promise<{ deleted: boolean; source: OpenAIKeySource }> {
  const response = await fetch('/api/admin/openai-key', {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Failed to clear OpenAI key');
  }

  return data;
}

export async function generateNewsArticle(
  category: Category,
  aiConfig?: AiConfig,
  imagePrompt?: string
): Promise<Partial<Article>> {
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ category, aiConfig, imagePrompt }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || error.error || 'Failed to generate article');
  }

  return response.json();
}

export async function checkAIStatus(): Promise<{ connected: boolean; model: string; provider: string; keySource?: OpenAIKeySource }> {
  const response = await fetch('/api/ai-status', {
    headers: jsonHeaders,
  });
  if (!response.ok) throw new Error('Failed to check AI status');
  return response.json();
}

export async function testMetaConnection(metaConfig: MetaConfig): Promise<{
  connected: boolean;
  pageId?: string;
  pageName?: string;
  tokenType?: string;
  scopes?: string[];
  message?: string;
}> {
  const response = await fetch('/api/meta/test-connection', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(metaConfig),
  });

  const { raw, data } = await parseResponseBody<{
    connected: boolean;
    pageId?: string;
    pageName?: string;
    tokenType?: string;
    scopes?: string[];
    message?: string;
  }>(response);
  if (!response.ok) {
    const details = (data as any).message || (data as any).error || (data as any).raw || raw;
    throw new Error(String(details || 'Failed to test Meta connection'));
  }

  return data;
}

export async function publishFacebookStory(payload: {
  title: string;
  summary: string;
  category: string;
  imageUrl: string;
  portraitImageUrl?: string;
  imageSourceUrl?: string;
  portraitImageSourceUrl?: string;
  storyCtaText: string;
  storyLinkLabel: string;
  pageName: string;
  pageId: string;
  pageAccessToken: string;
  articleUrl?: string;
  isBreaking?: boolean;
}): Promise<{ published: boolean; result?: unknown }> {
  const response = await fetch('/api/meta/publish-story', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  const { raw, data } = await parseResponseBody<{ published: boolean; result?: unknown }>(response);
  if (!response.ok) {
    const details = (data as any).message || (data as any).error || (data as any).raw || raw;
    throw new Error(String(details || 'Failed to publish Facebook story'));
  }

  return data;
}

export async function openFacebookStoryComposer(payload: {
  title: string;
  summary: string;
  category: string;
  imageUrl: string;
  portraitImageUrl?: string;
  imageSourceUrl?: string;
  portraitImageSourceUrl?: string;
  storyCtaText: string;
  storyLinkLabel: string;
  pageName: string;
  pageId: string;
  pageAccessToken: string;
  articleUrl?: string;
  isBreaking?: boolean;
}): Promise<{ opened: boolean; needsLogin?: boolean; published?: boolean; message?: string; actions?: string[] }> {
  const response = await fetch('/api/meta/open-story-composer', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  const { raw, data } = await parseResponseBody<{ opened: boolean; needsLogin?: boolean; published?: boolean; message?: string; actions?: string[] }>(response);
  if (!response.ok) {
    const details = (data as any).message || (data as any).error || (data as any).raw || raw;
    throw new Error(String(details || 'Failed to open Facebook story composer'));
  }

  return data;
}

export async function openFacebookStoryBot(payload: {
  title: string;
  summary: string;
  category: string;
  imageUrl: string;
  portraitImageUrl?: string;
  imageSourceUrl?: string;
  portraitImageSourceUrl?: string;
  storyCtaText: string;
  storyLinkLabel: string;
  pageName: string;
  pageId: string;
  pageAccessToken: string;
  articleUrl?: string;
  isBreaking?: boolean;
}): Promise<{ opened: boolean; needsLogin?: boolean; published?: boolean; message?: string; actions?: string[] }> {
  const response = await fetch('/api/meta/open-story-bot', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  const { raw, data } = await parseResponseBody<{ opened: boolean; needsLogin?: boolean; published?: boolean; message?: string; actions?: string[] }>(response);
  if (!response.ok) {
    const details = (data as any).message || (data as any).error || (data as any).raw || raw;
    throw new Error(String(details || 'Failed to open Facebook story bot'));
  }

  return data;
}

export async function testFacebookStoryPublish(payload: {
  pageId: string;
  pageAccessToken: string;
  pageName: string;
  storyCtaText: string;
  storyLinkLabel: string;
}): Promise<{ published: boolean; result?: unknown }> {
  const response = await fetch('/api/meta/publish-story', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      title: 'Facebook Story Test',
      summary: 'This is a test story publish from the admin panel.',
      category: 'Facts',
      imageUrl: 'https://picsum.photos/seed/facebook-story-test/1024/1792',
      portraitImageUrl: 'https://picsum.photos/seed/facebook-story-test-portrait/1024/1792',
      storyCtaText: payload.storyCtaText,
      storyLinkLabel: payload.storyLinkLabel,
      pageName: payload.pageName,
      pageId: payload.pageId,
      pageAccessToken: payload.pageAccessToken,
      isBreaking: false,
    }),
  });

  const { raw, data } = await parseResponseBody<{ published: boolean; result?: unknown }>(response);
  if (!response.ok) {
    const details = (data as any).message || (data as any).error || (data as any).raw || raw;
    throw new Error(String(details || 'Failed to publish Facebook story'));
  }

  return data;
}

export async function loadMediaLibrary(): Promise<{ assets: MediaAsset[] }> {
  const response = await fetch('/api/media/library', {
    headers: getAuthHeaders(),
  });

  const { raw, data } = await parseResponseBody<{ assets: MediaAsset[] }>(response);
  if (!response.ok) {
    const details = (data as any).message || (data as any).error || (data as any).raw || raw;
    throw new Error(String(details || 'Failed to load media library'));
  }

  return data;
}

export async function uploadMediaAsset(payload: { name: string; dataUrl: string }): Promise<{ uploaded: boolean; asset: MediaAsset | null }> {
  const response = await fetch('/api/media/upload', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  const { raw, data } = await parseResponseBody<{ uploaded: boolean; asset: MediaAsset | null }>(response);
  if (!response.ok) {
    const details = (data as any).message || (data as any).error || (data as any).raw || raw;
    throw new Error(String(details || 'Failed to upload media asset'));
  }

  return data;
}

export async function regenerateMediaAsset(id: string): Promise<{ regenerated: boolean; asset: MediaAsset | null }> {
  const response = await fetch(`/api/media/regenerate/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });

  const { raw, data } = await parseResponseBody<{ regenerated: boolean; asset: MediaAsset | null }>(response);
  if (!response.ok) {
    const details = (data as any).message || (data as any).error || (data as any).raw || raw;
    throw new Error(String(details || 'Failed to regenerate media asset'));
  }

  return data;
}
