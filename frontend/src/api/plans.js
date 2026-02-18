import client from "./client";

export const getPlans = () => client.get("/plans").then((r) => r.data);

export const createPlan = (data) =>
  client.post("/plans", data).then((r) => r.data);

export const updatePlan = (id, data) =>
  client.put(`/plans/${id}`, data).then((r) => r.data);

export const deactivatePlan = (id) =>
  client.delete(`/plans/${id}`).then((r) => r.data);
