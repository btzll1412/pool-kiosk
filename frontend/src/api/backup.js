import client from "./client";

export async function exportSystem() {
  const { data } = await client.get("/backup/export");
  return data;
}

export async function importSystem(file) {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await client.post("/backup/import", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function runBackupNow() {
  const { data } = await client.post("/backup/run");
  return data;
}

export async function getBackupStatus() {
  const { data } = await client.get("/backup/status");
  return data;
}

export async function listBackups() {
  const { data } = await client.get("/backup/list");
  return data;
}

export async function testBackupConnection() {
  const { data } = await client.post("/backup/test");
  return data;
}
