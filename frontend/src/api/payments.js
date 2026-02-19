import client from "./client";

export const getTransactions = (params) =>
  client.get("/transactions", { params }).then((r) => r.data);

export const createManualTransaction = (data) =>
  client.post("/transactions/manual", data).then((r) => r.data);

export const updateTransactionNotes = (id, data) =>
  client.put(`/transactions/${id}/notes`, data).then((r) => r.data);


export const createMembership = (data) =>
  client.post("/memberships", data).then((r) => r.data);
