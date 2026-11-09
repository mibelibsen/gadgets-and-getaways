// Gadgets & Getaways: blog og anmeldelser. Fælles kode til forsiden, bloglisten og indlægssiden.
// Indlæg ligger i tabellen gg_posts. Besøgende ser kun udgivne indlæg (RLS). Al tekst bygges med
// textContent, og links og billeder skal være https eller starte med / (aldrig javascript:).
(()=>{
const URL_="https://oevcaujuziyvrqipbuep.supabase.co",KEY="sb_publishable_NaXSNQX_oygK5mKwymivww_42PbewBJ";
const TYPER={review:"Review",guide:"Guide",news:"New & noted"};

const el=(tag,cls,tekst)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(tekst!=null)e.textContent=tekst;return e};
const sikkerUrl=(u,tilladMail)=>{
  u=String(u||"").trim();
  if(/^https:\/\//i.test(u))return u;
  if(/^\/(?!\/)/.test(u))return u;
  if(tilladMail&&/^mailto:[^\s]+$/i.test(u))return u;
  return "";
};
const hent=async path=>{
  const r=await fetch(URL_+"/rest/v1/"+path,{headers:{apikey:KEY}});
  if(!r.ok)throw new Error("HTTP "+r.status);
  return r.json();
};
const dato=iso=>{try{return new Date(iso).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}catch(e){return ""}};
const laesetid=tekst=>Math.max(1,Math.round(String(tekst||"").trim().split(/\s+/).filter(Boolean).length/200));

function billede(url,alt,w,h){
  const src=sikkerUrl(url);if(!src)return null;
  const i=new Image();i.src=src;i.alt=alt||"";i.loading="lazy";if(w)i.width=w;if(h)i.height=h;
  return i;
}

// Kort til lister (forside og bloglisten).
function kort(p){
  const a=el("a","indlaeg");a.href="/blog/"+encodeURIComponent(p.slug);
  const b=el("div","billede moerk");
  const i=billede(p.image_url,p.image_alt,1200,800);if(i)b.append(i);
  a.append(b);
  const m=el("span","meta");m.append(el("span","art",TYPER[p.kind]||p.kind));
  if(p.read_minutes)m.append(el("span","tid",p.read_minutes+" min read"));
  a.append(m,el("strong",null,p.title));
  const af=[];if(p.author_name)af.push("By "+p.author_name);if(p.published_at)af.push(dato(p.published_at));
  if(af.length)a.append(el("span","af",af.join(" · ")));
  return a;
}

// Brødtekst: en lille, sikker markdown. ## overskrift, > citat, - liste, ![tekst](adresse) billede,
// **fed**, *kursiv*, [tekst](adresse). Tomme linjer deler afsnit.
function inline(t,foraeldre,affiliate){
  const re=/\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;let sidst=0,m;
  while((m=re.exec(t))){
    if(m.index>sidst)foraeldre.append(document.createTextNode(t.slice(sidst,m.index)));
    if(m[1]!=null)foraeldre.append(el("strong",null,m[1]));
    else if(m[2]!=null)foraeldre.append(el("em",null,m[2]));
    else{
      const u=sikkerUrl(m[4],true);
      if(u){const a=el("a",null,m[3]);a.href=u;if(/^https?:/i.test(u)){a.target="_blank";a.rel="noopener nofollow"+(affiliate?" sponsored":"")}foraeldre.append(a)}
      else foraeldre.append(document.createTextNode(m[3]));
    }
    sidst=re.lastIndex;
  }
  if(sidst<t.length)foraeldre.append(document.createTextNode(t.slice(sidst)));
}
function brodtekst(tekst,affiliate){
  const f=document.createDocumentFragment();
  String(tekst||"").replace(/\r/g,"").replace(/^(#{2,3} .+)$/gm,"\n\n$1\n\n").split(/\n{2,}/).map(s=>s.trim()).filter(Boolean).forEach(blok=>{
    let m;
    if((m=blok.match(/^(#{2,3}) (.+)$/))){const h=el(m[1].length===2?"h2":"h3");inline(m[2],h,affiliate);f.append(h);return}
    const linjer=blok.split("\n");
    if(linjer.every(l=>/^>/.test(l))){
      const q=el("blockquote","citat");let t=linjer.map(l=>l.replace(/^>\s?/,"")).join(" ").trim();
      if(!/^[“"]/.test(t))t="“"+t+"”";
      inline(t,q,affiliate);f.append(q);return;
    }
    if(linjer.every(l=>/^- /.test(l))){
      const ul=el("ul");linjer.forEach(l=>{const li=el("li");inline(l.slice(2),li,affiliate);ul.append(li)});f.append(ul);return;
    }
    if((m=blok.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/))){
      const i=billede(m[2],m[1]);
      if(i){const fig=el("figure");fig.append(i);if(m[1])fig.append(el("figcaption",null,m[1]));f.append(fig)}
      return;
    }
    const p=el("p");
    linjer.forEach((l,n)=>{if(n)p.append(el("br"));inline(l,p,affiliate)});
    f.append(p);
  });
  return f;
}

window.GG={URL_,KEY,TYPER,el,sikkerUrl,hent,dato,laesetid,billede,kort,brodtekst};

// Forsiden: "From the editors" viser de tre nyeste udgivne indlæg. Er der ingen, står eksemplerne.
const net=document.querySelector("[data-seneste]");
if(net){
  hent("gg_posts?select=slug,kind,title,image_url,image_alt,author_name,published_at,read_minutes&status=eq.published&order=published_at.desc&limit=3")
    .then(rows=>{if(Array.isArray(rows)&&rows.length)net.replaceChildren(...rows.map(kort))})
    .catch(()=>{});
}
})();
