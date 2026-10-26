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

export const getKioskErrors = (params) =>
  client.get("/reports/kiosk-errors", { params }).then((r) => r.data);

export const getMonthlyReportBounds = () =>
  client.get("/reports/monthly/bounds").then((r) => r.data);

// params: { start: "YYYY-MM", end?: "YYYY-MM", member_ids?: [uuid, ...] }
export const getMonthlyReport = (params) =>
  client
    .get("/reports/monthly", { params, paramsSerializer: { indexes: null } })
    .then((r) => r.data);

export const exportMonthlyCsv = (params) =>
  client
    .get("/reports/monthly/export", { params, paramsSerializer: { indexes: null }, responseType: "blob" })
    .then((r) => r.data);
