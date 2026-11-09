// gg-produktsoeg v4: produktsøgning til journalisten på gadgetsandgetaways.com.
// Gemini 2.5 Flash med Google-søgning (samme nøgle GEMINI_API_KEY og samme metode som mf-media-search)
// finder produkter i en kategori. Alt, Gemini siger, kontrolleres, før journalisten ser det:
//   - hvert link hentes, og siden skal findes og handle om produktet,
//   - prisen læses fra selve siden (metadata eller JSON-LD), hvis den kan. Ellers står den som «ikke bekræftet».
// Handlinger: {action:"find", category, query?, antal? (1-30)} og {action:"priser", name, brand?}.
// Søgningen kører som baggrundsjob (tabellen gg_soeg_jobs): funktionen svarer straks med {job}, og siden henter
// resultatet derfra. Find deles i flere samtidige Gemini-kald med hver sin vinkel, og Geminis «tænketid» er slået fra,
// så en søgning bliver færdig inden for tidsgrænsen. Kun administratorer på gg_admins, højst 30 kald i timen pr. person.
// Der gemmes ingen produkter her: journalisten vælger, hvad der skal gemmes, og siden gemmer det i gg_products.
// Udrul med verify_jwt=false.
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

type Offer = { retailer: string; url: string; price: number | null; currency: string; verified: boolean; checked: boolean; checked_at: string; was: number | null; was_verified: boolean; suspect?: boolean };

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
// Hvor stor en del af navnets ord står i teksten? Ord på under fire tegn skal stå som hele ord («pro» må ikke findes i «ørepropper»).
function ordTraef(tekst: string, navn: string): number {
  const kilde = tekst.toLowerCase(); const hele = new Set(ord(kilde));
  const tegn = ord(navn).filter((t) => t.length >= 2);
  if (!tegn.length) return 0;
  return tegn.filter((t) => (t.length >= 4 ? kilde.includes(t) : hele.has(t))).length / tegn.length;
}

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

// Pris, førpris og valuta fra selve siden: metadata først, derefter JSON-LD (Product/Offer).
// Førprisen er prisen før nedsaettelsen (ListPrice/StrikethroughPrice) og tæller kun, hvis den er højere end prisen.
// En side har ofte flere produkter i sin JSON-LD (tilbehør, anbefalinger, afdrag). Når navnet er kendt, bruges kun
// priser fra det produkt, der matcher navnet. Matcher intet, er prisen ikke til at stole på, og der returneres ingen.
type Kand = { pris: number; valuta: string; foer: number | null; navn: string | null };
function navnPasser(fundet: string, navn: string): boolean {
  return ordTraef(dekod(fundet), navn) >= 0.5;
}
function findPris(html: string, navn?: string): { pris: number; valuta: string; foer: number | null } | null {
  const metaFoer = tilTal(meta(html, "product:original_price:amount") || meta(html, "og:price:standard_amount") || meta(html, "product:price:standard_amount"));
  const mp = tilTal(meta(html, "product:price:amount") || meta(html, "og:price:amount"));
  if (mp != null && mp > 0) return { pris: mp, valuta: (meta(html, "product:price:currency") || meta(html, "og:price:currency") || "DKK").toUpperCase().slice(0, 3), foer: metaFoer != null && metaFoer > mp ? metaFoer : null };
  let fund: Kand[] = [];
  const gaa = (o: unknown, dybde = 0, produktnavn: string | null = null) => {
    if (!o || dybde > 8) return;
    if (Array.isArray(o)) { o.forEach((x) => gaa(x, dybde + 1, produktnavn)); return; }
    if (typeof o !== "object") return;
    const ob = o as Record<string, unknown>;
    const eget = typeof ob.name === "string" && /Product/i.test(JSON.stringify(ob["@type"] ?? "")) ? ob.name : produktnavn;
    const p = tilTal(ob.price ?? ob.lowPrice);
    let foer: number | null = null;
    const ps = ob.priceSpecification;
    for (const sp of Array.isArray(ps) ? ps : ps ? [ps] : []) {
      if (sp && typeof sp === "object") {
        const spo = sp as Record<string, unknown>;
        const sfoer = tilTal(spo.price);
        if (/ListPrice|Strikethrough|SRP/i.test(String(spo.priceType ?? "")) && sfoer != null) foer = sfoer;
      }
    }
    if (p != null && p > 0) fund.push({ pris: p, valuta: String(ob.priceCurrency ?? "DKK").toUpperCase().slice(0, 3), foer: foer != null && foer > p ? foer : null, navn: eget });
    for (const k of ["offers", "@graph", "mainEntity", "itemListElement", "item"]) if (ob[k]) gaa(ob[k], dybde + 1, eget);
  };
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { gaa(JSON.parse(m[1])); } catch { /* ugyldig JSON-LD springes over */ }
  }
  if (navn && fund.some((f) => f.navn)) {
    const matcher = fund.filter((f) => f.navn && navnPasser(f.navn, navn));
    if (matcher.length) fund = matcher;
    else { const uden = fund.filter((f) => !f.navn); if (!uden.length) return null; fund = uden; }
  }
  if (!fund.length) return null;
  const dkk = fund.filter((f) => f.valuta === "DKK");
  const brug = dkk.length ? dkk : fund;
  const b = brug.reduce((a, b) => (b.pris < a.pris ? b : a));
  return { pris: b.pris, valuta: b.valuta, foer: b.foer };
}

// Rabat i hele procent. Kun hvis førprisen er højere end prisen.
function rabatPct(foer: number | null | undefined, pris: number | null | undefined): number | null {
  if (foer == null || pris == null || !(foer > pris) || !(pris >= 0)) return null;
  const pct = Math.round(((foer - pris) / foer) * 100);
  return pct >= 1 ? pct : null;
}

// Handler siden om produktet? Mindst halvdelen af produktnavnets ord skal stå i titel, overskrift eller beskrivelse.
function handlerOm(html: string, navn: string): boolean {
  const kilde = [meta(html, "og:title"), html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "", html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, " ") ?? "", meta(html, "og:description")]
    .map(dekod).join(" ").toLowerCase();
  return ordTraef(kilde, navn) >= 0.5;
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
  let foer = tilTal(o.was_price); let foerOk = false;
  if (kunne && s.html) {
    if (!handlerOm(s.html, navn)) return { grund: "Siden handler ikke om produktet" };
    const f = findPris(s.html, navn);
    if (f) { pris = f.pris; valuta = f.valuta; bekraeftet = true; if (f.foer != null) { foer = f.foer; foerOk = true; } }
  }
  if (foer != null && (pris == null || foer <= pris)) { foer = null; foerOk = false; }
  return { offer: { retailer: dekod(String(o.retailer ?? host)).slice(0, 100) || host, url: s.url, price: pris, currency: valuta, verified: bekraeftet, checked: kunne, checked_at: idag(), was: foer, was_verified: foerOk } };
}

// En pris, der er læst på siden, men afviger kraftigt fra de øvrige tilbud på samme produkt (under 40 % eller over 250 %
// af midten af de andre), er mistænkelig: den kan være tilbehør, afdrag eller en forkert variant. Den mister sin
// «bekræftet»-markering og vælges aldrig som laveste pris, men journalisten kan stadig se den.
function markerAfvigende(of: Offer[]): void {
  for (const o of of) {
    if (!o.verified || o.price == null || o.currency !== "DKK") continue;
    const andre = of.filter((x) => x !== o && x.price != null && x.currency === "DKK").map((x) => x.price as number).sort((a, b) => a - b);
    if (!andre.length) continue;
    const midt = andre.length % 2 ? andre[(andre.length - 1) / 2] : (andre[andre.length / 2 - 1] + andre[andre.length / 2]) / 2;
    if (o.price < midt * 0.4 || o.price > midt * 2.5) { o.verified = false; o.suspect = true; o.was = null; o.was_verified = false; }
  }
}

// Billigste tilbud: bekræftede DKK-priser først, derefter andre DKK-priser, ellers det første. Mistænkelige sidst.
function sorter(of: Offer[]): Offer[] {
  const rang = (o: Offer) => (o.suspect ? 4 : o.price == null ? 3 : o.currency === "DKK" ? (o.verified ? 0 : 1) : 2);
  return [...of].sort((a, b) => rang(a) - rang(b) || (a.price ?? 0) - (b.price ?? 0));
}
function bedst(alle: Offer[]): Offer | null {
  const of = alle.some((o) => !o.suspect) ? alle.filter((o) => !o.suspect) : alle;
  const verificeret = of.filter((o) => o.price != null && o.currency === "DKK" && o.verified);
  const dkk = of.filter((o) => o.price != null && o.currency === "DKK");
  const pulje = verificeret.length ? verificeret : dkk.length ? dkk : of.filter((o) => o.price != null);
  if (!pulje.length) return of[0] ?? null;
  return pulje.reduce((a, b) => ((b.price as number) < (a.price as number) ? b : a));
}

// ---------- Gemini og baggrundsjob ----------
// deno-lint-ignore no-explicit-any
const baggrund = (p: Promise<unknown>) => (globalThis as any).EdgeRuntime?.waitUntil?.(p);

// Ét Gemini-kald med Google-søgning. «Tænketid» er slået fra (hurtigere). Afvises det, prøves uden den indstilling.
async function gemini(prompt: string, tidsgraense: number): Promise<Record<string, unknown>[]> {
  const kald = async (udenTaenketid: boolean) => {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), tidsgraense);
    try {
      const cfg: Record<string, unknown> = { temperature: 0.2, maxOutputTokens: 8192 };
      if (udenTaenketid) cfg.thinkingConfig = { thinkingBudget: 0 };
      const g = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI }, signal: ctl.signal,
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: cfg }),
      });
      const gj = await g.json().catch(() => ({}));
      return { ok: g.ok, gj };
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") throw new Error(`Gemini svarede ikke inden for ${Math.round(tidsgraense / 1000)} sekunder`);
      throw e;
    } finally { clearTimeout(t); }
  };
  let r = await kald(true);
  if (!r.ok && /thinking/i.test(String(r.gj?.error?.message ?? ""))) r = await kald(false);
  if (!r.ok) throw new Error("Gemini svarede med fejl: " + (r.gj?.error?.message ?? "ukendt fejl"));
  const tekst: string = (r.gj?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
  try { const m = tekst.replace(/```json|```/g, "").match(/\[[\s\S]*\]/); const a = m ? JSON.parse(m[0]) : []; return Array.isArray(a) ? a : []; } catch { return []; }
}

// Kør fn på alle elementer, højst n ad gangen.
async function pulje<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const ud: R[] = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const x = items[i++]; ud.push(await fn(x)); }
  }));
  return ud;
}

const SPROG_REGLER = `Rules: never invent products or web addresses. Only include products and addresses you found in the search results. Each address must be the product's own page at the shop (not a search page, category page or review). Give prices as a number in the currency shown on the page (normally DKK) and "currency" as a three-letter code, or null if you cannot see the price. "was_price" is the regular price before a discount, only if the shop clearly shows a reduced price, otherwise null. Do not copy text from the websites.`;
const VINKLER = [
  "established premium brands that frequent flyers rely on",
  "best value and mid-range options",
  "newer or less obvious brands with strong reviews",
  "the most compact and lightweight options",
  "options that independent reviewers rate highest",
  "durable options built for heavy weekly travel",
  "premium options with the best comfort or battery life",
  "well-reviewed options sold by Danish shops",
];

async function koerFind(katKode: string, soeg: string, antal: number) {
  const kat = KATEGORIER[katKode];
  const dato = idag();
  const k = Math.min(VINKLER.length, Math.max(1, Math.ceil(antal / 4)));
  const pr = Math.ceil(antal / k) + 1;
  const kald = Array.from({ length: k }, (_, i) => gemini(`Today is ${dato}. You research products for Gadgets & Getaways, a premium travel gear website for frequent flyers and business travellers in Denmark.
Use Google Search to find ${pr} real products that are on sale now in the category "${kat.navn}" (${kat.beskrivelse})${soeg ? `, matching: "${soeg}"` : ""}.${k > 1 ? ` Focus on: ${VINKLER[i]}.` : ""}
Prefer well-reviewed products from established brands that suit people who fly every week. Leave out discontinued products.
For each product, find up to 2 shop pages where it can be bought, preferring Danish shops and shops that ship to Denmark.
Return ONLY a JSON array, no other text. Each item: {"name": the exact product name including the model, "brand": the brand, "why": ONE sentence in English, at most 140 characters, in your own words, saying concretely why it suits frequent flyers (no slogans, no quotation marks), "offers": [{"retailer": shop name, "url": the product page address, "price": number, "currency": "DKK", "was_price": number or null}]}.
${SPROG_REGLER}`, 100000));
  const svar = await Promise.allSettled(kald);
  const fund: Record<string, unknown>[] = []; const fejl: string[] = [];
  svar.forEach((r) => { if (r.status === "fulfilled") fund.push(...r.value); else fejl.push(String((r.reason as Error)?.message ?? r.reason)); });
  if (!fund.length) throw new Error(fejl[0] ?? "Søgningen fandt ingen produkter. Prøv andre søgeord.");

  const { data: kendte } = await admin.from("gg_products").select("name");
  const kendt = new Set((kendte ?? []).map((x: { name: string }) => x.name.toLowerCase()));
  const afvist: { navn: string; grund: string }[] = [];
  const sete = new Set<string>(); const kandidater: Record<string, unknown>[] = [];
  for (const f of fund) {
    const navn = String(f.name ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (navn.length < 3) continue;
    if (kendt.has(navn.toLowerCase())) { afvist.push({ navn, grund: "Findes allerede" }); continue; }
    if (sete.has(navn.toLowerCase())) continue;
    sete.add(navn.toLowerCase()); kandidater.push({ ...f, name: navn });
  }
  const produkter: Record<string, unknown>[] = [];
  await pulje(kandidater.slice(0, antal + 8), 6, async (f) => {
    const navn = String(f.name);
    const why = String(f.why ?? "").replace(/\s+/g, " ").trim();
    if (why.length < 15 || why.length > 200) { afvist.push({ navn, grund: "Begrundelsen har forkert længde" }); return; }
    if (/["“”„«»]/.test(why)) { afvist.push({ navn, grund: "Begrundelsen indeholder citat" }); return; }
    const rae = Array.isArray(f.offers) ? (f.offers as Record<string, unknown>[]).slice(0, 2) : [];
    const offers: Offer[] = []; const set = new Set<string>(); let sidsteGrund = "Ingen tilbud";
    await Promise.all(rae.map(async (o) => {
      const kk = await kontrolOffer(o, navn);
      if (kk.offer && !set.has(kk.offer.url)) { set.add(kk.offer.url); offers.push(kk.offer); } else if (kk.grund) sidsteGrund = kk.grund;
    }));
    if (!offers.length) { afvist.push({ navn, grund: sidsteGrund }); return; }
    markerAfvigende(offers);
    const sorteret = sorter(offers); const b = bedst(sorteret);
    produkter.push({
      name: navn, brand: String(f.brand ?? "").trim().slice(0, 100) || null, why, category: katKode,
      offers: sorteret, price_amount: b?.price ?? null, price_currency: b?.currency ?? "DKK", price_retailer: b?.retailer ?? null,
      price_url: b?.url ?? null, price_verified: !!b?.verified, price_checked_at: dato, source: "ai", found_query: soeg || null,
      price_was: b?.was ?? null, discount_pct: rabatPct(b?.was, b?.price), discount_verified: !!b?.was_verified,
    });
  });
  const notat = fejl.length ? `${fejl.length} af ${k} søgninger blev afbrudt, så der kan være færre forslag end valgt (${fejl[0]}).` : null;
  return { ok: true, model: MODEL, kategori: kat.navn, soeg, fundet: fund.length, produkter: produkter.slice(0, antal), afvist, notat };
}

async function koerPriser(navn: string, maerke: string) {
  const fund = await gemini(`Today is ${idag()}. Use Google Search to find the lowest current prices in Denmark for this exact product: "${(maerke + " " + navn).trim()}". Prefer Danish shops and shops that ship to Denmark. It must be exactly this model.
Return ONLY a JSON array of up to 5 offers, no other text: [{"retailer": shop name, "url": the product page address, "price": number, "currency": "DKK", "was_price": number or null}].
${SPROG_REGLER}`, 100000);
  const afvist: { navn: string; grund: string }[] = []; const offers: Offer[] = []; const set = new Set<string>();
  await pulje(fund.slice(0, 5), 5, async (o) => {
    const kk = await kontrolOffer(o, navn);
    if (kk.offer && !set.has(kk.offer.url)) { set.add(kk.offer.url); offers.push(kk.offer); } else if (kk.grund) afvist.push({ navn: String(o.url ?? ""), grund: kk.grund });
  });
  markerAfvigende(offers);
  const sorteret = sorter(offers);
  return { ok: true, model: MODEL, offers: sorteret, bedst: bedst(sorteret), afvist };
}

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
    const { count: igang } = await admin.from("gg_soeg_jobs").select("id", { count: "exact", head: true }).eq("email", kalder).eq("status", "koerer")
      .gt("created_at", new Date(Date.now() - 5 * 60 * 1000).toISOString());
    if ((igang ?? 0) >= 2) return svar(req, { fejl: "Der kører allerede to søgninger. Vent, til de er færdige." }, 429);

    let katKode = "", soeg = "", antal = 0, navn = "", maerke = "";
    if (action === "find") {
      katKode = String(body.category ?? "");
      if (!KATEGORIER[katKode]) return svar(req, { fejl: "Vælg en kategori." }, 400);
      soeg = String(body.query ?? "").replace(/["“”„«»]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
      antal = Math.min(30, Math.max(1, parseInt(body.antal, 10) || 6));
    } else {
      navn = String(body.name ?? "").trim().slice(0, 200); maerke = String(body.brand ?? "").trim().slice(0, 100);
      if (navn.length < 2) return svar(req, { fejl: "Skriv produktets navn." }, 400);
    }

    await admin.from("gg_soeg_log").insert({ email: kalder, action, category: katKode || null, query: (action === "find" ? soeg : navn) || null });
    await admin.from("gg_soeg_jobs").delete().lt("created_at", new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString());
    const { data: job, error: je } = await admin.from("gg_soeg_jobs").insert({ email: kalder, action, category: katKode || null, query: (action === "find" ? soeg : navn) || null, antal: antal || null }).select("id").single();
    if (je || !job) { console.error(je); return svar(req, { fejl: "Kunne ikke starte søgningen." }, 500); }

    // Svaret sendes straks. Arbejdet fortsætter i baggrunden og gemmer resultatet i jobbet.
    const arbejde = (async () => {
      try {
        const res = action === "find" ? await koerFind(katKode, soeg, antal) : await koerPriser(navn, maerke);
        await admin.from("gg_soeg_jobs").update({ status: "faerdig", resultat: res, finished_at: new Date().toISOString() }).eq("id", job.id);
      } catch (e) {
        console.error("job", job.id, e);
        const besked = e instanceof Error ? e.message : "Noget gik galt.";
        await admin.from("gg_soeg_jobs").update({ status: "fejl", fejl: "Søgningen mislykkedes: " + besked, finished_at: new Date().toISOString() }).eq("id", job.id);
      }
    })();
    baggrund(arbejde);
    return svar(req, { ok: true, job: job.id }, 202);
  } catch (e) {
    console.error(e);
    return svar(req, { fejl: "Noget gik galt. Prøv igen." }, 500);
  }
});
