import client from "./client";

// params: { start_date, end_date, search, plan_id, method, buyer, page, per_page }
export const getItemSales = (params) =>
  client.get("/item-sales", { params }).then((r) => r.data);

export const getItemSalePlans = () =>
  client.get("/item-sales/plans").then((r) => r.data);

export const exportItemSalesCsv = (params) =>
  client.get("/item-sales/export", { params, responseType: "blob" }).then((r) => r.data);
