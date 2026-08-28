export function getAppBaseUrl(): string {
  let baseUrl = process.env.APP_URL;
  if (!baseUrl) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("APP_URL environment variable is missing. Required for Open Banking in production.");
    }
    baseUrl = "http://localhost:3000";
  }
  return baseUrl.replace(/\/+$/, "");
}
