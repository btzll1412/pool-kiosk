import axios from "axios";

const kiosk = axios.create({
  baseURL: "/api/kiosk",
  headers: { "Content-Type": "application/json" },
});

export async function scanCard(rfid_uid) {
  const { data } = await kiosk.post("/scan", { rfid_uid });
  return data;
}

export async function getAllMembers() {
  const { data } = await kiosk.get("/members");
  return data;
}

export async function searchMembers(query) {
  const { data } = await kiosk.post("/search", { query });
  return data;
}

export async function verifyPin(member_id, pin) {
  const { data } = await kiosk.post("/verify-pin", { member_id, pin });
  return data;
}

export async function checkin(member_id, guest_count = 0) {
  const { data } = await kiosk.post("/checkin", { member_id, guest_count });
  return data;
}

export async function getPlans(isSenior = null) {
  const params = {};
  if (isSenior !== null) {
    params.is_senior = isSenior;
  }
  const { data } = await kiosk.get("/plans", { params });
  return data;
}

export async function payCash(member_id, plan_id, amount_tendered, pin, wants_change = false, use_credit = false) {
  const { data } = await kiosk.post("/pay/cash", {
    member_id,
    plan_id,
    amount_tendered: String(amount_tendered),
    pin,
    wants_change,
    use_credit,
  });
  return data;
}

export async function payCard(member_id, plan_id, pin, { saved_card_id = null, save_card = false, card_last4 = null, card_brand = null, friendly_name = null, use_credit = false } = {}) {
  const { data } = await kiosk.post("/pay/card", {
    member_id,
    plan_id,
    pin,
    saved_card_id,
    save_card,
    card_last4,
    card_brand,
    friendly_name,
    use_credit,
  });
  return data;
}

export async function paySplit(member_id, plan_id, cash_amount, pin, saved_card_id = null) {
  const { data } = await kiosk.post("/pay/split", {
    member_id,
    plan_id,
    cash_amount: String(cash_amount),
    pin,
    saved_card_id,
  });
  return data;
}

export async function payCredit(member_id, plan_id, pin) {
  const { data } = await kiosk.post("/pay/credit", {
    member_id,
    plan_id,
    pin,
  });
  return data;
}

export async function notifyChange(member_id, amount) {
  const { data } = await kiosk.post("/notify/change", null, {
    params: { member_id, amount: String(amount) },
  });
  return data;
}

export async function freezeMembership(member_id, pin, freeze_days = null, freeze_end = null) {
  const { data } = await kiosk.post("/freeze", {
    member_id,
    pin,
    freeze_days,
    freeze_end,
  });
  return data;
}

export async function unfreezeMembership(member_id, pin) {
  const { data } = await kiosk.post("/unfreeze", { member_id, pin });
  return data;
}

export async function guestVisit(name, phone, payment_method, plan_id) {
  const { data } = await kiosk.post("/guest", {
    name,
    phone,
    payment_method,
    plan_id,
  });
  return data;
}

export async function getSavedCards(member_id, pin) {
  const { data } = await kiosk.get("/saved-cards", { params: { member_id, pin } });
  return data;
}

export async function tokenizeAndSaveCard(member_id, pin, card_last4, card_brand = null, friendly_name = null) {
  const { data } = await kiosk.post("/saved-cards/tokenize", {
    member_id,
    pin,
    card_last4,
    card_brand,
    friendly_name,
  });
  return data;
}

export async function updateSavedCard(card_id, friendly_name) {
  const { data } = await kiosk.put(`/saved-cards/${card_id}`, { friendly_name });
  return data;
}

export async function deleteSavedCard(card_id, member_id, pin) {
  const { data } = await kiosk.delete(`/saved-cards/${card_id}`, {
    params: { member_id, pin },
  });
  return data;
}

export async function setDefaultCard(card_id, member_id, pin) {
  const { data } = await kiosk.put(`/saved-cards/${card_id}/default`, {
    member_id,
    pin,
  });
  return data;
}

export async function enableAutoCharge(card_id, member_id, pin, plan_id) {
  const { data } = await kiosk.post(`/saved-cards/${card_id}/auto-charge`, {
    member_id,
    pin,
    plan_id,
  });
  return data;
}

export async function disableAutoCharge(card_id, member_id, pin) {
  const { data } = await kiosk.delete(`/saved-cards/${card_id}/auto-charge`, {
    data: { member_id, pin },
  });
  return data;
}

export async function checkCard(rfid_uid) {
  const { data } = await kiosk.post("/check-card", { rfid_uid });
  return data;
}

export async function kioskSignup(memberData) {
  const { data } = await kiosk.post("/signup", memberData);
  return data;
}

export async function updateProfile(profileData) {
  const { data } = await kiosk.post("/profile", profileData);
  return data;
}

export async function getSettings() {
  const { data } = await kiosk.get("/settings");
  return data;
}

export async function getHostedPaymentSession() {
  const { data } = await kiosk.get("/hosted-payment-session");
  return data;
}

export async function tokenizeCardFromSwipe(trackData, memberId, pin, friendlyName) {
  const { data } = await kiosk.post("/saved-cards/tokenize-swipe", {
    track_data: trackData,
    member_id: memberId,
    pin,
    friendly_name: friendlyName,
  });
  return data;
}

export async function tokenizeCardFromFull(cardNumber, expDate, memberId, pin, friendlyName) {
  const { data } = await kiosk.post("/saved-cards/tokenize-full", {
    card_number: cardNumber,
    exp_date: expDate,
    member_id: memberId,
    pin,
    friendly_name: friendlyName,
  });
  return data;
}
