import client from "./client";

export const getSettings = () =>
  client.get("/settings").then((r) => r.data);

export const updateSettings = (settings) =>
  client.put("/settings", { settings }).then((r) => r.data);

export const testWebhook = (eventType) =>
  client.post(`/settings/webhook-test?event_type=${encodeURIComponent(eventType)}`).then((r) => r.data);

export const testPaymentConnection = (processor) =>
  client.post(`/settings/payment-test?processor=${encodeURIComponent(processor)}`).then((r) => r.data);

export const testEmail = () =>
  client.post("/settings/email-test").then((r) => r.data);

export const testSipCall = () =>
  client.post("/settings/sip-test").then((r) => r.data);
