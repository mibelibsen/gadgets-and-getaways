// Gadgets & Getaways: redigerbare tekster (samme metode som mandlige.dk). Henter gemte tekster for alle, og viser "Rediger siden" for topadmin.
(()=>{
const URL_="https://oevcaujuziyvrqipbuep.supabase.co",KEY="sb_publishable_NaXSNQX_oygK5mKwymivww_42PbewBJ";
const sti=location.pathname.replace(/\/index\.html$/,"/").replace(/\.html$/,"");
if(document.documentElement.hasAttribute("data-uden-rediger"))return;
if(/^\/admin(\/|$)/.test(sti))return;
const side=sti==="/"||sti===""?"forside":sti.replace(/^\//,"").replace(/\//g,"-");
const VAELG="main h1,main h2,main h3,main p,main label,main legend,main dt,main dd,main li";
const UD="#stem,#kandidater,.besked,[role=status],[role=toolbar]";
function hash(s){let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))>>>0;return h.toString(36)}
const set={},felt=[];
document.querySelectorAll(VAELG).forEach(e=>{
  if(e.closest(UD))return;
  if(e.querySelector("input,select,textarea,button,img,a.knap,h1,h2,h3,p,ul,ol,dl"))return;
  const t=e.textContent.replace(/\s+/g," ").trim();if(!t)return;
  const g=side+"-"+hash(t);set[g]=(set[g]||0)+1;
  e.dataset.tekst=set[g]>1?g+"-"+set[g]:g;felt.push(e);
});
if(!felt.length)return;
const TILLADT={B:1,STRONG:1,I:1,EM:1,A:1,BR:1};
function rens(html){
  const t=document.createElement("template");t.innerHTML=html;
  const gaa=n=>{[...n.childNodes].forEach(c=>{
    if(c.nodeType===3)return;
    if(c.nodeType!==1){c.remove();return}
    if(!TILLADT[c.tagName]){gaa(c);c.replaceWith(...c.childNodes);return}
    [...c.attributes].forEach(a=>{const ok=(c.tagName==="A"&&["href","target","rel"].includes(a.name))||a.name==="style";if(!ok)c.removeAttribute(a.name)});
    if(c.hasAttribute("style")&&!/^\s*(color:\s*var\(--[a-z]+\);?|color:inherit;font-weight:600;?)\s*$/.test(c.getAttribute("style")))c.removeAttribute("style");
    if(c.tagName==="A"){const h=c.getAttribute("href")||"";if(!/^(https?:|mailto:|\/|#)/i.test(h))c.removeAttribute("href");
      else if(/^https?:/i.test(h)&&!/^https?:\/\/(www\.)?gadgetsandgetaways\.com/i.test(h)){c.target="_blank";c.rel="noopener"}}
    gaa(c)})};
  gaa(t.content);return t.innerHTML.replace(/(<br>\s*)+$/,"").trim();
}
fetch(URL_+"/rest/v1/gg_texts?select=key,html&key=like."+encodeURIComponent(side+"-*"),{headers:{apikey:KEY}})
 .then(r=>r.json()).then(d=>{if(!Array.isArray(d))return;const m=Object.fromEntries(d.map(x=>[x.key,x.html]));
   felt.forEach(e=>{const h=m[e.dataset.tekst];if(h!=null&&!e.isContentEditable)e.innerHTML=rens(h)})}).catch(()=>{});

let harLogin=false;try{harLogin=Object.keys(localStorage).some(k=>/^sb-.*-auth-token$/.test(k))}catch(e){}
if(!harLogin)return;
const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";
s.onload=start;document.head.append(s);

async function start(){
  const sb=supabase.createClient(URL_,KEY);
  const {data:{session}}=await sb.auth.getSession();if(!session)return;
  const {data:rolle}=await sb.rpc("mf_role");if(rolle!=="topadmin")return;
  const css=document.createElement("style");css.textContent=`
.red-bar{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:50;display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:flex-end;max-width:calc(100% - 32px);padding:8px;border-radius:28px;background:#070C16;border:1px solid #263043;box-shadow:0 6px 24px rgba(0,0,0,.35)}
.red-bar button{min-height:40px;padding:0 16px;border:0;border-radius:999px;font:600 14px/1 Inter,system-ui,sans-serif;cursor:pointer;background:#263043;color:#F4F1EA}
.red-bar button.hoved{background:#C9A96E;color:#0B1220}
.red-bar button:disabled{opacity:.5;cursor:wait}
.red-bar button[hidden]{display:none}
.red-bar .red-msg{color:#C9CDD6;font:500 13px/1.3 Inter,system-ui,sans-serif;padding:0 8px}
.red-bar .red-msg:empty{display:none}
body.redigerer [data-tekst]{outline:2px dashed #C9A96E;outline-offset:4px;border-radius:4px;cursor:text}
body.redigerer .lys [data-tekst],body.redigerer .sten [data-tekst]{outline-color:#7A5C24}
body.redigerer [data-tekst]:focus{outline-style:solid}
body.redigerer [data-tekst].aendret{outline-color:#FF7A6E;outline-style:solid}
body.redigerer{padding-bottom:120px}`;
  document.head.append(css);
  const bar=document.createElement("div");bar.className="red-bar";bar.setAttribute("role","toolbar");bar.setAttribute("aria-label","Rediger siden");
  const b=(t,fn,kl)=>{const x=document.createElement("button");x.type="button";x.textContent=t;if(kl)x.className=kl;x.addEventListener("mousedown",e=>e.preventDefault());x.addEventListener("click",fn);return x};
  const msg=document.createElement("span");msg.className="red-msg";msg.setAttribute("aria-live","polite");
  let orig=new Map();
  const startKnap=b("Rediger siden",()=>til(true),"hoved");
  const fed=b("Fed",()=>document.execCommand("bold")),kur=b("Kursiv",()=>document.execCommand("italic"));
  const lnk=b("Link",()=>{const sel=getSelection();if(!sel||sel.isCollapsed){msg.textContent="Markér først den tekst, der skal være et link";return}
    const r=sel.getRangeAt(0).cloneRange();const u=prompt("Adresse til linket (fx https://… eller [e-mail]):");if(!u)return;
    sel.removeAllRanges();sel.addRange(r);
    const v=u.trim(),href=/^[^@\s\/]+@[^@\s]+$/.test(v)?"mailto:"+v:(/^(https?:|mailto:|\/|#)/i.test(v)?v:"https://"+v);
    document.execCommand("createLink",false,href);aendringer()});
  const fjernLnk=b("Fjern link",()=>{document.execCommand("unlink");aendringer()});
  const gem=b("Gem",gemAlt,"hoved");
  const annul=b("Annuller",()=>{if(document.querySelector("[data-tekst].aendret")&&!confirm("Vil du kassere dine ændringer?"))return;orig.forEach((h,e)=>e.innerHTML=h);til(false)});
  const redKnapper=[fed,kur,lnk,fjernLnk,annul,gem];
  bar.append(msg,startKnap,...redKnapper);document.body.append(bar);
  const vis=k=>{redKnapper.forEach(x=>x.hidden=!k);startKnap.hidden=k};vis(false);
  const marker=e=>{const el=e.currentTarget||e;el.classList.toggle("aendret",el.innerHTML!==orig.get(el))};
  const aendringer=()=>felt.forEach(e=>marker(e));
  const indsaet=e=>{e.preventDefault();document.execCommand("insertText",false,(e.clipboardData||window.clipboardData).getData("text/plain"))};
  const stopLink=e=>{if(e.target.closest("a"))e.preventDefault()};
  const enter=e=>{if(e.key==="Enter"){e.preventDefault();document.execCommand("insertLineBreak")}};
  function til(on){
    document.body.classList.toggle("redigerer",on);msg.textContent=on?"Klik i en tekst for at rette den":"";
    felt.forEach(e=>{
      if(on){orig.set(e,e.innerHTML);e.contentEditable="true";
        e.addEventListener("input",marker);e.addEventListener("paste",indsaet);e.addEventListener("click",stopLink);e.addEventListener("keydown",enter)}
      else{e.removeAttribute("contenteditable");e.classList.remove("aendret");
        e.removeEventListener("input",marker);e.removeEventListener("paste",indsaet);e.removeEventListener("click",stopLink);e.removeEventListener("keydown",enter)}});
    if(!on)orig=new Map();vis(on);
  }
  addEventListener("beforeunload",e=>{if(document.querySelector("[data-tekst].aendret")){e.preventDefault();e.returnValue=""}});
  async function gemAlt(){
    const aendrede=felt.filter(e=>e.classList.contains("aendret"));
    if(!aendrede.length){til(false);msg.textContent="Ingen ændringer";setTimeout(()=>msg.textContent="",3000);return}
    gem.disabled=true;msg.textContent="Gemmer …";
    const rows=aendrede.map(e=>({key:e.dataset.tekst,html:rens(e.innerHTML)||"&nbsp;",updated_at:new Date().toISOString(),updated_by:session.user.email}));
    const {error}=await sb.from("gg_texts").upsert(rows,{onConflict:"key"});
    gem.disabled=false;
    if(error){msg.textContent="Kunne ikke gemme: "+error.message;return}
    rows.forEach((r,i)=>aendrede[i].innerHTML=r.html);
    til(false);msg.textContent=rows.length===1?"1 tekst gemt":rows.length+" tekster gemt";
    setTimeout(()=>{if(!document.body.classList.contains("redigerer"))msg.textContent=""},4000);
  }
}
})();
