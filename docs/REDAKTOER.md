# Til redaktøren og din Claude

Gadgets & Getaways kører på statiske filer. Du kan arbejde på to måder, og den første kræver ikke kode.

## 1. Dagligt arbejde: admin (ingen GitHub, ingen kode)

Log ind på https://gadgetsandgetaways.com/admin med din mail og din adgangskode. Har du ikke valgt en endnu, så brug linket i invitationsmailen eller «Glemt adgangskode».

| Hvad | Hvor |
| --- | --- |
| Rette tekster på siden | Gå til siden. Nederst til højre står «Rediger siden». Klik i en tekst, ret, tryk «Gem». Det virker på overskrifter, afsnit og lister. |
| Skrive blog og anmeldelser | https://gadgetsandgetaways.com/admin/blog |
| Finde og dele produkter | https://gadgetsandgetaways.com/admin/produkter |
| Invitere eller fjerne personer | https://gadgetsandgetaways.com/admin/team |

**Produkter.** Vælg en kategori, skriv evt. et søgeord, tryk «Søg». Søgningen bruger Gemini med Google-søgning og tjekker hvert link og hver pris. Du ser, om prisen er læst på selve siden eller kun kommer fra søgningen. Er den ikke læst på siden, skal du åbne linket og sætte hak, før produktet kan udgives. Produkterne vises på /gear og, de seks nyeste, på forsiden.

**Brødtekst i indlæg.** Tomme linjer deler afsnit. `## Overskrift`, `> citat`, `- punkt`, `**fed**`, `*kursiv*`, `[tekst](https://adresse)`, `![beskrivelse](https://billede)`.

**Din Claude i browseren.** Har du Claude i Chrome, kan den arbejde i admin for dig. Giv den adressen til siden og beskriv, hvad der skal ske. Den skal ikke indtaste din adgangskode. Du logger ind selv.

### Regler, der altid gælder (også for din Claude)
- Siden er på engelsk. Admin er på dansk.
- **Mærkning:** AI-fundne produkter står som «Found by AI · checked by the editors». Hoteller er «Sponsored», flydeals «Ad». Affiliate-links skal være markeret.
- Skriv ikke noget om et produkt, du ikke har tjekket hos forhandleren eller producenten. Priser ændrer sig, og siden viser, hvornår de er tjekket.
- Opfind ikke tests. En anmeldelse siger, at produktet er testet, så skal det være sandt.
- Forfatterportrættet og navnet på siden er opdigtet indtil nu. Skift dem til rigtige oplysninger, når du skriver som dig selv.

## 2. Ændringer i selve sitet: kode (kræver GitHub)

Skal du ændre design, tilføje sider eller ændre, hvordan siden virker, arbejder din Claude i koden. Det kræver en gratis GitHub-konto, for koden ligger i https://github.com/mibelibsen/gadgets-and-getaways.

1. Opret en konto på https://github.com/signup og send dit brugernavn til Michael. Han tilføjer dig som samarbejdspartner (skriveadgang).
2. Åbn koden med Claude Code. Enten i en tråd på https://claude.ai/code, hvor du forbinder GitHub og vælger repoet, eller lokalt: installér Claude Code efter vejledningen på https://code.claude.com/docs og hent repoet med `git clone https://github.com/mibelibsen/gadgets-and-getaways`.
3. Din Claude læser `CLAUDE.md` i repoet. Der står, hvordan siden er bygget, og hvad der må røres.
4. **Arbejd på en gren, aldrig direkte på `main`.** Giv grenen et kort navn, fx `claude/gear-filter`. Hvert push til en gren giver Vercel en forhåndsvisning, du kan se og godkende. Et push til `main` ruller ud til gadgetsandgetaways.com med det samme.
5. Skriv commit-beskeden gennem en fil (`git commit -F`), ikke `-m`.

### Hvad din Claude ikke må
- Røre Supabase-tabeller uden præfikset `gg_`, eller andre funktioner end `gg-nulstil` og `gg-produktsoeg`. Projektet deles med kassen i Store51 og med mandlige.dk.
- Skrive nøgler eller adgangskoder i koden. Hemmeligheder ligger kun som secrets i Supabase.
- Ændre databasen (nye tabeller, regler). Det aftales med Michael først. Nye tabeller skal have præfikset `gg_` og regler for, hvem der må læse og skrive.

### Test, før noget går live
- Åbn den rigtige forhåndsvisning og prøv hele flowet som en besøgende, på både PC og telefon (360 px bredde).
- Ret du noget, som både besøgende og admin bruger, så prøv begge.
