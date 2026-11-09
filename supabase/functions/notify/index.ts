// Aardvark notification sender — a Supabase Edge Function.
// Sends booking confirmations, cancellations, reschedules and day-before reminders
// to customers (email, plus text if they opted in) and new-booking alerts to staff.
//
// Deploy: Supabase → Edge Functions → Deploy a new function → Via editor → name it "notify",
// paste this file, and turn OFF "Verify JWT" (this function checks its own secret instead).
// Secrets (Edge Functions → Secrets):
//   NOTIFY_SECRET       required  any long random string; the same value goes in the Vault (see SETUP.md)
//   RESEND_API_KEY      required for email   from resend.com
//   NOTIFY_FROM         required for email   e.g.  Aardvark Pet Grooming <hello@aardvarkgroom.com>
//   NOTIFY_REPLY_TO     optional  where customer replies go, e.g. your Gmail
//   SITE_URL            optional  defaults to https://aardvarkgroom.com
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM   optional, for text messages
//   STAFF_ALERT_PHONES  optional  comma-separated mobile numbers that get a text for each online booking
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.

const env = (k, d = "") => (Deno.env.get(k) || d).trim();

function dbHeaders() {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const h = { "Content-Type": "application/json", apikey: key };
  if (key.startsWith("eyJ")) h.Authorization = "Bearer " + key;
  return h;
}
async function rpc(name, args) {
  const r = await fetch(env("SUPABASE_URL") + "/rest/v1/rpc/" + name, { method: "POST", headers: dbHeaders(), body: JSON.stringify(args) });
  if (!r.ok) throw new Error(name + " failed: " + r.status + " " + (await r.text()).slice(0, 200));
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
async function queuedIds() {
  const since = new Date(Date.now() - 60_000).toISOString();
  const r = await fetch(env("SUPABASE_URL") + "/rest/v1/notifications?select=id&status=eq.queued&attempts=lt.3&created_at=lt." + since + "&order=created_at&limit=25", { headers: dbHeaders() });
  if (!r.ok) throw new Error("queue read failed: " + r.status);
  return (await r.json()).map((x) => x.id);
}

/* ---------- formatting ---------- */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => { n = Number(n) || 0; return "$" + (n % 1 ? n.toFixed(2) : n.toFixed(0)); };
function when(n, iso, opts) { return new Intl.DateTimeFormat("en-US", { timeZone: n.timezone || "America/Chicago", ...opts }).format(new Date(iso)); }
const dayLong = (n, iso) => when(n, iso, { weekday: "long", month: "long", day: "numeric" });
const timeOf = (n, iso) => when(n, iso, { hour: "numeric", minute: "2-digit" });
const firstName = (s) => String(s || "").trim().split(/\s+/)[0] || "there";
function e164(p) {
  const d = String(p || "").replace(/\D/g, "");
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d[0] === "1") return "+" + d;
  return null;
}
function petsList(n) { return [...new Set((n.items || []).map((i) => i.pet))].join(" & "); }

/* ---------- message content ---------- */
function customerMessage(n) {
  const site = env("SITE_URL", "https://aardvarkgroom.com").replace(/\/$/, "");
  const name = firstName(n.customer && n.customer.name), pets = petsList(n);
  const d = dayLong(n, n.starts_at), t = timeOf(n, n.starts_at), addr = String(n.address || "").split(",")[0];
  const copy = {
    booking_confirmed: { subject: `You're booked: ${pets}, ${d} at ${t}`, head: "You're booked!", lead: `we'll see ${esc(pets)} on <b>${esc(d)}</b> at <b>${esc(t)}</b>. We'll text when we're on our way.`,
      sms: `Aardvark: you're booked! ${pets} on ${d} at ${t}, ${addr}. We'll text when we're on our way.` },
    booking_rescheduled: { subject: `New time for ${pets}: ${d} at ${t}`, head: "Your visit has a new time", lead: `${esc(pets)}'s grooming is now on <b>${esc(d)}</b> at <b>${esc(t)}</b>.`,
      sms: `Aardvark: ${pets}'s visit is moved to ${d} at ${t}.` },
    booking_cancelled: { subject: `Cancelled: ${pets} on ${d}`, head: "Your visit is cancelled", lead: `${esc(pets)}'s visit on <b>${esc(d)}</b> at <b>${esc(t)}</b> has been cancelled. We'd love to see you again; book any time below.`,
      sms: `Aardvark: ${pets}'s visit on ${d} at ${t} is cancelled. Rebook any time at ${site}/app/` },
    reminder: { subject: `Reminder: ${pets} tomorrow at ${t}`, head: "See you tomorrow!", lead: `just a reminder: we'll be at ${esc(addr)} <b>tomorrow at ${esc(t)}</b> for ${esc(pets)}. Please make sure we can park close by and have access to an outdoor power outlet if we ask.`,
      sms: `Aardvark reminder: ${pets} tomorrow at ${t}, ${addr}. Need to change? Reply or call us.` }
  }[n.kind];
  const rows = (n.items || []).map((i) => `<tr><td style="padding:8px 0;border-bottom:1px solid #eee3d0"><b>${esc(i.pet)}</b><br><span style="color:#66726d;font-size:13px">${esc(i.service)}</span></td><td style="padding:8px 0;border-bottom:1px solid #eee3d0;text-align:right;white-space:nowrap">${money(i.price)}</td></tr>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#f7f2e8;font-family:Helvetica,Arial,sans-serif;color:#1d2a26">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f2e8;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:18px;overflow:hidden">
<tr><td style="padding:22px 24px 6px;text-align:center"><img src="${site}/assets/logo-nav.png" width="76" height="90" alt="Aardvark Pet Grooming Systems"></td></tr>
<tr><td style="padding:6px 28px 4px"><h1 style="font-family:Georgia,serif;color:#0f4a3c;font-size:24px;margin:0 0 10px">${copy.head}</h1>
<p style="margin:0 0 14px;font-size:15px;line-height:1.5">Hi ${esc(name)}, ${copy.lead}</p></td></tr>
<tr><td style="padding:0 28px"><table role="presentation" width="100%" style="background:#f7f2e8;border-radius:12px;padding:12px 14px;font-size:14px">
<tr><td><b>${esc(d)}</b><br>${esc(timeOf(n, n.starts_at))} – ${esc(timeOf(n, n.ends_at))}<br><span style="color:#66726d">${esc(n.address || "")}</span></td></tr></table></td></tr>
<tr><td style="padding:10px 28px 0"><table role="presentation" width="100%" style="font-size:14px">${rows}
${n.kind !== "booking_cancelled" ? `<tr><td style="padding:10px 0 0;font-weight:bold;color:#0f4a3c">Total</td><td style="padding:10px 0 0;text-align:right;font-weight:bold;color:#0f4a3c">${money(n.total)}</td></tr>` : ""}</table></td></tr>
<tr><td style="padding:20px 28px 8px;text-align:center"><a href="${site}/app/${n.kind === "booking_cancelled" ? "#book" : "#home"}" style="display:inline-block;background:#0f4a3c;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:12px">${n.kind === "booking_cancelled" ? "Book again" : "View your visits"}</a></td></tr>
<tr><td style="padding:10px 28px 24px;color:#66726d;font-size:12px;line-height:1.5;text-align:center">Aardvark Pet Grooming Systems · Mobile, AL<br>Better care. Smarter grooming.</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${copy.head}\n\nHi ${name}, ${copy.lead.replace(/<[^>]+>/g, "")}\n\n${d}, ${timeOf(n, n.starts_at)}–${timeOf(n, n.ends_at)}\n${n.address || ""}\n\n` +
    (n.items || []).map((i) => `${i.pet}: ${i.service} ${money(i.price)}`).join("\n") +
    (n.kind !== "booking_cancelled" ? `\nTotal: ${money(n.total)}` : "") + `\n\n${site}/app/`;
  return { subject: copy.subject, html, text, sms: copy.sms + " Reply STOP to opt out." };
}

function staffMessage(n) {
  const c = n.customer || {};
  const what = { booking_confirmed: "New online booking", booking_cancelled: "Cancelled by customer", booking_rescheduled: "Rescheduled", reminder: "Reminder" }[n.kind];
  const d = dayLong(n, n.starts_at), t = timeOf(n, n.starts_at);
  const lines = (n.items || []).map((i) => `• ${i.pet}: ${i.service} (${money(i.price)})`).join("\n");
  const text = `${what}: ${petsList(n)}, ${d} at ${t}\n\n${lines}\nTotal ${money(n.total)}\n\n${c.name || ""} · ${c.phone || ""} · ${c.email || ""}\n${n.address || ""}` + (n.notes ? `\nNotes: ${n.notes}` : "");
  return { subject: `${what}: ${petsList(n)}, ${d} ${t}`, text, html: `<pre style="font-family:Helvetica,Arial,sans-serif;font-size:14px;white-space:pre-wrap">${esc(text)}</pre>`,
           sms: `Aardvark ${what.toLowerCase()}: ${petsList(n)}, ${d} ${t}, ${String(n.address || "").split(",")[0]}. ${c.name || ""} ${c.phone || ""}` };
}

/* ---------- senders ---------- */
async function sendEmail(to, m) {
  const key = env("RESEND_API_KEY"), from = env("NOTIFY_FROM");
  if (!key || !from) return { skipped: "email not configured" };
  const body = { from, to: Array.isArray(to) ? to : [to], subject: m.subject, html: m.html, text: m.text };
  if (env("NOTIFY_REPLY_TO")) body.reply_to = env("NOTIFY_REPLY_TO");
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error("email " + r.status + " " + (await r.text()).slice(0, 160));
  return { ok: true };
}
async function sendSms(to, body) {
  const sid = env("TWILIO_ACCOUNT_SID"), tok = env("TWILIO_AUTH_TOKEN"), from = env("TWILIO_FROM");
  const num = e164(to);
  if (!sid || !tok || !from) return { skipped: "sms not configured" };
  if (!num) return { skipped: "no valid mobile number" };
  const form = new URLSearchParams({ To: num, Body: body });
  if (from.startsWith("MG")) form.set("MessagingServiceSid", from); else form.set("From", from);
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST", headers: { Authorization: "Basic " + btoa(sid + ":" + tok), "Content-Type": "application/x-www-form-urlencoded" }, body: form });
  if (!r.ok) throw new Error("sms " + r.status + " " + (await r.text()).slice(0, 160));
  return { ok: true };
}

/* ---------- one notification ---------- */
async function processOne(id) {
  const n = await rpc("get_notification", { p_id: id });
  if (!n) return { id, status: "missing" };
  if (n.status === "sent" || n.status === "skipped") return { id, status: n.status, note: "already handled" };
  if (!n.starts_at) { await rpc("mark_notification", { p_id: id, p_status: "skipped", p_error: "booking not found" }); return { id, status: "skipped" }; }
  // A reminder for a visit that has since been cancelled shouldn't go out
  if (n.kind === "reminder" && n.status_now === "Cancelled") { await rpc("mark_notification", { p_id: id, p_status: "skipped", p_error: "visit cancelled" }); return { id, status: "skipped" }; }

  const jobs = [];
  const meta = n.meta || {}, c = n.customer || {};
  if (meta.notify_customer !== false) {
    const m = customerMessage(n);
    if (c.email) jobs.push(["customer email", () => sendEmail(c.email, m)]);
    if (c.sms_opt_in && c.phone) jobs.push(["customer text", () => sendSms(c.phone, m.sms)]);
  }
  // Staff hear about changes customers make (not the ones staff made themselves)
  if (meta.by === "customer" && n.kind !== "reminder") {
    const m = staffMessage(n);
    const emails = (n.staff || []).map((s) => s.email).filter(Boolean);
    if (emails.length) jobs.push(["staff email", () => sendEmail(emails, m)]);
    env("STAFF_ALERT_PHONES").split(",").map((x) => x.trim()).filter(Boolean)
      .forEach((ph) => jobs.push(["staff text " + ph.slice(-4), () => sendSms(ph, m.sms)]));
  }

  const results = [];
  for (const [label, run] of jobs) {
    try { const r = await run(); results.push({ label, ...r }); }
    catch (e) { results.push({ label, error: String(e.message || e) }); }
  }
  const sent = results.filter((r) => r.ok).length, failed = results.filter((r) => r.error);
  const status = failed.length && sent ? "partial" : failed.length ? "error" : sent ? "sent" : "skipped";
  const note = results.filter((r) => !r.ok).map((r) => r.label + ": " + (r.error || r.skipped)).join("; ") || null;
  await rpc("mark_notification", { p_id: id, p_status: status, p_error: note });
  return { id, status, results };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const secret = env("NOTIFY_SECRET");
  if (!secret || req.headers.get("x-aardvark-secret") !== secret) return new Response("Forbidden", { status: 403 });
  try {
    const body = await req.json().catch(() => ({}));
    if (body.sweep) {
      // Retry anything left queued (e.g. if the sender was briefly down)
      const out = [];
      for (const id of await queuedIds()) out.push(await processOne(id));
      return Response.json({ swept: out.length, out });
    }
    if (!body.id) return Response.json({ error: "missing id" }, { status: 400 });
    return Response.json(await processOne(body.id));
  } catch (e) {
    console.error(e);
    return Response.json({ error: String(e.message || e) }, { status: 500 });
  }
});
