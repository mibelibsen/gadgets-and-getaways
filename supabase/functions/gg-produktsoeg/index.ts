// gg-produktsoeg v1: produktsøgning til journalisten på gadgetsandgetaways.com.
// Gemini 2.5 Flash med Google-søgning (samme nøgle GEMINI_API_KEY og samme metode som mf-media-search)
// finder produkter i en kategori. Alt, Gemini siger, kontrolleres, før journalisten ser det:
//   - hvert link hentes, og siden skal findes og handle om produktet,
//   - prisen læses fra selve siden (metadata eller JSON-LD), hvis den kan. Ellers står den som «ikke bekræftet».
// Handlinger: {action:"find", category, query?, antal?} og {action:"priser", name, brand?}.
// Kun administratorer på gg_admins. Højst 30 kald i timen pr. person. Der gemmes intet her: journalisten
// vælger, hvad der skal gemmes, og siden gemmer det i gg_products. Udrul med verify_jwt=false.
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
const GEMINI = Deno.env.get("GEMINI_API_KEY") ?? "";
const MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
const MAX_I_TIMEN = 30;

const KATEGORIER: Record<string, { navn: string; beskrivelse: string }> = {
  AUD: { navn: "Audio & noise cancelling", beskrivelse: "noise-cancelling headphones and earbuds, airplane audio adapters, travel earplugs" },
  PWR: { navn: "Charging & power", beskrivelse: "power banks, compact multi-port chargers, universal travel adapters, charging cables and organisers" },
  BAG: { navn: "Suitcases & bags", beskrivelse: "cabin and checked suitcases, weekender bags, packing cubes, tech organisers" },
  TRK: { navn: "Tracking & security", beskrivelse: "luggage trackers, TSA locks, RFID-blocking wallets and passport covers, travel safes" },
  SLP: { navn: "Sleep & comfort", beskrivelse: "sleep masks, neck pillows, travel blankets, earplugs, compression socks" },
  WRK: { navn: "Working on the move", beskrivelse: "laptop stands, portable monitors, travel routers, compact keyboards and mice, laptop sleeves" },
};

type Offer = { retailer: string; url: string; price: number | null; currency: string; verified: boolean; checked: boolean; checked_at: string };

// ---------- hjælpere ----------
const dekod = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, " ").trim();
const ord = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
const meta = (html: string, navn: string) => {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${navn}["'][^>]*>`, "i");
  const m = html.match(re)?.[0];
  return m ? (m.match(/content=["']([^"']*)["']/i)?.[1] ?? "").trim() : "";
};
// Kun almindelige, offentlige adresser: ikke IP-adresser, localhost eller interne navne.
function offentligHost(h: string) {
  if (!h.includes(".")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":")) return false;
  return !/(^|\.)(localhost|local|internal|lan|home|corp)$/i.test(h);
}
const idag = () => new Date().toISOString().slice(0, 10);

async function hentSide(url: string) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 9000);
  try {
    let u = url;
    if (/vertexaisearch\.cloud\.google\.com/.test(u)) {
      const r = await fetch(u, { redirect: "manual", signal: ctl.signal });
      u = r.headers.get("location") ?? u; await r.body?.cancel();
    }
    let p: URL; try { p = new URL(u); } catch { return { status: -1, url: u, html: "" }; }
    if (p.protocol !== "https:" || !offentligHost(p.hostname)) return { status: -1, url: u, html: "" };
    const r = await fetch(u, { redirect: "follow", signal: ctl.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; GadgetsGetawaysLinkCheck/1.0; +https://gadgetsandgetaways.com)", "Accept-Language": "da,en;q=0.8" } });
    let html = "";
    if (r.ok) { const buf = await r.arrayBuffer(); html = new TextDecoder().decode(buf.slice(0, 400000)); } else await r.body?.cancel();
    return { status: r.status, url: r.url || u, html };
  } catch { return { status: 0, url, html: "" }; } finally { clearTimeout(t); }
}

// Tal som «1.299,00», «1299.00» eller 1299.
function tilTal(v: unknown): number | null {
  if (typeof v === "number") return isFinite(v) && v >= 0 ? v : null;
  if (typeof v !== "string") return null;
  let s = v.replace(/[^\d.,]/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (s.includes(",")) s = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  else if (/\.\d{3}$/.test(s) && (s.match(/\./g) || []).length >= 1) s = s.replace(/\./g, "");
  const n = parseFloat(s);
  return isFinite(n) && n >= 0 ? n : null;
}

// Pris og valuta fra selve siden: metadata først, derefter JSON-LD (Product/Offer).
function findPris(html: string): { pris: number; valuta: string } | null {
  const mp = tilTal(meta(html, "product:price:amount") || meta(html, "og:price:amount"));
  if (mp != null && mp > 0) return { pris: mp, valuta: (meta(html, "product:price:currency") || meta(html, "og:price:currency") || "DKK").toUpperCase().slice(0, 3) };
  const fund: { pris: number; valuta: string }[] = [];
  const gaa = (o: unknown, dybde = 0) => {
    if (!o || dybde > 8) return;
    if (Array.isArray(o)) { o.forEach((x) => gaa(x, dybde + 1)); return; }
    if (typeof o !== "object") return;
    const ob = o as Record<string, unknown>;
    const p = tilTal(ob.price ?? ob.lowPrice);
    if (p != null && p > 0) fund.push({ pris: p, valuta: String(ob.priceCurrency ?? "DKK").toUpperCase().slice(0, 3) });
    for (const k of ["offers", "@graph", "mainEntity", "itemListElement", "item"]) if (ob[k]) gaa(ob[k], dybde + 1);
  };
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { gaa(JSON.parse(m[1])); } catch { /* ugyldig JSON-LD springes over */ }
  }
  if (!fund.length) return null;
  const dkk = fund.filter((f) => f.valuta === "DKK");
  const brug = dkk.length ? dkk : fund;
  return brug.reduce((a, b) => (b.pris < a.pris ? b : a));
}

// Handler siden om produktet? Mindst halvdelen af produktnavnets ord skal stå i titel, overskrift eller beskrivelse.
function handlerOm(html: string, navn: string): boolean {
  const kilde = [meta(html, "og:title"), html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "", html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, " ") ?? "", meta(html, "og:description")]
    .map(dekod).join(" ").toLowerCase();
  const tegn = ord(navn).filter((t) => t.length >= 2);
  if (!tegn.length) return false;
  const traef = tegn.filter((t) => kilde.includes(t)).length;
  return traef / tegn.length >= 0.5;
}

async function kontrolOffer(o: Record<string, unknown>, navn: string): Promise<{ offer?: Offer; grund?: string }> {
  const raa = String(o.url ?? "").trim();
  if (!/^https:\/\//i.test(raa)) return { grund: "Mangler gyldigt https-link" };
  const s = await hentSide(raa);
  if (s.status === -1) return { grund: "Ugyldigt eller ikke-offentligt link" };
  if (s.status === 404 || s.status === 410) return { grund: "Siden findes ikke (" + s.status + ")" };
  const kunne = s.status >= 200 && s.status < 300;
  if (!kunne && ![401, 402, 403, 429, 0].includes(s.status)) return { grund: "Siden svarede " + s.status };
  let host = ""; try { host = new URL(s.url).hostname.replace(/^www\./, ""); } catch { /* */ }
  let pris = tilTal(o.price); let valuta = String(o.currency ?? "DKK").toUpperCase().slice(0, 3) || "DKK"; let bekraeftet = false;
  if (kunne && s.html) {
    if (!handlerOm(s.html, navn)) return { grund: "Siden handler ikke om produktet" };
    const f = findPris(s.html);
    if (f) { pris = f.pris; valuta = f.valuta; bekraeftet = true; }
  }
  return { offer: { retailer: dekod(String(o.retailer ?? host)).slice(0, 100) || host, url: s.url, price: pris, currency: valuta, verified: bekraeftet, checked: kunne, checked_at: idag() } };
}

// Billigste tilbud: bekræftede DKK-priser først, derefter andre DKK-priser, ellers det første.
function sorter(of: Offer[]): Offer[] {
  const rang = (o: Offer) => (o.price == null ? 3 : o.currency === "DKK" ? (o.verified ? 0 : 1) : 2);
  return [...of].sort((a, b) => rang(a) - rang(b) || (a.price ?? 0) - (b.price ?? 0));
}
function bedst(of: Offer[]): Offer | null {
  const verificeret = of.filter((o) => o.price != null && o.currency === "DKK" && o.verified);
  const dkk = of.filter((o) => o.price != null && o.currency === "DKK");
  const pulje = verificeret.length ? verificeret : dkk.length ? dkk : of.filter((o) => o.price != null);
  if (!pulje.length) return of[0] ?? null;
  return pulje.reduce((a, b) => ((b.price as number) < (a.price as number) ? b : a));
}

async function spoerg(prompt: string): Promise<Record<string, unknown>[]> {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 110000);
  try {
    const g = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI }, signal: ctl.signal,
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.2 } }),
    });
    const gj = await g.json().catch(() => ({}));
    if (!g.ok) throw new Error("Gemini svarede med fejl: " + (gj?.error?.message ?? g.status));
    const tekst: string = (gj?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
    try { const m = tekst.replace(/```json|```/g, "").match(/\[[\s\S]*\]/); const a = m ? JSON.parse(m[0]) : []; return Array.isArray(a) ? a : []; } catch { return []; }
  } finally { clearTimeout(t); }
}

const SPROG_REGLER = `Rules: never invent products or web addresses. Only include products and addresses you found in the search results. Each address must be the product's own page at the shop (not a search page, category page or review). Give prices as a number in the currency shown on the page (normally DKK) and "currency" as a three-letter code, or null if you cannot see the price. Do not copy text from the websites.`;

// ---------- server ----------
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(req) });
  if (req.method !== "POST") return svar(req, { fejl: "Kun POST." }, 405);
  try {
    if (!GEMINI) return svar(req, { fejl: "GEMINI_API_KEY mangler i Supabase Edge Function secrets." }, 500);

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await admin.auth.getUser(token);
    const kalder = u?.user?.email?.toLowerCase();
    if (!kalder) return svar(req, { fejl: "Du er ikke logget ind." }, 401);
    const { data: rolle } = await admin.from("gg_admins").select("role").eq("email", kalder).maybeSingle();
    if (rolle?.role !== "topadmin") return svar(req, { fejl: "Kun en administrator kan søge efter produkter." }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body.action;
    if (action !== "find" && action !== "priser") return svar(req, { fejl: "Ukendt handling." }, 400);

    const { count } = await admin.from("gg_soeg_log").select("id", { count: "exact", head: true }).eq("email", kalder)
      .gt("created_at", new Date(Date.now() - 3600 * 1000).toISOString());
    if ((count ?? 0) >= MAX_I_TIMEN) return svar(req, { fejl: `Der er søgt ${MAX_I_TIMEN} gange den seneste time. Vent lidt og prøv igen.` }, 429);

    const dato = idag();

    if (action === "priser") {
      const navn = String(body.name ?? "").trim().slice(0, 200), mærke = String(body.brand ?? "").trim().slice(0, 100);
      if (navn.length < 2) return svar(req, { fejl: "Skriv produktets navn." }, 400);
      await admin.from("gg_soeg_log").insert({ email: kalder, action: "priser", query: navn.slice(0, 200) });
      const fund = await spoerg(`Today is ${dato}. Use Google Search to find the lowest current prices in Denmark for this exact product: "${(mærke + " " + navn).trim()}". Prefer Danish shops and shops that ship to Denmark. It must be exactly this model.
Return ONLY a JSON array of up to 5 offers, no other text: [{"retailer": shop name, "url": the product page address, "price": number, "currency": "DKK"}].
${SPROG_REGLER}`);
      const afvist: { navn: string; grund: string }[] = [];
      const offers: Offer[] = [];
      const set = new Set<string>();
      await Promise.all(fund.slice(0, 5).map(async (o) => {
        const k = await kontrolOffer(o, navn);
        if (k.offer && !set.has(k.offer.url)) { set.add(k.offer.url); offers.push(k.offer); } else if (k.grund) afvist.push({ navn: String(o.url ?? ""), grund: k.grund });
      }));
      const sorteret = sorter(offers);
      return svar(req, { ok: true, model: MODEL, offers: sorteret, bedst: bedst(sorteret), afvist });
    }

    // find
    const kat = KATEGORIER[String(body.category ?? "")];
    if (!kat) return svar(req, { fejl: "Vælg en kategori." }, 400);
    const soeg = String(body.query ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
    const antal = Math.min(8, Math.max(1, parseInt(body.antal, 10) || 6));
    await admin.from("gg_soeg_log").insert({ email: kalder, action: "find", category: String(body.category), query: soeg || null });

    const { data: kendte } = await admin.from("gg_products").select("name");
    const kendt = new Set((kendte ?? []).map((k: { name: string }) => k.name.toLowerCase()));

    const fund = await spoerg(`Today is ${dato}. You research products for Gadgets & Getaways, a premium travel gear website for frequent flyers and business travellers in Denmark.
Use Google Search to find ${antal} real products that are on sale now in the category "${kat.navn}" (${kat.beskrivelse})${soeg ? `, matching: "${soeg}"` : ""}.
Prefer well-reviewed products from established brands that suit people who fly every week. Vary the brands where you can. Leave out discontinued products.
For each product, find up to 3 shop pages where it can be bought, preferring Danish shops and shops that ship to Denmark.
Return ONLY a JSON array, no other text. Each item: {"name": the exact product name including the model, "brand": the brand, "why": ONE sentence in English, at most 140 characters, in your own words, saying concretely why it suits frequent flyers (no slogans, no quotation marks), "offers": [{"retailer": shop name, "url": the product page address, "price": number, "currency": "DKK"}]}.
${SPROG_REGLER}`);

    const afvist: { navn: string; grund: string }[] = [];
    const produkter: Record<string, unknown>[] = [];
    const sete = new Set<string>();
    await Promise.all(fund.slice(0, antal + 2).map(async (f) => {
      const navn = String(f.name ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
      if (navn.length < 3) return;
      if (kendt.has(navn.toLowerCase()) || sete.has(navn.toLowerCase())) { afvist.push({ navn, grund: "Findes allerede" }); return; }
      const why = String(f.why ?? "").replace(/\s+/g, " ").trim();
      if (why.length < 15 || why.length > 200) { afvist.push({ navn, grund: "Begrundelsen har forkert længde" }); return; }
      if (/["“”„«»]/.test(why)) { afvist.push({ navn, grund: "Begrundelsen indeholder citat" }); return; }
      const rae = Array.isArray(f.offers) ? (f.offers as Record<string, unknown>[]).slice(0, 3) : [];
      const offers: Offer[] = []; const set = new Set<string>();
      let sidsteGrund = "Ingen tilbud";
      await Promise.all(rae.map(async (o) => {
        const k = await kontrolOffer(o, navn);
        if (k.offer && !set.has(k.offer.url)) { set.add(k.offer.url); offers.push(k.offer); } else if (k.grund) sidsteGrund = k.grund;
      }));
      if (!offers.length) { afvist.push({ navn, grund: sidsteGrund }); return; }
      sete.add(navn.toLowerCase());
      const sorteret = sorter(offers); const b = bedst(sorteret);
      produkter.push({
        name: navn, brand: String(f.brand ?? "").trim().slice(0, 100) || null, why, category: String(body.category),
        offers: sorteret, price_amount: b?.price ?? null, price_currency: b?.currency ?? "DKK", price_retailer: b?.retailer ?? null,
        price_url: b?.url ?? null, price_verified: !!b?.verified, price_checked_at: dato, source: "ai", found_query: soeg || null,
      });
    }));
    return svar(req, { ok: true, model: MODEL, kategori: kat.navn, soeg, fundet: fund.length, produkter: produkter.slice(0, antal), afvist });
  } catch (e) {
    console.error(e);
    const besked = e instanceof Error ? e.message : "Noget gik galt.";
    return svar(req, { fejl: /Gemini|abort/i.test(besked) ? "Søgningen mislykkedes: " + besked : "Noget gik galt. Prøv igen." }, 500);
  }
});
