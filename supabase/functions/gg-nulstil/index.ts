// gg-nulstil v1: nulstilling af adgangskode til admin på gadgetsandgetaways.com.
// Sender et link, der peger på gadgetsandgetaways.com/admin med token_hash, så man vælger ny
// adgangskode på dette site og ikke på mandlige.dk. Kun topadmins får et link. Funktionen
// kan ikke invitere nye personer. Udrul med verify_jwt=false (kaldes uden login).
// Mailen sendes via Resend. Afsender kan sættes med secret GG_MAIL_FRA.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SITE = "https://gadgetsandgetaways.com";
const TILLADT_ORIGIN = (o: string | null) =>
  o === SITE || o === "https://www.gadgetsandgetaways.com" || /^http:\/\/localhost(:\d+)?$/.test(o || "") ? o! : SITE;

const corsFor = (req: Request) => ({
  "Access-Control-Allow-Origin": TILLADT_ORIGIN(req.headers.get("Origin")),
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});
const svar = (req: Request, data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsFor(req), "Content-Type": "application/json" } });

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const RESEND = Deno.env.get("RESEND_API_KEY");
const FRA = Deno.env.get("GG_MAIL_FRA") || "Gadgets & Getaways <noreply@mandlige.dk>";
const gyldig = (m: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m) && m.length <= 200;

async function sendMail(to: string, url: string) {
  if (!RESEND) throw new Error("RESEND_API_KEY mangler");
  const intro = "Her er dit link til at vælge en ny adgangskode til admin på Gadgets & Getaways.";
  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#0B1220;max-width:520px">
<h1 style="font-family:Georgia,serif;font-weight:400;font-size:32px;margin:0 0 16px">Gadgets &amp; Getaways</h1>
<p style="font-size:16px;line-height:1.5">${intro}</p>
<p style="margin:24px 0"><a href="${url}" style="display:inline-block;background:#C9A96E;color:#0B1220;font-weight:700;text-decoration:none;padding:14px 26px;border-radius:999px">Vælg ny adgangskode</a></p>
<p style="font-size:13px;color:#3F4553">Virker knappen ikke, så kopier dette link ind i browseren:<br>${url}</p>
<p style="font-size:13px;color:#3F4553">Linket virker én gang og udløber efter et døgn. Har du ikke bedt om det, kan du se bort fra mailen.</p></div>`;
  const text = `${intro}\n\nVælg ny adgangskode her (virker én gang, udløber efter et døgn):\n${url}\n\nHar du ikke bedt om dette, kan du se bort fra mailen.`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FRA, to: [to], subject: "Vælg ny adgangskode til Gadgets & Getaways", html, text }),
  });
  if (!r.ok) throw new Error("Resend " + r.status + ": " + (await r.text()));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(req) });
  if (req.method !== "POST") return svar(req, { fejl: "Kun POST." }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const mail = String(body.email || "").trim().toLowerCase();
    if (!gyldig(mail)) return svar(req, { fejl: "Mailadressen er ikke gyldig." }, 400);

    // Svarer altid det samme, så man ikke kan aflæse hvem der har adgang.
    const neutral = { ok: true, besked: "Hvis mailen har adgang, er der nu sendt et link." };

    const { data: p } = await admin.from("mf_admins").select("role").eq("email", mail).maybeSingle();
    if (!p || p.role !== "topadmin") return svar(req, neutral);

    // Højst ét link pr. to minutter og fem i timen pr. adresse.
    const nu = Date.now();
    const { data: log } = await admin.from("gg_link_log").select("created_at").eq("email", mail)
      .gt("created_at", new Date(nu - 60 * 60 * 1000).toISOString()).order("created_at", { ascending: false });
    if (log && log.length >= 5) return svar(req, neutral);
    if (log && log[0] && nu - new Date(log[0].created_at).getTime() < 2 * 60 * 1000) return svar(req, neutral);
    await admin.from("gg_link_log").insert({ email: mail });

    const r = await admin.auth.admin.generateLink({ type: "recovery", email: mail });
    const token = r.data?.properties?.hashed_token;
    if (r.error || !token) { console.error("generateLink", r.error); return svar(req, neutral); }
    const url = SITE + "/admin#token_hash=" + encodeURIComponent(token) + "&type=recovery";
    try { await sendMail(mail, url); } catch (e) { console.error(e); }
    return svar(req, neutral);
  } catch (e) {
    console.error(e);
    return svar(req, { fejl: "Noget gik galt." }, 500);
  }
});
