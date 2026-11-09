// Gadgets & Getaways: produkter, som journalisten deler på siden (tabellen gg_products).
// Kræver blog.js (GG). Besøgende ser kun udgivne produkter (RLS). Al tekst bygges med textContent.
(()=>{
const {el,sikkerUrl,hent,dato}=window.GG;
const KAT={AUD:"Audio & noise cancelling",PWR:"Charging & power",BAG:"Suitcases & bags",TRK:"Tracking & security",SLP:"Sleep & comfort",WRK:"Working on the move"};
const FELT="id,category,name,brand,why,image_url,image_alt,offers,price_amount,price_currency,price_retailer,price_url,price_verified,price_checked_at,source,published_at,affiliate";

const tal=(n,valuta)=>new Intl.NumberFormat("da-DK",{maximumFractionDigits:2}).format(Number(n))+" "+(valuta||"DKK");
const tjekket=d=>{if(!d)return "";try{return dato(d+"T12:00:00Z")}catch(e){return ""}};

function tilbudsLink(url,tekst,cls){
  const u=sikkerUrl(url);if(!u)return null;
  const a=el("a",cls,tekst);a.href=u;a.target="_blank";a.rel="noopener nofollow sponsored";return a;
}

function kort(p){
  const a=el("article","produkt");
  const b=el("div","billede");
  const src=sikkerUrl(p.image_url);
  if(src){const i=new Image();i.src=src;i.alt=p.image_alt||p.name;i.loading="lazy";i.width=1200;i.height=900;b.append(i)}
  else b.textContent=p.category;
  const k=el("div","produkt-krop");
  k.append(el("span","produkt-kat",KAT[p.category]||p.category));
  k.append(el("h3",null,p.name));
  if(p.why)k.append(el("p",null,p.why));
  if(p.source==="ai")k.append(el("span","maerke ai","Found by AI · checked by the editors"));

  const fod=el("div","produkt-fod");
  const pr=el("span","pris");
  if(p.price_amount!=null){
    pr.append(el("strong",null,"From "+tal(p.price_amount,p.price_currency)));
    const linje=[p.price_retailer?"at "+p.price_retailer:"",p.price_checked_at?"price checked "+tjekket(p.price_checked_at):""].filter(Boolean).join(" · ");
    if(linje)pr.append(el("span",null,linje));
  }else pr.append(el("strong",null,"See the offer"));
  fod.append(pr);
  const offers=Array.isArray(p.offers)?p.offers.filter(o=>o&&sikkerUrl(o.url)):[];
  const hoved=tilbudsLink(p.price_url||(offers[0]&&offers[0].url),"See offer","knap-moerk knap-lille");
  if(hoved)fod.append(hoved);
  k.append(fod);

  if(offers.length>1){
    const d=el("details","sammenlign");
    d.append(el("summary",null,"Compare prices ("+offers.length+")"));
    const ul=el("ul");
    offers.forEach(o=>{
      const li=el("li");
      li.append(el("span",null,o.retailer||"Shop"));
      li.append(el("span","dim",o.price!=null?tal(o.price,o.currency):"–"));
      const l=tilbudsLink(o.url,"View");if(l)li.append(l);
      ul.append(li);
    });
    d.append(ul);k.append(d);
  }
  if(p.affiliate)k.append(el("p","mindre","We may earn a commission if you buy through our links."));
  a.append(b,k);
  return a;
}

const hentUdgivne=(grænse)=>hent("gg_products?select="+FELT+"&status=eq.published&order=published_at.desc&limit="+(grænse||200));
window.GP={KAT,FELT,kort,hentUdgivne,tal,tjekket};

// Forsiden: «New finds for the carry-on» viser de nyeste udgivne produkter. Er der ingen, står eksemplerne.
const net=document.querySelector("[data-produkter]");
if(net){
  hentUdgivne(6).then(rows=>{if(Array.isArray(rows)&&rows.length)net.replaceChildren(...rows.map(kort))}).catch(()=>{});
}
})();
