// gg-nulstil v2: adgang til admin på gadgetsandgetaways.com.
//  1) {email}: sender et link til at vælge ny adgangskode til en eksisterende administrator.
//  2) {action:"invite", email}: kun for en administrator, der er logget ind. Tilføjer personen til
//     gg_admins og sender en invitation. Linket peger på dette site, aldrig på mandlige.dk.
// Adgangslisten er gg_admins (adskilt fra mf_admins). Udrul med verify_jwt=false: invitationer
// tjekker selv kaldets login, nulstilling kaldes uden login.
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
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function sendMail(to: string, url: string, invitation: boolean, af?: string) {
  if (!RESEND) throw new Error("RESEND_API_KEY mangler");
  const intro = invitation
    ? `${af || "En administrator"} har inviteret dig til at redigere og administrere Gadgets & Getaways. Vælg en adgangskode for at komme i gang.`
    : "Her er dit link til at vælge en ny adgangskode til admin på Gadgets & Getaways.";
  const emne = invitation ? "Du er inviteret til Gadgets & Getaways" : "Vælg ny adgangskode til Gadgets & Getaways";
  const knap = invitation ? "Opret adgangskode" : "Vælg ny adgangskode";
  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#0B1220;max-width:520px">
<h1 style="font-family:Georgia,serif;font-weight:400;font-size:32px;margin:0 0 16px">Gadgets &amp; Getaways</h1>
<p style="font-size:16px;line-height:1.5">${esc(intro)}</p>
<p style="margin:24px 0"><a href="${url}" style="display:inline-block;background:#C9A96E;color:#0B1220;font-weight:700;text-decoration:none;padding:14px 26px;border-radius:999px">${knap}</a></p>
<p style="font-size:13px;color:#3F4553">Virker knappen ikke, så kopier dette link ind i browseren:<br>${url}</p>
<p style="font-size:13px;color:#3F4553">Linket virker én gang og udløber efter et døgn. Har du ikke bedt om det, kan du se bort fra mailen.</p></div>`;
  const text = `${intro}\n\n${knap} her (virker én gang, udløber efter et døgn):\n${url}\n\nHar du ikke bedt om dette, kan du se bort fra mailen.`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FRA, to: [to], subject: emne, html, text }),
  });
  if (!r.ok) throw new Error("Resend " + r.status + ": " + (await r.text()));
}

// Højst ét link pr. to minutter og fem i timen pr. adresse. Returnerer true, hvis der må sendes.
async function maaSende(mail: string): Promise<boolean> {
  const nu = Date.now();
  const { data: log } = await admin.from("gg_link_log").select("created_at").eq("email", mail)
    .gt("created_at", new Date(nu - 60 * 60 * 1000).toISOString()).order("created_at", { ascending: false });
  if (log && log.length >= 5) return false;
  if (log && log[0] && nu - new Date(log[0].created_at).getTime() < 2 * 60 * 1000) return false;
  await admin.from("gg_link_log").insert({ email: mail });
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(req) });
  if (req.method !== "POST") return svar(req, { fejl: "Kun POST." }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const mail = String(body.email || "").trim().toLowerCase();
    if (!gyldig(mail)) return svar(req, { fejl: "Mailadressen er ikke gyldig." }, 400);

    // 2) Invitation: kræver login som administrator.
    if (body.action === "invite") {
      const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: u } = await admin.auth.getUser(token);
      const kalder = u?.user?.email?.toLowerCase();
      if (!kalder) return svar(req, { fejl: "Du er ikke logget ind." }, 401);
      const { data: rolle } = await admin.from("gg_admins").select("role").eq("email", kalder).maybeSingle();
      if (rolle?.role !== "topadmin") return svar(req, { fejl: "Kun en administrator kan invitere." }, 403);
      if (!(await maaSende(mail))) return svar(req, { fejl: "Der er sendt et link til den adresse for nylig. Vent to minutter og prøv igen." }, 429);

      const { error: e1 } = await admin.from("gg_admins").upsert({ email: mail, role: "topadmin", invited_by: kalder }, { onConflict: "email", ignoreDuplicates: true });
      if (e1) { console.error(e1); return svar(req, { fejl: "Personen kunne ikke tilføjes." }, 500); }

      let type: "invite" | "recovery" = "invite";
      let r = await admin.auth.admin.generateLink({ type: "invite", email: mail });
      if (r.error && /already|registered|exists/i.test(r.error.message)) {
        r = await admin.auth.admin.generateLink({ type: "recovery", email: mail });
        type = "recovery";
      }
      const th = r.data?.properties?.hashed_token;
      if (r.error || !th) { console.error("generateLink", r.error); return svar(req, { fejl: "Invitationslinket kunne ikke laves." }, 500); }
      const url = SITE + "/admin#token_hash=" + encodeURIComponent(th) + "&type=" + type;
      try { await sendMail(mail, url, type === "invite", kalder); }
      catch (e) { console.error(e); return svar(req, { fejl: "Personen er tilføjet, men mailen kunne ikke sendes. Prøv igen om lidt." }, 502); }
      return svar(req, { ok: true, besked: "Invitation sendt til " + mail + "." });
    }

    // 1) Glemt adgangskode. Svarer altid det samme, så man ikke kan aflæse hvem der har adgang.
    const neutral = { ok: true, besked: "Hvis mailen har adgang, er der nu sendt et link." };
    const { data: p } = await admin.from("gg_admins").select("role").eq("email", mail).maybeSingle();
    if (!p || p.role !== "topadmin") return svar(req, neutral);
    if (!(await maaSende(mail))) return svar(req, neutral);

    const r = await admin.auth.admin.generateLink({ type: "recovery", email: mail });
    const token = r.data?.properties?.hashed_token;
    if (r.error || !token) { console.error("generateLink", r.error); return svar(req, neutral); }
    const url = SITE + "/admin#token_hash=" + encodeURIComponent(token) + "&type=recovery";
    try { await sendMail(mail, url, false); } catch (e) { console.error(e); }
    return svar(req, neutral);
  } catch (e) {
    console.error(e);
    return svar(req, { fejl: "Noget gik galt." }, 500);
  }
});
