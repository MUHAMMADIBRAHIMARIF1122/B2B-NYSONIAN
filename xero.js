/**
 * xero.js — Xero API service
 *
 * Handles token refresh, contact lookup/creation, and invoice creation.
 * All calls go to the Demo Company while XERO_USE_DEMO=true.
 */

require("dotenv").config();
const https = require("https");
const fs    = require("fs");
const path  = require("path");

const CLIENT_ID     = process.env.XERO_CLIENT_ID;
const CLIENT_SECRET = process.env.XERO_CLIENT_SECRET;
const ACCOUNT_CODE  = process.env.XERO_ACCOUNT_CODE || "200";

function getTenantId() {
  return process.env.XERO_USE_DEMO === "true"
    ? process.env.XERO_TENANT_ID_DEMO
    : process.env.XERO_TENANT_ID_REAL;
}

// ── In-memory token state ─────────────────────────────────────────────────────
let accessToken  = null;
let tokenExpiry  = 0;
let refreshToken = process.env.XERO_REFRESH_TOKEN;

// ── Low-level HTTPS helpers ───────────────────────────────────────────────────
function httpsPost(hostname, path, body, headers) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(body);
    const req = https.request(
      { hostname, path, method: "POST", headers: { "Content-Length": buf.byteLength, ...headers } },
      (res) => {
        let raw = "";
        res.on("data", c => raw += c);
        res.on("end", () => {
          try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
          catch { resolve({ status: res.statusCode, data: raw }); }
        });
      }
    );
    req.on("error", reject);
    req.write(buf);
    req.end();
  });
}

function httpsGet(hostname, urlPath, headers) {
  return new Promise((resolve, reject) => {
    https.get({ hostname, path: urlPath, headers }, (res) => {
      let raw = "";
      res.on("data", c => raw += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, data: raw }); }
      });
    }).on("error", reject);
  });
}

// ── Token management ──────────────────────────────────────────────────────────

async function getAccessToken() {
  // Return cached token if still valid (with 60s buffer)
  if (accessToken && Date.now() < tokenExpiry - 60_000) return accessToken;

  if (!refreshToken) throw new Error("XERO_REFRESH_TOKEN not set in .env — run node xero-setup.js first");
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error("XERO_CLIENT_ID or XERO_CLIENT_SECRET missing in .env");

  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const body        = `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`;

  const { status, data } = await httpsPost(
    "identity.xero.com",
    "/connect/token",
    body,
    { "Authorization": `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" }
  );

  if (data.error) throw new Error(`Xero token refresh failed: ${data.error_description || data.error}`);
  if (status !== 200) throw new Error(`Xero token endpoint returned ${status}`);

  accessToken = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000;

  // Xero rotates refresh tokens — persist the new one to .env
  if (data.refresh_token && data.refresh_token !== refreshToken) {
    refreshToken = data.refresh_token;
    try {
      const envPath    = path.join(__dirname, ".env");
      const envContent = fs.readFileSync(envPath, "utf8");
      const updated    = envContent.replace(/^XERO_REFRESH_TOKEN=.*/m, `XERO_REFRESH_TOKEN=${refreshToken}`);
      fs.writeFileSync(envPath, updated, "utf8");
    } catch (err) {
      console.warn("[Xero] Could not auto-update XERO_REFRESH_TOKEN in .env:", err.message);
      console.warn("[Xero] New refresh token:", refreshToken);
    }
  }

  return accessToken;
}

// ── Xero API request ──────────────────────────────────────────────────────────

async function xeroApi(method, endpoint, body = null) {
  const token    = await getAccessToken();
  const tenantId = getTenantId();

  if (!tenantId) throw new Error("Xero tenant ID not configured in .env");

  const headers = {
    "Authorization":   `Bearer ${token}`,
    "Xero-Tenant-Id":  tenantId,
    "Content-Type":    "application/json",
    "Accept":          "application/json",
  };

  if (method === "GET") {
    const { status, data } = await httpsGet("api.xero.com", `/api.xro/2.0${endpoint}`, headers);
    if (status >= 400) throw new Error(`Xero GET ${endpoint} → ${status}: ${JSON.stringify(data)}`);
    return data;
  }

  const payload      = JSON.stringify(body);
  const { status, data } = await httpsPost(
    "api.xero.com",
    `/api.xro/2.0${endpoint}`,
    payload,
    { ...headers, "Content-Length": Buffer.byteLength(payload) }
  );
  if (status >= 400) throw new Error(`Xero POST ${endpoint} → ${status}: ${JSON.stringify(data)}`);
  return data;
}

// ── Find or create contact ────────────────────────────────────────────────────

async function findOrCreateContact(companyName) {
  const safe = companyName.replace(/"/g, '\\"');
  const res  = await xeroApi("GET", `/Contacts?where=Name%3D%3D%22${encodeURIComponent(safe)}%22`);

  if (res.Contacts && res.Contacts.length > 0) {
    console.log(`[Xero] Found contact: ${res.Contacts[0].Name} (${res.Contacts[0].ContactID})`);
    return res.Contacts[0].ContactID;
  }

  // Contact not found — create it
  const created = await xeroApi("POST", "/Contacts", { Contacts: [{ Name: companyName }] });
  if (!created.Contacts || created.Contacts.length === 0) {
    throw new Error(`Failed to create Xero contact for "${companyName}"`);
  }
  console.log(`[Xero] Created contact: ${companyName} (${created.Contacts[0].ContactID})`);
  return created.Contacts[0].ContactID;
}

// ── Create DRAFT invoice ──────────────────────────────────────────────────────

async function createInvoice(header, lineItems) {
  const contactId = await findOrCreateContact(header.company);

  const invoice = {
    Type:            "ACCREC",
    Contact:         { ContactID: contactId },
    Date:            header.invoiceDate || new Date().toISOString().slice(0, 10),
    DueDate:         header.dueDate     || new Date().toISOString().slice(0, 10),
    InvoiceNumber:   header.invoice,
    Reference:       header.orderNo     || "",
    CurrencyCode:    header.currency    || "USD",
    Status:    "DRAFT",
    LineItems:       lineItems.map(item => ({
      Description: item.product || item.sku || "B2B Product",
      Quantity:    item.qty,
      UnitAmount:  item.unitPrice,
      AccountCode: ACCOUNT_CODE,
    })),
  };

  const result = await xeroApi("POST", "/Invoices", { Invoices: [invoice] });

  if (!result.Invoices || result.Invoices.length === 0) {
    throw new Error("Xero returned no invoice in response");
  }

  const inv = result.Invoices[0];
  console.log(`[Xero] Draft invoice created: ${inv.InvoiceID} | INV ${inv.InvoiceNumber} | ${header.company}`);
  return { xeroInvoiceId: inv.InvoiceID, xeroInvoiceNumber: inv.InvoiceNumber };
}

module.exports = { createInvoice };
