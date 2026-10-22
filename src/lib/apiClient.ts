import { useAuthStore } from './authStore';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export class ApiClientError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const { refreshToken, user, setAuth, clear } = useAuthStore.getState();
  if (!refreshToken) return false;

  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (res) => {
        if (!res.ok) {
          clear();
          return false;
        }
        const data = await res.json();
        setAuth({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user ?? user! });
        return true;
      })
      .catch(() => {
        clear();
        return false;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; query?: Record<string, string | number | boolean | undefined> } = {},
): Promise<T> {
  const { method = 'GET', body, query } = options;

  let url = `${API_URL}${path}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== '') params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const doFetch = async () => {
    const token = useAuthStore.getState().accessToken;
    try {
      return await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiClientError(0, 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบการเชื่อมต่อ');
    }
  };

  let res = await doFetch();

  if (res.status === 401 && useAuthStore.getState().refreshToken) {
    const refreshed = await tryRefresh();
    if (refreshed) res = await doFetch();
  }

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = data?.error?.message ?? `Request failed with status ${res.status}`;
    throw new ApiClientError(res.status, message, data?.error?.code, data?.error?.details);
  }

  return data as T;
}

/** Absolute URL for a file the API serves under /uploads (product photos). */
export function assetUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  return `${API_URL.replace(/\/api\/?$/, '')}${path}`;
}

/** Phone photos are several MB; shrink to ~1200px JPEG before upload so POS tiles load fast. */
async function shrinkImage(file: File, maxSide = 1200): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

export async function apiUpload<T = unknown>(
  path: string,
  file: File | Blob,
  options: { field?: string; fields?: Record<string, string>; maxSide?: number } = {},
): Promise<T> {
  const { field = 'image', fields = {}, maxSide = 1200 } = options;
  const name = file instanceof File ? file.name : 'image.jpg';
  const blob = file instanceof File ? await shrinkImage(file, maxSide) : file;
  const doFetch = async () => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    form.append(field, blob, blob === file ? name : name.replace(/\.\w+$/, '') + '.jpg');
    const token = useAuthStore.getState().accessToken;
    try {
      return await fetch(`${API_URL}${path}`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
    } catch {
      throw new ApiClientError(0, 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบการเชื่อมต่อ');
    }
  };
  let res = await doFetch();
  if (res.status === 401 && useAuthStore.getState().refreshToken && (await tryRefresh())) res = await doFetch();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiClientError(res.status, data?.error?.message ?? `Upload failed with status ${res.status}`, data?.error?.code);
  return data as T;
}
