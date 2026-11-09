# Gadgets & Getaways (gadgetsandgetaways.com)

Engelsksproget site om rejsegadgets, kufferter, hoteller og flyrejser til frequent flyers og forretningsrejsende. Statiske HTML-, CSS- og JavaScript-filer uden byggetrin, bygget på samme måde som `mibelibsen/mandlige`. Data og redigering ligger i Supabase.

Skriv kode, kommentarer og commit-beskeder på **dansk**. Teksten, som besøgende ser, er på **engelsk**. Redigeringsknappen og admin-siden er kun for ejeren og er på dansk.

## Opsætning
- Repo: `mibelibsen/gadgets-and-getaways`. Vercel-team: `mibelibsens-projects` (team_mQu3h9xnYaeqpVu0FrqCK0QV).
- Domæne: `gadgetsandgetaways.com`, købt hos Vercel 9. november 2026, udløber 9. november 2027, fornyes automatisk. DNS hos Vercel.
- Supabase: samme projekt som mandlige.dk (`Store51`, ref `oevcaujuziyvrqipbuep`). Alle tabeller her har præfikset `gg_`. Rør ikke tabeller uden præfikset, de hører til kassen og mandlige.dk.
- Login: samme konti som mandlige.dk (rpc `mf_role`, rollen `topadmin`).
- Hemmeligheder (Gemini-nøgle, affiliate-nøgler) hører kun til som secrets i Supabase Edge Functions. Aldrig i koden. Den publishable key i `rediger.js` og `admin/index.html` er offentlig og må stå.

## Filer
- `index.html`: forsiden. `anmeldelse.html`: skabelon til anmeldelser (noindex, indtil rigtige indlæg findes). `advertise.html`: annonceformater og prisliste. `about.html`: om redaktionen, hvordan vi tjener penge, privatliv og cookies.
- `style.css`: designsystemet (tokens i `:root`). Hardcode ikke farver, hvor der findes en token.
- `app.js`: billedpladsholdere, nyhedsbrevsformular, indlæser `rediger.js`.
- `rediger.js`: «Rediger siden» for topadmin. Tekster gemmes i `gg_texts`. Virker på `h1`, `h2`, `h3`, `p`, `label`, `legend`, `dt`, `dd`, `li` inde i `main`. Sider med `data-uden-rediger` på `<html>` og `/admin/` springes over.
- `admin/index.html`: login. Efter login står knappen «Rediger siden» nederst til højre på hver side.

## Design
Kilde: designpakken fra Claude Design (Main, Anmeldelse, Designsystem, Annoncer).
- Skrift: Instrument Serif (400 og kursiv, aldrig fed), Inter 400/500/600, JetBrains Mono 400/500 til labels, koder og priser (versaler). Fra Google Fonts.
- Farver: `--midnight` #0B1220, `--deep` #070C16, `--navy` #1B2A47, `--ivory` #F4F1EA, `--stone` #E7E2D8, `--champagne` #C9A96E. Champagne bruges kun som tekst på mørk bund. På lys bund bruges `--brass` #7A5C24.
- Knapper 52 px (små 44 px), pille-form. Fokus: 2 px outline i accentfarven. Alt skal virke ned til 360 px uden vandret scroll.

## Mærkning (skal overholdes)
- Produktforslag: «Found by AI · checked by the editors», plus pris, forhandler og affiliate-note.
- Hoteller: «Sponsored». Flydeals: «Ad». Annoncer står altid på mørk (navy/midnight) flade.
- Topbar og footer oplyser om affiliate-links.

## Pladsholdere
Tekst i [klammer] er pladsholdere og bliver stående, til Michael leverer indhold. Mangler: e-mail, CVR-nr., rigtige produkter, priser og forhandlere, hotel- og flypartnere, annoncepriser, privatlivspolitik, cookies, forfatter.

## Billeder
Lægges i `/images/` med disse navne. Står pladsholderen med filnavn i HTML, erstatter `app.js` den automatisk, når filen findes.

| Fil | Mål (px) | Bruges |
| --- | --- | --- |
| ugens-fund.jpg | 1600 × 1000 | Forside, boarding pass |
| produkt-01 … produkt-06.jpg | 1200 × 900 | Forside, produktforslag |
| hotel-hero.jpg | 1600 × 1100 | Forside, stort hotelkort |
| hotel-02.jpg, hotel-03.jpg | 800 × 500 | Forside, små hotelkort |
| kuffert-01 … kuffert-03.jpg | 600 × 1000 | Forside, kuffert-guiden |
| blog-01 … blog-03.jpg | 1200 × 800 | Forside, «From the editors» |
| anmeldelse-top.jpg | 2100 × 900 | Topbillede pr. anmeldelse |
| forfatter.jpg | 200 × 200 | Forfatterportræt |
| og-image.jpg | 1200 × 630 | Deling på sociale medier |

## Ikke bygget endnu
Gemini-produktforslag, godkendelsesflow, prissammenligning, affiliate-partnere, blog i database og annoncesystem. Sektionerne står med statiske eksempeldata, så de kan kobles på senere. Nyhedsbrevsformularen gemmer ingenting og siger det til besøgende.

## Regler for arbejdet
- Byg DOM med `textContent`, ikke `innerHTML` med brugerdata.
- Nye tabeller skal have RLS. Offentlig skrivning går gennem en Edge Function.
- Skriv commit-beskeden gennem en fil (`git commit -F`), ikke `-m`.
- Hold grennavne korte, så forhåndsvisningens adresse kan skrives uden at slå den op.
