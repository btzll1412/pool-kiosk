import client from "./client";

export const getSchedules = (params) =>
  client.get("/schedules", { params }).then((r) => r.data);

export const getWeeklySchedule = () =>
  client.get("/schedules/weekly").then((r) => r.data);

export const getCurrentSchedule = () =>
  client.get("/schedules/current").then((r) => r.data);

export const createSchedule = (data) =>
  client.post("/schedules", data).then((r) => r.data);

export const updateSchedule = (id, data) =>
  client.put(`/schedules/${id}`, data).then((r) => r.data);

export const deleteSchedule = (id) =>
  client.delete(`/schedules/${id}`).then((r) => r.data);

export const createBulkSchedules = (schedules) =>
  client.post("/schedules/bulk", schedules).then((r) => r.data);

export const deleteAllSchedules = () =>
  client.delete("/schedules/bulk").then((r) => r.data);

// Schedule Overrides
export const getOverrides = (includeExpired = false) =>
  client.get("/schedules/overrides", { params: { include_expired: includeExpired } }).then((r) => r.data);

export const createOverride = (data) =>
  client.post("/schedules/overrides", data).then((r) => r.data);

export const updateOverride = (id, data) =>
  client.put(`/schedules/overrides/${id}`, data).then((r) => r.data);

export const deleteOverride = (id) =>
  client.delete(`/schedules/overrides/${id}`).then((r) => r.data);
