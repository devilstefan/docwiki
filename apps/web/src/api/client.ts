const TOKEN_KEY = 'docwiki_token';

export class ApiError extends Error {
  readonly status: number;
  readonly body: any;

  constructor(status: number, body: any) {
    super(body?.message ?? `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function api<T = unknown>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && !path.startsWith('/auth/')) {
    setToken(null);
    window.location.href = '/login';
  }
  if (!res.ok) {
    throw new ApiError(res.status, await res.json().catch(() => ({})));
  }
  return res.json() as Promise<T>;
}

export async function uploadFile(spaceId: string, file: File) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`/api/spaces/${spaceId}/attachments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
    body: form,
  });
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})));
  return res.json() as Promise<{ id: string; url: string; filename: string }>;
}
