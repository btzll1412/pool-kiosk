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
