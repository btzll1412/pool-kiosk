import client from "./client";

export const getSwipes = (params) =>
  client.get("/swipes", { params }).then((r) => r.data);
