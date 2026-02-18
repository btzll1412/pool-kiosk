import client from "./client";

export const getMembers = (params) =>
  client.get("/members", { params }).then((r) => r.data);

export const getMember = (id) =>
  client.get(`/members/${id}`).then((r) => r.data);

export const createMember = (data) =>
  client.post("/members", data).then((r) => r.data);

export const updateMember = (id, data) =>
  client.put(`/members/${id}`, data).then((r) => r.data);

export const deactivateMember = (id) =>
  client.delete(`/members/${id}`).then((r) => r.data);

export const getMemberHistory = (id) =>
  client.get(`/members/${id}/history`).then((r) => r.data);

export const adjustCredit = (id, data) =>
  client.post(`/members/${id}/credit`, data).then((r) => r.data);

export const getMemberCards = (id) =>
  client.get(`/members/${id}/cards`).then((r) => r.data);

export const assignCard = (id, data) =>
  client.post(`/members/${id}/cards`, data).then((r) => r.data);

export const deactivateCard = (memberId, cardId) =>
  client.delete(`/members/${memberId}/cards/${cardId}`).then((r) => r.data);
