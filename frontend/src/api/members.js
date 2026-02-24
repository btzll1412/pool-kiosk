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

export const reactivateMember = (id) =>
  client.post(`/members/${id}/reactivate`).then((r) => r.data);

export const permanentlyDeleteMember = (id) =>
  client.delete(`/members/${id}/permanent`).then((r) => r.data);

export const getMemberHistory = (id) =>
  client.get(`/members/${id}/history`).then((r) => r.data);

export const adjustCredit = (id, data) =>
  client.post(`/members/${id}/credit`, data).then((r) => r.data);

export const getMemberCards = (id) =>
  client.get(`/members/${id}/cards`).then((r) => r.data);

export const assignCard = (id, data) =>
  client.post(`/members/${id}/cards`, data).then((r) => r.data);

export const deactivateCard = (memberId, cardId) =>
  client.post(`/members/${memberId}/cards/${cardId}/deactivate`).then((r) => r.data);

export const reactivateCard = (memberId, cardId) =>
  client.post(`/members/${memberId}/cards/${cardId}/reactivate`).then((r) => r.data);

export const deleteCard = (memberId, cardId) =>
  client.delete(`/members/${memberId}/cards/${cardId}`).then((r) => r.data);

export const getMemberSavedCards = (memberId) =>
  client.get(`/members/${memberId}/saved-cards`).then((r) => r.data);

export const deleteMemberSavedCard = (memberId, cardId) =>
  client.delete(`/members/${memberId}/saved-cards/${cardId}`).then((r) => r.data);

export const addMemberSavedCard = (memberId, data) =>
  client.post(`/members/${memberId}/saved-cards`, data).then((r) => r.data);

export const tokenizeCardFromSwipe = (memberId, trackData, friendlyName) =>
  client.post(`/members/${memberId}/saved-cards/tokenize-swipe`, null, {
    params: { track_data: trackData, friendly_name: friendlyName }
  }).then((r) => r.data);

export const tokenizeCardFromFull = (memberId, cardNumber, expDate, friendlyName) =>
  client.post(`/members/${memberId}/saved-cards/tokenize-full`, null, {
    params: { card_number: cardNumber, exp_date: expDate, friendly_name: friendlyName }
  }).then((r) => r.data);

export const getMemberMemberships = (memberId) =>
  client.get(`/members/${memberId}/memberships`).then((r) => r.data);

export const getMemberPinStatus = (memberId) =>
  client.get(`/members/${memberId}/pin-status`).then((r) => r.data);

export const unlockMemberPin = (memberId) =>
  client.post(`/members/${memberId}/unlock-pin`).then((r) => r.data);

export const resetMemberPin = (memberId, newPin) =>
  client.post(`/members/${memberId}/reset-pin`, { new_pin: newPin }).then((r) => r.data);

export const exportMembersCsv = () =>
  client.get("/members/export/csv", { responseType: "blob" }).then((r) => r.data);

export const importMembersCsv = (file) => {
  const formData = new FormData();
  formData.append("file", file);
  return client.post("/members/import/csv", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  }).then((r) => r.data);
};
