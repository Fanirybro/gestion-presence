// Read through an asynchronous module boundary, without an artificial loading delay.
export async function loadDatabase() {
  const { readDb } = await import("./store");
  return readDb();
}
