const backend = (import.meta.env.VITE_API_URL || "").trim().replace(/\/$/, "");

export const browserPreferences = backend.length > 0;
export const appBase = import.meta.env.BASE_URL;
export const apiUrl = (path: string) => `${backend}${path}`;
