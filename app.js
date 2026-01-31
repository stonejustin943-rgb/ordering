let DATA=null;
let CART={}; // elementId -> qty

const fmtCAD = (n) => new Intl.NumberFormat(undefined,{style:"currency",currency:"CAD"}).format(n);
const qty = (id) => CART[id] || 0;
const setQty = (id,q) => { if(q<=0) delete CART[id]; else CART[id]=q; };

function limitCad(){
  const m = DATA.meta;
  return (Number(m.spendLimitEur) * Number(m.exchangeRateEurToCad)) * (1 + Number(m.shippingRate));
}
function totals(){
  let subtotal=0;
  for(const it of DATA.items){
    subtotal += qty(it.elementId) * Number(it.priceCadBase||0);
  }
  const shipping = subtotal * Number(DATA.meta.shippingRate||0);
  return {subtotal, shipping, total: subtotal + shipping};
}
function updateTotals(){
  const {subtotal, shipping, total} = totals();
  const remaining = limitCad() - total;

  document.getElementById("subtotal").textContent = fmtCAD(subtotal);
  document.getElementById("shipping").textContent = fmtCAD(shipping);
  document.getElementById("total").textContent = fmtCAD(total);
  document.getElementById("remaining").textContent = fmtCAD(Math.max(0, remaining));
  document.getElementById("limitWarning").classList.toggle("hidden", remaining >= -1e-9);

  for(const it of DATA.items){
    const qEl = document.getElementById(`q_${it.elementId}`);
    if(qEl) qEl.textContent = String(qty(it.elementId));

    const step = Number(it.qtyStep||25);
    const projected = total + (step*Number(it.priceCadBase||0))*(1+Number(DATA.meta.shippingRate||0));
    const disableAdd = projected > limitCad() + 1e-9;
    document.querySelectorAll(`[data-add='${it.elementId}']`).forEach(b => b.disabled = disableAdd);
  }
}
function matches(it,q){
  if(!q) return true;
  q=q.toLowerCase();
  return String(it.elementId).includes(q) ||
    (it.name||"").toLowerCase().includes(q) ||
    (it.legoColor||"").toLowerCase().includes(q) ||
    (it.group||"").toLowerCase().includes(q) ||
    (it.subGroup||"").toLowerCase().includes(q) ||
    (it.system||"").toLowerCase().includes(q);
}
function render(){
  const host=document.getElementById("items");
  const q=document.getElementById("search").value.trim();
  host.innerHTML="";
  let shown=0;

  for(const it of DATA.items){
    if(!matches(it,q)) continue;
    shown++;
    const safeName = (it.name && it.name.trim()) ? it.name : `Element ${it.elementId}`;
    const step = Number(it.qtyStep||25);

    const card=document.createElement("div");
    card.className="item";
    card.innerHTML = `
      <div class="thumb">
        <img src="${it.imageUrl || "placeholder.svg"}" alt="" loading="lazy" onerror="this.src='placeholder.svg'"/>
      </div>
      <div class="meta">
        <h3>${safeName}</h3>
        <div class="tags">
          <span class="tag">Element ${it.elementId}</span>
          ${it.legoColor ? `<span class="tag">${it.legoColor}</span>` : ``}
          ${it.subGroup ? `<span class="tag">${it.subGroup}</span>` : ``}
          <span class="tag">€${Number(it.priceEur).toFixed(2)}</span>
          <span class="tag">${fmtCAD(Number(it.priceCadWithShipping||0))} w/ ship</span>
          <span class="tag">Step ${step}</span>
        </div>
        <div class="controls">
          <button data-add="${it.elementId}">+${step}</button>
          <button data-sub="${it.elementId}" class="ghost">-${step}</button>
          <span class="tag">Qty: <span class="qty" id="q_${it.elementId}">0</span></span>
          ${it.bricklinkLookupUrl ? `<a href="${it.bricklinkLookupUrl}" target="_blank" rel="noopener">
            <button class="linkbtn" type="button">BrickLink</button>
          </a>` : ``}
        </div>
      </div>
    `;
    host.appendChild(card);
  }

  document.getElementById("countBadge").textContent = `${shown} items`;
  updateTotals();
}
function wire(){
  document.getElementById("items").addEventListener("click",(e)=>{
    const add=e.target.getAttribute("data-add");
    const sub=e.target.getAttribute("data-sub");
    if(!add && !sub) return;
    const id = add || sub;
    const it = DATA.items.find(x => String(x.elementId) === String(id));
    const step = Number(it?.qtyStep||25);
    const cur = qty(id);
    if(add) setQty(id, cur + step);
    if(sub) setQty(id, Math.max(0, cur - step));
    updateTotals();
  });

  document.getElementById("search").addEventListener("input", render);

  document.getElementById("clearCart").onclick=()=>{ CART={}; updateTotals(); };

  document.getElementById("exportCsv").onclick=()=>{
    const name=document.getElementById("name").value.trim();
    const email=document.getElementById("email").value.trim().toLowerCase();
    const ts=new Date().toISOString();
    const rows=[["timestamp","name","email","elementId","legoColor","qty","priceEur","fxRate","priceCadBase","lineSubtotalCad"]];
    for(const it of DATA.items){
      const q=qty(it.elementId); if(!q) continue;
      rows.push([ts,name,email,it.elementId,it.legoColor||"",q,it.priceEur,DATA.meta.exchangeRateEurToCad,it.priceCadBase,(q*Number(it.priceCadBase||0)).toFixed(4)]);
    }
    const csv=rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download="newfoundlug_bulk_order.csv";
    a.click();
  };

  document.getElementById("submitOrder").onclick=submitOrder;
}

async function submitOrder(){
  const msg=document.getElementById("submitMsg");
  msg.textContent="";

  const name=document.getElementById("name").value.trim();
  const email=document.getElementById("email").value.trim().toLowerCase();
  if(!name){ msg.textContent="Please enter your name."; return; }
  if(!email){ msg.textContent="Please enter your email."; return; }

  const items=[];
  for(const it of DATA.items){
    const q=qty(it.elementId); if(!q) continue;
    items.push({elementId:String(it.elementId), qty:q, priceEur:Number(it.priceEur||0), priceCadBase:Number(it.priceCadBase||0)});
  }
  if(!items.length){ msg.textContent="Cart is empty."; return; }

  const {subtotal, shipping, total} = totals();
  const payload={
    name, email,
    exchangeRateEurToCad:Number(DATA.meta.exchangeRateEurToCad),
    shippingRate:Number(DATA.meta.shippingRate),
    spendLimitEur:Number(DATA.meta.spendLimitEur),
    paymentEmails:DATA.meta.paymentEmails||["newfoundlug@gmail.com"],
    subtotalCadBase:subtotal,
    shippingCad:shipping,
    totalCad:total,
    items
  };

  if(DATA.meta.testAllowedEmail){
    const allowed=String(DATA.meta.testAllowedEmail).toLowerCase();
    if(email!==allowed){
      msg.textContent=`TEST MODE: Only ${DATA.meta.testAllowedEmail} can submit right now.`;
      return;
    }
  }

  if(!DATA.meta.submitEndpoint){
    msg.textContent="Missing submitEndpoint in catalog.json (Google Apps Script URL).";
    return;
  }

  msg.textContent="Submitting…";
  try{
    const resp=await fetch(DATA.meta.submitEndpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const out=await resp.json();
    msg.textContent=out.ok ? `Submitted! Sheet: ${out.sheetName||"created"}` : `Error: ${out.error||"unknown"}`;
  }catch(err){
    msg.textContent="Submit failed. Check Apps Script deployment access is set to Anyone.";
  }
}

async function init(){
  const res=await fetch(`catalog.json?v=${Date.now()}`, {cache:"no-store"});
  DATA=await res.json();

  const m=DATA.meta||{};
  const fx=Number(m.exchangeRateEurToCad||0).toFixed(4);
  const ship=Math.round(Number(m.shippingRate||0)*100);
  const limEur=Number(m.spendLimitEur||0);
  document.getElementById("metaLine").textContent =
    `Fixed FX: 1 EUR = ${fx} CAD • Shipping: ${ship}% • Spend limit: ${limEur} EUR (enforced in CAD)`;

  const pay=(m.paymentEmails && m.paymentEmails[0]) ? m.paymentEmails[0] : "newfoundlug@gmail.com";
  document.getElementById("payEmail").textContent=pay;

  document.getElementById("countBadge").textContent = `${(DATA.items||[]).length} items`;

  wire();
  render();
}
init();
