import client from "./client";

export const getDashboard = () =>
  client.get("/reports/dashboard").then((r) => r.data);

export const getRevenueReport = (params) =>
  client.get("/reports/revenue", { params }).then((r) => r.data);

export const getSwimReport = (params) =>
  client.get("/reports/swims", { params }).then((r) => r.data);

export const getMembershipReport = () =>
  client.get("/reports/memberships").then((r) => r.data);

export const exportCsv = (params) =>
  client
    .get("/reports/export", { params, responseType: "blob" })
    .then((r) => r.data);
