# Gadgets & Getaways (gadgetsandgetaways.com)

Engelsksproget site om rejsegadgets, kufferter, hoteller og flyrejser til frequent flyers og forretningsrejsende. Statiske HTML-, CSS- og JavaScript-filer uden byggetrin, bygget på samme måde som `mibelibsen/mandlige`. Data og redigering ligger i Supabase.

Skriv kode, kommentarer og commit-beskeder på **dansk**. Teksten, som besøgende ser, er på **engelsk**. Redigeringsknappen og admin-siden er kun for ejeren og er på dansk.

## Opsætning
- Repo: `mibelibsen/gadgets-and-getaways`. Vercel-team: `mibelibsens-projects` (team_mQu3h9xnYaeqpVu0FrqCK0QV).
- Domæne: `gadgetsandgetaways.com`, købt hos Vercel 9. november 2026, udløber 9. november 2027, fornyes automatisk. DNS hos Vercel.
- Supabase: samme projekt som mandlige.dk (`Store51`, ref `oevcaujuziyvrqipbuep`). Alle tabeller her har præfikset `gg_`. Rør ikke tabeller uden præfikset, de hører til kassen og mandlige.dk.
- Adgang: egen adgangsliste `gg_admins` (rpc `gg_role()`, rollen `topadmin`), adskilt fra `mf_admins` på mandlige.dk. Brugerkonti ligger i Supabase Auth, som deles med mandlige.dk, men adgang til denne side gives kun gennem `gg_admins`. Alle administratorer kan alt: redigere tekster, skrive blog, uploade billeder og styre teamet. Skjulte elementer skjules med `[hidden]{display:none!important}` i `style.css`. Uden den regel står et element med `display` i stilarket synligt, selv om det er skjult.
- Hemmeligheder (Gemini-nøgle, affiliate-nøgler) hører kun til som secrets i Supabase Edge Functions. Aldrig i koden. Den publishable key i `rediger.js` og `admin/index.html` er offentlig og må stå.

## Filer
- `index.html`: forsiden. `anmeldelse.html`: skabelon til anmeldelser (noindex, indtil rigtige indlæg findes). `advertise.html`: annonceformater og prisliste. `about.html`: om redaktionen, hvordan vi tjener penge, privatliv og cookies.
- `style.css`: designsystemet (tokens i `:root`). Hardcode ikke farver, hvor der findes en token.
- `app.js`: billedpladsholdere, nyhedsbrevsformular, indlæser `rediger.js`.
- `rediger.js`: «Rediger siden» for topadmin. Tekster gemmes i `gg_texts`. Virker på `h1`, `h2`, `h3`, `p`, `label`, `legend`, `dt`, `dd`, `li` inde i `main`. Sider med `data-uden-rediger` på `<html>` og `/admin/` springes over.
- `admin/index.html`: login, «Glemt adgangskode» og valg af ny adgangskode. Efter login står knappen «Rediger siden» nederst til højre på hver side. Nulstilling og invitation går gennem Edge Function `gg-nulstil` v2 (kopi i `supabase/functions/gg-nulstil/`), som kun sender til personer på `gg_admins` og kun linker tilbage til dette site. Invitation kræver login som administrator.
- `admin/produkter.html`: journalistens produktside. Søg med Gemini (Edge Function `gg-produktsoeg`), vurdér forslagene, udgiv eller gem som kladde, rediger egne produkter, upload billeder, find nye priser.
- `gear.html`: produktsiden `/gear` med kategorifilter og søgning for besøgende. `produkter.js`: kort og hentning af udgivne produkter. Forsidens «New finds for the carry-on» viser de seks nyeste udgivne produkter og beholder eksemplerne, til der findes et.
- `admin/team.html`: brugerstyring. Inviter med mail (Edge Function `gg-nulstil`, action `invite`), send nyt link og fjern adgang. Den sidste administrator kan ikke fjernes (trigger i databasen).
- `admin/blog.html`: editor til blog og anmeldelser (kun topadmin). Liste, nyt indlæg, rediger, upload af billeder, udgiv, tag af siden, slet.
- `blog.html`: bloglisten på `/blog` med filter. `post.html`: ét indlæg, vist på `/blog/<adresse>` (rewrite i `vercel.json`). `?preview=1` viser en kladde for topadmin.
- `blog.js`: henter indlæg, bygger kort og brødtekst sikkert med `textContent`. Forsidens «From the editors» viser de tre nyeste udgivne indlæg og beholder eksemplerne, til der findes et.

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
Alle 19 billeder er lagt ind 9. november 2026. De er AI-genererede med Claude Designs prompter. Forfatterportrættet viser en opdigtet person. Skal der stå et rigtigt navn og foto, skal begge udskiftes.

Nye billeder lægges i `/images/` med disse navne. Står pladsholderen med filnavn i HTML, erstatter `app.js` den automatisk, når filen findes.

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

## Blog og anmeldelser i databasen
- `gg_posts`: slug, type (review/guide/news), status (draft/published), titel, manchet, brødtekst, billeder, forfatter, karakter, dom, plus/minus, specifikationer, «testet på», produkt og købslink, affiliate. Besøgende kan kun læse udgivne indlæg. Kun topadmin kan skrive (RLS, `mf_role()`). Udgivelsesdato sættes automatisk, når status bliver published.
- Billeder ligger i lageret `gg-images` (offentligt, højst 5 MB, jpg/png/webp, kun topadmin må uploade).
- Brødtekst er en lille markdown: `## overskrift`, `> citat`, `- liste`, `![tekst](adresse)`, `**fed**`, `*kursiv*`, `[tekst](adresse)`. Links og billeder skal være https eller starte med `/`.
- Siderne bygges i browseren. Google kan læse dem, men indlæg kommer ikke automatisk i `sitemap.xml`.
- `anmeldelse.html` er stadig designets skabelon (noindex) og bruges ikke af bloggen.

## Produktsøgning (journalisten)
- Tabel `gg_products` (kategori AUD/PWR/BAG/TRK/SLP/WRK, navn, begrundelse, tilbud som liste, laveste pris, om prisen er læst på siden, dato for pris, kilde ai/manual). Besøgende læser kun udgivne. Kun administratorer skriver.
- `gg-produktsoeg` v3 (Edge Function, kun administratorer, højst 30 kald i timen, højst to samtidige): kører som **baggrundsjob** (tabellen `gg_soeg_jobs`). Funktionen svarer straks med et job-id, og admin-siden henter resultatet fra jobtabellen hvert 3. sekund. `find` deles i ét Gemini-kald pr. fire forslag (højst fem, hver med sin vinkel), så 1–20 forslag er mulige. Geminis «tænketid» er slået fra for hastighedens skyld. Alt øvrigt: Gemini 2.5 Flash med Google-søgning og den delte nøgle `GEMINI_API_KEY`. Hvert link hentes, siden skal handle om produktet, og prisen læses fra siden (metadata eller JSON-LD). Er den ikke læst på siden, står den som «ikke bekræftet», og journalisten skal sætte hak, før produktet kan udgives. Handlinger: `find` og `priser`. Logges i `gg_soeg_log`.
- **Pris og rabat:** Prisen læses kun fra det produkt på siden, der matcher navnet (JSON-LD kan indeholde tilbehør, afdrag og anbefalinger). Førpris (`price_was`) læses fra `ListPrice`/`StrikethroughPrice` eller meta. En pris læst på siden, der afviger kraftigt fra de andre tilbud (under 40 % eller over 250 % af midten), markeres `suspect`, mister «bekræftet» og vælges aldrig som laveste pris. Opdaget 9. november 2026, da JBL Tour Pro 3 stod til 69 kr. som «bekræftet».
- **Rabat vises kun offentligt, når `discount_verified` er sand** (førprisen er læst på siden, eller journalisten har sat hak). Kort viser «−X %» og overstreget førpris.
- **Sortering:** `/gear` kan sorteres efter nyeste, pris op/ned og største rabat, og filtreres til «Only discounted». Samme sortering findes i admin på forslag og produktliste. Uden pris eller rabat kommer sidst.
- Reglen bag: AI-svar bruges aldrig uden kontrol. Pris, forhandler og dato vises på siden, og «Found by AI · checked by the editors» står på AI-fundne produkter.

## Ikke bygget endnu
Affiliate-partnere (rigtige partnerlinks og sporing), hoteller og flydeals fra partnere og annoncesystem. Sektionerne står med statiske eksempeldata, så de kan kobles på senere. Nyhedsbrevsformularen gemmer ingenting og siger det til besøgende.

## Regler for arbejdet
- Byg DOM med `textContent`, ikke `innerHTML` med brugerdata.
- Nye tabeller skal have RLS. Offentlig skrivning går gennem en Edge Function.
- Skriv commit-beskeden gennem en fil (`git commit -F`), ikke `-m`.
- Hold grennavne korte, så forhåndsvisningens adresse kan skrives uden at slå den op.

## Arbejde med sitet som redaktør (journalisten og hans Claude)
Se `docs/REDAKTOER.md`.
- Dagligt arbejde sker i admin: tekster rettes direkte på siden med «Rediger siden», blog og anmeldelser skrives under /admin/blog, billeder uploades dér.
- Ændringer i selve sitet (kode, design, nye sider) laves i dette repo. Arbejd på en kort gren (`claude/…`), og push den. Vercel bygger en forhåndsvisning af grenen. Et push til `main` er en udrulning til gadgetsandgetaways.com.
- Rør ikke Supabase-tabeller uden præfikset `gg_`, og ret ikke andre funktioner end `gg-nulstil`. Projektet deles med kassen (Store51) og mandlige.dk.
