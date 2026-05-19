export default async (request) => {
  if (request.method !== "POST") return json({ success: false, message: "Method not allowed" }, 405);

  try {
    const body = await request.json().catch(() => ({}));
    const licenseKey = String(body.licenseKey || "").trim();
    const productId = Netlify.env.get("GUMROAD_PRODUCT_ID") || "";
    const productPermalink = Netlify.env.get("GUMROAD_PRODUCT_PERMALINK") || String(body.productPermalink || "").trim();
    const maxUses = Number(Netlify.env.get("LICENSE_MAX_USES") || "10");

    if (!licenseKey) return json({ success: false, message: "Enter your Gumroad license key." }, 400);
    if (!productId && !productPermalink) return json({ success: false, message: "License verification is not configured yet." }, 500);

    const params = new URLSearchParams();
    if (productId) params.append("product_id", productId);
    if (!productId && productPermalink) params.append("product_permalink", productPermalink);
    params.append("license_key", licenseKey);
    params.append("increment_uses_count", "true");

    const gumroadResponse = await fetch("https://api.gumroad.com/v2/licenses/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params
    });
    const data = await gumroadResponse.json();

    if (!data.success) return json({ success: false, message: data.message || "License key could not be verified." }, 403);
    if (data.purchase?.refunded || data.purchase?.chargebacked) return json({ success: false, message: "This purchase is no longer eligible for Pro access." }, 403);
    if (Number(data.uses || 0) > maxUses) return json({ success: false, message: "This license key has been used too many times. Contact support if this is your purchase." }, 403);

    return json({ success: true, uses: data.uses, purchase: { email: data.purchase?.email || "", saleTimestamp: data.purchase?.sale_timestamp || "" } });
  } catch {
    return json({ success: false, message: "License verification failed. Try again." }, 500);
  }
};

export const config = {
  path: ["/.netlify/functions/verify-license", "/api/verify-license"]
};

function json(payload, status = 200) {
  return Response.json(payload, { status });
}
