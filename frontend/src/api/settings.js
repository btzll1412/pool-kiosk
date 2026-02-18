import client from "./client";

export const getSettings = () =>
  client.get("/settings").then((r) => r.data);

export const updateSettings = (settings) =>
  client.put("/settings", { settings }).then((r) => r.data);
