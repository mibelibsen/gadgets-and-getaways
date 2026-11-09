// Gadgets & Getaways: fælles script.

// 1) Billeder. Står der en pladsholder som "[produkt-01.jpg · 1200 × 900]", og filen findes i /images/,
//    erstattes pladsholderen af billedet. Så kan billederne lægges i /images/ uden at ændre HTML.
document.querySelectorAll(".billede").forEach(b=>{
  const m=b.textContent.trim().match(/^\[([a-z0-9-]+\.(?:jpg|jpeg|png|webp))\b/i);
  if(!m)return;
  const img=new Image();
  img.onload=()=>{
    img.alt=b.dataset.alt||"";
    img.loading="lazy";
    b.textContent="";
    b.append(img);
    if(!b.dataset.alt)b.removeAttribute("aria-label"),b.removeAttribute("role");
  };
  img.src="/images/"+m[1];
});

// 2) Nyhedsbrev. Tilmeldingen er ikke koblet på endnu, så formularen siger det i stedet for at tie.
document.querySelectorAll("[data-nyhedsbrev]").forEach(f=>{
  const status=f.querySelector(".status");
  f.addEventListener("submit",e=>{
    e.preventDefault();
    const mail=f.querySelector("input[type=email]");
    if(!mail.value||!mail.checkValidity()){status.textContent="Please enter a valid email address.";mail.focus();return}
    status.textContent="Sign-up opens soon. We have not saved your email.";
  });
});

// 3) Redigering af tekster (kun synlig for topadmin efter login på /admin/).
{const s=document.createElement("script");s.src="/rediger.js";document.head.append(s)}
