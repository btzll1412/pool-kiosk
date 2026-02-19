import client from "./client";

export async function getGuests(page = 1, perPage = 25) {
  const { data } = await client.get("/api/guests", { params: { page, per_page: perPage } });
  return data;
}
