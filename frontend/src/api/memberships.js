import client from "./client";

export const createMembership = (data) =>
  client.post("/memberships", data).then((r) => r.data);

export const updateMembership = (id, data) =>
  client.put(`/memberships/${id}`, data).then((r) => r.data);

export const adjustMembershipSwims = (id, adjustment, notes) =>
  client.post(`/memberships/${id}/adjust`, { adjustment, notes }).then((r) => r.data);
