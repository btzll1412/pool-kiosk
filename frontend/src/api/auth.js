import axios from "axios";

export const login = async (username, password) => {
  const { data } = await axios.post("/api/auth/login", { username, password });
  localStorage.setItem("access_token", data.access_token);
  localStorage.setItem("refresh_token", data.refresh_token);
  return data;
};

export const logout = () => {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
};

export const isAuthenticated = () => {
  return !!localStorage.getItem("access_token");
};

// Setup wizard
export const checkSetupStatus = async () => {
  const { data } = await axios.get("/api/auth/setup-status");
  return data;
};

export const setupAdmin = async ({ username, email, password }) => {
  const { data } = await axios.post("/api/auth/setup", { username, email, password });
  localStorage.setItem("access_token", data.access_token);
  localStorage.setItem("refresh_token", data.refresh_token);
  return data;
};

// Password/username recovery
export const forgotPassword = async (email) => {
  const { data } = await axios.post("/api/auth/forgot-password", { email });
  return data;
};

export const forgotUsername = async (email) => {
  const { data } = await axios.post("/api/auth/forgot-username", { email });
  return data;
};

export const resetPassword = async (token, newPassword) => {
  const { data } = await axios.post("/api/auth/reset-password", {
    token,
    new_password: newPassword,
  });
  return data;
};
