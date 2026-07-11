import { request, setAuthToken, clearAuthToken } from "./http";

export { clearAuthToken, getAuthToken } from "./http";

export async function login(username, password) {
  const data = await request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (data?.token) {
    setAuthToken(data.token);
  }
  return data;
}

export async function getSession() {
  return request("/auth/me");
}

export async function logout() {
  try {
    await request("/auth/logout", { method: "POST" });
  } finally {
    clearAuthToken();
  }
}
