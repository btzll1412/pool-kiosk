import client from "./client";

export const getCheckins = (params) =>
  client.get("/checkins", { params }).then((r) => r.data);
