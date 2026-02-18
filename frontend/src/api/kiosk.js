import axios from "axios";

const kiosk = axios.create({
  baseURL: "/api/kiosk",
  headers: { "Content-Type": "application/json" },
});

export async function scanCard(rfid_uid) {
  const { data } = await kiosk.post("/scan", { rfid_uid });
  return data;
}

export async function searchMembers(query) {
  const { data } = await kiosk.post("/search", { query });
  return data;
}

export async function checkin(member_id, guest_count = 0) {
  const { data } = await kiosk.post("/checkin", { member_id, guest_count });
  return data;
}

export async function getPlans() {
  const { data } = await kiosk.get("/plans");
  return data;
}

export async function payCash(member_id, plan_id, amount_tendered, pin) {
  const { data } = await kiosk.post("/pay/cash", {
    member_id,
    plan_id,
    amount_tendered: String(amount_tendered),
    pin,
  });
  return data;
}

export async function payCard(member_id, plan_id, pin, saved_card_id = null) {
  const { data } = await kiosk.post("/pay/card", {
    member_id,
    plan_id,
    pin,
    saved_card_id,
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

export async function getSettings() {
  const { data } = await axios.get("/api/settings");
  return data;
}
