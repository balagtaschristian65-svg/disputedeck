const CONFIG = window.DISPUTEDECK_CONFIG || {};
const CHECKOUT_URLS = { self: CONFIG.selfServeCheckoutUrl, service: CONFIG.serviceCheckoutUrl };
const LICENSE_ENDPOINT = CONFIG.licenseVerificationEndpoint || "/.netlify/functions/verify-license";
const GUMROAD_PRODUCT_PERMALINK = CONFIG.gumroadProductPermalink || "disputedeck-pro";
const STORAGE_KEY = "disputedeck-license";

const INTAKE_TEMPLATE = `Before building your packet, gather:

1. Store name
2. Payment processor: Shopify / Stripe / PayPal / other
3. Dispute reason shown by the processor
4. Response deadline
5. Disputed amount
6. Order number
7. Customer name and email
8. Purchase date
9. Fulfillment, delivery, or access date
10. Product or service purchased
11. Tracking link, delivery proof, or access log
12. Product page or service description screenshot
13. Refund, return, or cancellation policy screenshot/link
14. Customer messages or support tickets
15. Any refund record, replacement offer, or resolution attempt
16. Anything else the bank should understand

Remove private card numbers and passwords from screenshots before uploading or sharing.`;

const REASONS = {
  not_received: { label: "Product not received", position: "the order was fulfilled to the customer-provided destination or made available as promised before the dispute", evidence: ["Tracking and delivery confirmation", "Fulfillment record", "Customer-provided address", "Support communication", "Delivery policy"] },
  fraud: { label: "Fraudulent / unauthorized", position: "transaction indicators, fulfillment trail, and store records support that this was a legitimate order", evidence: ["Customer account history", "AVS/CVC and risk review", "Proof of fulfillment", "Customer communication", "Checkout and billing terms"] },
  not_as_described: { label: "Product unacceptable / not as described", position: "the product or service was accurately described and delivered as ordered", evidence: ["Product listing screenshot", "Order details", "Return or resolution policy", "Customer messages", "Delivery or access proof"] },
  credit_not_processed: { label: "Credit not processed", position: "the merchant either processed the owed credit or the transaction did not qualify for a refund under the policy", evidence: ["Refund record", "Return status", "Refund policy", "Customer communication", "Order and fulfillment record"] },
  subscription: { label: "Subscription / recurring billing", position: "the customer agreed to recurring billing terms and the merchant honored the published cancellation policy", evidence: ["Signup flow screenshot", "Renewal notices", "Usage or access logs", "Cancellation history", "Terms and refund policy"] }
};

const SAMPLE = { merchantName: "Northline Supply Co.", processor: "Shopify Payments", reasonCode: "not_received", deadline: "2026-05-27", amount: "249.00", orderId: "#1042", customerName: "Jordan Lee", customerEmail: "jordan@example.com", purchaseDate: "2026-04-02", fulfillmentDate: "2026-04-03", trackingUrl: "https://carrier.example/tracking/1Z999", productDescription: "One insulated field jacket, size medium, shipped to the address entered at checkout.", timelineNotes: "Apr 2: Customer completed checkout. Apr 3: Order shipped. Apr 8: Carrier marked package delivered. Apr 12: Customer opened dispute without contacting support first.", policyNotes: "Checkout shows shipping address entered by customer. Delivery policy asks customers to contact support within 5 days of a missing delivery scan." };

const CHAT = { "What is a chargeback?": "A chargeback happens when a customer asks their bank to reverse a payment. DisputeDeck helps organize the merchant evidence response.", "What evidence do I need?": "Start with order record, dispute reason, deadline, tracking or access logs, product description, policy screenshots, customer messages, and refund or resolution attempts.", "Can this guarantee a win?": "No. The bank decides the outcome. DisputeDeck helps organize evidence and response text.", "Is my data private?": "The builder runs in your browser and does not connect to your store. Cases are saved locally unless you copy, print, or download them.", "How does Pro access work?": "Buy DisputeDeck Pro, then enter your Gumroad license key to remove demo watermarks.", "What is packet setup?": "Packet Setup is a hands-on option where you send dispute details and receive an organized packet draft." };

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function init() { renderChecklist(); renderIntake(); initChat(); hydrateLicense(); updateScore(); $("#checkoutLink").href = CHECKOUT_URLS.self; }

document.addEventListener("input", (e) => { if (e.target.closest("#caseForm")) { if (e.target.name === "reasonCode") renderChecklist(); updateScore(); } });
document.addEventListener("click", (e) => { const action = e.target.closest("[data-action]")?.dataset.action; if (!action) return; ({ "load-sample": loadSample, generate: generatePacket, "copy-markdown": copyMarkdown, print: () => window.print(), "open-checkout": openCheckout, "close-checkout": closeCheckout, "verify-license": verifyLicense, "copy-intake": copyIntake, "toggle-chat": toggleChat }[action])?.(e); });
$("#chatForm")?.addEventListener("submit", (e) => { e.preventDefault(); const q = $("#chatInput").value.trim(); if (q) { $("#chatInput").value = ""; askChat(q); } });

function data() { return Object.fromEntries(new FormData($("#caseForm")).entries()); }
function reason() { return REASONS[data().reasonCode] || REASONS.not_received; }
function renderChecklist() { $("#evidenceChecklist").innerHTML = reason().evidence.map(x => `<label class="check-item"><input type="checkbox" data-evidence value="${x}"><span><strong>${x}</strong></span></label>`).join(""); }
function renderIntake() { $("#intakeTemplate").textContent = INTAKE_TEMPLATE; }
function loadSample() { Object.entries(SAMPLE).forEach(([k,v]) => { const el = document.querySelector(`[name="${k}"]`); if (el) el.value = v; }); renderChecklist(); updateScore(); toast("Sample case loaded."); }
function score() { const d = data(); const fields = ["merchantName","processor","reasonCode","amount","deadline","orderId","customerName","customerEmail","purchaseDate","fulfillmentDate","trackingUrl","productDescription","timelineNotes","policyNotes"]; const filled = fields.filter(f => String(d[f] || "").trim()).length; const checks = $$('[data-evidence]').filter(x => x.checked).length; return Math.min(100, filled * 4 + checks * 8); }
function updateScore() { const s = score(); $("#scoreValue").textContent = s; $("#heroScore").textContent = Math.max(82, s); }
function buildMarkdown() { const d = data(), r = reason(); const missing = $$('[data-evidence]').filter(x => !x.checked).map(x => x.value); const included = $$('[data-evidence]').filter(x => x.checked).map(x => x.value); const watermark = hasPro() ? "" : "\n\nDEMO WATERMARK: Unlock Pro before submitting this packet."; return `# Chargeback Evidence Packet\n\nMerchant: ${safe(d.merchantName)}\nProcessor: ${safe(d.processor)}\nOrder: ${safe(d.orderId)}\nDispute reason: ${r.label}\nDisputed amount: $${safe(d.amount || "0.00")}\nResponse deadline: ${safe(d.deadline)}\nEvidence strength score: ${score()}/100${watermark}\n\n## Cover Letter\n\nTo the issuing bank review team:\n\n${safe(d.merchantName)} asks that this dispute be reversed because ${r.position}. The customer purchased ${safe(d.productDescription || "the product or service")} and the merchant can provide evidence for order ${safe(d.orderId)}.\n\n## Transaction Facts\n\n| Field | Detail |\n| --- | --- |\n| Customer | ${safe(d.customerName)} |\n| Customer email | ${safe(d.customerEmail)} |\n| Purchase date | ${safe(d.purchaseDate)} |\n| Fulfillment/access date | ${safe(d.fulfillmentDate)} |\n| Tracking/access URL | ${safe(d.trackingUrl)} |\n\n## Timeline\n\n${safe(d.timelineNotes || "Add a chronological timeline before submission.")}\n\n## Evidence Included\n\n${included.length ? included.map(x => `- ${x}`).join("\n") : "- No evidence checked yet."}\n\n## Missing Evidence To Fix\n\n${missing.length ? missing.map(x => `- ${x}`).join("\n") : "- No core evidence gaps based on this reason code."}\n\n## Policy And Communication Notes\n\n${safe(d.policyNotes || "Add policy excerpts, customer messages, and support response details before submission.")}\n\n## Final Review Checklist\n\n- Confirm all dates and amounts match the processor record.\n- Upload screenshots or PDFs named by evidence type.\n- Keep the argument tied to the stated dispute reason.\n- Submit before the processor deadline.`; }
function generatePacket() { const md = buildMarkdown(); window.currentPacket = md; $("#packetOutput").innerHTML = mdToHtml(md); toast("Packet generated."); }
function mdToHtml(md) { return md.replace(/^# (.*)$/gm,"<h2>$1</h2>").replace(/^## (.*)$/gm,"<h3>$1</h3>").replace(/^\- (.*)$/gm,"<li>$1</li>").replace(/\n\n/g,"</p><p>").replace(/^/,"<p>").replace(/$/,"</p>").replace(/<p><h/g,"<h").replace(/<\/h([23])><\/p>/g,"</h$1>"); }
async function copyMarkdown() { if (!window.currentPacket) generatePacket(); await navigator.clipboard.writeText(window.currentPacket).catch(() => {}); toast("Packet markdown copied."); }
function initChat() { const log = $("#chatLog"), quick = $("#quickReplies"); if (!log || !quick) return; addMsg("bot", "Hi. I can answer common questions about chargebacks, evidence, privacy, pricing, and packet setup."); quick.innerHTML = Object.keys(CHAT).map(q => `<button class="quick-reply" type="button">${q}</button>`).join(""); $$(".quick-reply").forEach(b => b.addEventListener("click", () => askChat(b.textContent))); }
function askChat(q) { addMsg("user", q); addMsg("bot", `<strong>${q}</strong>${CHAT[q] || "Start by gathering the order record, dispute reason, deadline, tracking or access proof, policies, and customer messages."}`); }
function addMsg(type, html) { const div = document.createElement("div"); div.className = `message ${type}`; type === "user" ? div.textContent = html : div.innerHTML = html; $("#chatLog").appendChild(div); }
function toggleChat() { const p = $("#chatPanel"); p.hidden = !p.hidden; }
function openCheckout(e) { const isService = e.target.closest("[data-plan]")?.dataset.plan === "service"; $("#checkoutTitle").textContent = isService ? "Get packet setup" : "Unlock DisputeDeck Pro"; $("#checkoutDescription").innerHTML = isService ? "Complete checkout for <strong>Chargeback Packet Setup</strong>. After purchase, you will receive instructions for sending your dispute details and screenshots." : "Complete checkout for <strong>DisputeDeck Pro</strong>. After purchase, enter your Gumroad license key here to unlock clean exports."; $("#checkoutLink").href = isService ? CHECKOUT_URLS.service : CHECKOUT_URLS.self; $("#licenseKeyLabel").hidden = isService; $('[data-action="verify-license"]').hidden = isService; $("#checkoutModal").hidden = false; }
function closeCheckout() { $("#checkoutModal").hidden = true; }
async function verifyLicense() { const key = $("#licenseKeyInput").value.trim(); if (!key) return toast("Enter your Gumroad license key."); try { const res = await fetch(LICENSE_ENDPOINT, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ licenseKey:key, productPermalink:GUMROAD_PRODUCT_PERMALINK }) }); const out = await res.json(); if (!res.ok || !out.success) return toast(out.message || "License key could not be verified."); localStorage.setItem(STORAGE_KEY, JSON.stringify({ tier:"pro", unlockedAt:new Date().toISOString() })); hydrateLicense(); closeCheckout(); toast("License verified. Pro unlocked."); } catch { toast("Could not reach license verification."); } }
function hasPro() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}").tier === "pro"; } catch { return false; } }
function hydrateLicense() { const pro = hasPro(); $("#licenseDot").classList.toggle("pro", pro); $("#licenseLabel").textContent = pro ? "Pro unlocked" : "Demo mode"; $("#licenseText").textContent = pro ? "Exports are clean and ready to submit." : "Exports are watermarked until Pro is unlocked."; }
function copyIntake() { navigator.clipboard.writeText(INTAKE_TEMPLATE).catch(() => {}); toast("Evidence checklist copied."); }
function toast(msg) { const el = $("#toast"); el.textContent = msg; el.classList.add("show"); clearTimeout(window.toastTimer); window.toastTimer = setTimeout(() => el.classList.remove("show"), 2400); }
function safe(v) { return String(v || "Not entered").replace(/\s+/g," ").trim(); }

init();
