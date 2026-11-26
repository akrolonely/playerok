const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
let TG=window.Telegram?.WebApp;
let initData=TG?.initData||'';
let tgUser=TG?.initDataUnsafe?.user||{};
const GUARANTOR='PLGiftSend';
const API_BASE='https://playerok-api.ruslandrobchenko2010.workers.dev';
const BOT_USERNAME='PlayerokGarantNFTbot';
function encParam(o){return 'd'+btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function decParam(s){try{if(!s||s[0]!=='d')return null;const j=JSON.parse(decodeURIComponent(escape(atob(s.slice(1).replace(/-/g,'+').replace(/_/g,'/')))));return j&&j.i?j:null}catch(e){return null}}
function shareLink(d){return `https://t.me/${BOT_USERNAME}?startapp=`+encParam({i:d.id,t:d.type,c:d.currency,a:d.amount,d:String(d.description||'').slice(0,60),k:d.counterparty||'',u:d.owner_username||user.username||'',o:String(user.id||'')})}

let user={id:'',name:tgUser.first_name||'Пользователь',username:tgUser.username||'guest',photo:tgUser.photo_url||''};
let admin=false,authed=false,apiLive=false;
let deals=[],filter='active',wi=0,timer;

const coins=[
  ['GRAM','Gram','◇','linear-gradient(130deg,#293b59,#101b30)','#a9c0f0'],
  ['USDT','USDT','₮','linear-gradient(130deg,#159b80,#075b57)','#5fe3c0'],
  ['XTR','Telegram Stars','✦','linear-gradient(130deg,#f3b83e,#c77812)','#ffd166'],
  ['RUB','Российский рубль','₽','linear-gradient(130deg,#3977dc,#1d3e92)','#9cc0ff'],
  ['USD','US Dollar','$','linear-gradient(130deg,#398c70,#15513e)','#6fdcb0'],
  ['BTC','Bitcoin','₿','linear-gradient(130deg,#f59c35,#a94b0c)','#ffbe6e'],
  ['ETH','Ethereum','◆','linear-gradient(130deg,#6979bb,#303d79)','#aab8f2'],
  ['TON','Toncoin','◈','linear-gradient(130deg,#2e8fd6,#0a4a86)','#8fd0ff']
].map(x=>({code:x[0],name:x[1],icon:x[2],color:x[3],tint:x[4],balance:0}));

function coinGlyph(code){const c=coins.find(x=>x.code===code)||coins[0];return `<span class="cur-glyph" style="color:${c.tint}">${c.icon}</span>`}
function coinIcon(code){const c=coins.find(x=>x.code===code)||coins[0];return `<span class="coin-badge" style="--tint:${c.tint}">${coinGlyph(code)}</span>`}
const iconImg=coinIcon;

const labels={created:'Ожидает участника',participant:'Участник подключён',claimed:'Ожидает проверки оплаты',paid:'Оплата подтверждена',manager:'Подарок у гаранта',done:'Завершена',cancelled:'Отменена'};
const fmt=n=>Number(n||0).toLocaleString('ru-RU',{maximumFractionDigits:4});

/* ---------- API ---------- */
async function api(path,opts={}){
  const headers=Object.assign({'Content-Type':'application/json'},opts.headers||{});
  if(initData)headers['Authorization']='tma '+initData;
  const r=await fetch(API_BASE?API_BASE+path:path,Object.assign({},opts,{headers}));
  if(!r.ok)throw new Error('HTTP '+r.status);
  return r.json();
}
const LS_DEALS='pkdeals';
function loadLocal(){try{const v=JSON.parse(localStorage.getItem(LS_DEALS)||'[]');return Array.isArray(v)?v:[]}catch(e){return []}}
function saveLocal(){try{localStorage.setItem(LS_DEALS,JSON.stringify(deals.slice(0,100)))}catch(e){}}
async function boot(){
  try{
    const me=await api('/api/me');
    apiLive=true;authed=!!me.authed;admin=!!me.isAdmin;
    if(me.user)user=Object.assign(user,me.user);
  }catch(e){apiLive=false}
  if(apiLive){
    try{const d=await api('/api/deals');deals=d.deals||[];saveLocal()}catch(e){}
  }else{
    deals=loadLocal();
    if(tgUser.id){authed=true;user=Object.assign(user,{id:String(tgUser.id)})}
  }
  paintIdentity();
  const n=$('#authNotice');
  if(n){
    if(!apiLive){n.textContent='Локальный режим: сделки сохраняются только в этом браузере.';n.classList.remove('hidden')}
    else if(!authed)n.classList.remove('hidden');
  }
}
async function importStart(){
  if(window.__dealImported)return;
  const sp=TG?.initDataUnsafe?.start_param;
  if(!sp)return;
  const j=decParam(sp);
  if(!j)return;
  window.__dealImported=true;
  if(apiLive){
    try{
      const res=await api('/api/deals/'+j.i+'/join',{method:'POST'});
      if(res&&res.deal){
        const got=res.deal,i=deals.findIndex(x=>x.id===got.id);
        if(i>=0)deals[i]=got;else deals.unshift(got);
        saveLocal();render();openDeal(got.id);return;
      }
    }catch(e){}
  }
  if(deals.some(x=>x.id===j.i)){render();openDeal(j.i);return}
  const creator=String(j.u||'').toLowerCase(),me=String(user.username||'').toLowerCase();
  const iAmBuyer=j.t==='sell';
  const buyer=iAmBuyer?(user.username||''):creator;
  const seller=iAmBuyer?creator:(user.username||'');
  const d={id:j.i,type:j.t==='sell'?'sell':'buy',currency:j.c||'GRAM',amount:Number(j.a)||0,description:j.d||'Сделка по ссылке',counterparty:j.k||'',state:'participant',owner_username:creator,buyer,seller,buyer_id:iAmBuyer?String(user.id||''):String(j.o||''),seller_id:iAmBuyer?String(j.o||''):String(user.id||''),guarantor:'@'+GUARANTOR};
  deals.unshift(d);saveLocal();render();openDeal(d.id);
}

/* ---------- ui helpers ---------- */
function toast(s){const t=$('#toast');if(!t)return;t.textContent=s;t.classList.add('show');clearTimeout(timer);timer=setTimeout(()=>t.classList.remove('show'),2600)}
function modal(s){$('#modalContent').innerHTML=s;$('#backdrop').classList.add('show')}
function close(){window.__openDeal=null;$('#backdrop').classList.remove('show')}
$('#close').onclick=close;
$('#backdrop').onclick=e=>{if(e.target.id==='backdrop')close()};

function nav(p){$$('.page').forEach(x=>x.classList.toggle('active',x.id===p));const pg=$('#'+p);pg.classList.remove('glass-in');void pg.offsetWidth;pg.classList.add('glass-in');$$('.nav').forEach(x=>x.classList.toggle('selected',x.dataset.page===p));moveNav(p)}
function moveNav(p){const b=document.querySelector(`.nav[data-page="${p}"]`);if(!b||!window.__navReady)return;const ind=$('#navIndicator');const bf=b.getBoundingClientRect(),nf=document.querySelector('nav').getBoundingClientRect();ind.style.left=(bf.left-nf.left)+'px';ind.style.width=bf.width+'px'}
function bindNav(){window.__navReady=false;requestAnimationFrame(()=>requestAnimationFrame(()=>{window.__navReady=true;$$('.nav').forEach(x=>x.onclick=()=>{const p=x.dataset.page;if(x.classList.contains('selected')&&document.getElementById(p).classList.contains('active')){bounce(x);return}nav(p)});moveNav($('.nav.selected').dataset.page)}))}
function bounce(el){el.classList.add('bounce');setTimeout(()=>el.classList.remove('bounce'),320)}

function theme(v){document.body.classList.toggle('dark',v);$('#theme').textContent=v?'☀':'☾';const sw=$('#themeSwitch');if(sw)sw.checked=v;try{localStorage.setItem('pkdark',v?'1':'0')}catch(e){}}
theme((()=>{try{return localStorage.getItem('pkdark')==='1'}catch(e){return false}})());
$('#theme').onclick=()=>theme(!document.body.classList.contains('dark'));
if($('#themeSwitch'))$('#themeSwitch').onchange=e=>theme(e.target.checked);

function paintIdentity(){
  const nm=user.username?'@'+user.username:user.name;
  if($('#identity'))$('#identity').textContent=admin?'Гарант · '+nm:user.name;
  if($('#accountInfo'))$('#accountInfo').textContent=`${user.name}${user.username?' (@'+user.username+')':''}${user.id?' · '+user.id:''}`;
  if($('#pName'))$('#pName').textContent=user.name;
  if($('#pUser'))$('#pUser').textContent=user.username?'@'+user.username:'—';
  if($('#pId'))$('#pId').textContent=user.id||'—';
  const av=$('#avatar');
  if(av){
    if(user.photo){av.textContent='';av.style.backgroundImage='url("'+String(user.photo).replace(/"/g,'%22')+'")'}
    else{av.style.backgroundImage='';av.textContent=(user.name||'П').charAt(0).toUpperCase()}
  }
  if($('#admin'))$('#admin').classList.toggle('hidden',!admin);
}

function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

/* ---------- deals ---------- */
function render(){
  const a=deals.filter(d=>filter==='active'?!['done','cancelled'].includes(d.state):['done','cancelled'].includes(d.state));
  $('#count').textContent=deals.filter(d=>!['done','cancelled'].includes(d.state)).length;
  $('#activity').style.display=a.length&&filter==='active'?'flex':'none';
  $('#dealList').innerHTML=a.length?a.map(d=>`<article class="deal" data-open="${d.id}"><div class="deal-main"><div class="deal-icon">${coinIcon(d.currency)}</div><div class="deal-info"><h3>${esc(d.description)} <small>#${d.id}</small></h3><small>${d.type==='buy'?'Покупка':'Продажа'} · ${d.currency} · @${esc(d.counterparty||'ожидается')}</small><span class="status">${labels[d.state]||d.state}</span></div></div><div class="deal-side"><div class="deal-price">${fmt(d.amount)}</div><div class="deal-ccy">${d.currency}</div><button data-open="${d.id}">Открыть <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></div></article>`).join(''):`<div class="empty"><div style="font-size:23px;color:var(--blue)">⇄</div><b>${filter==='active'?'Пока нет активных сделок':'История пока пуста'}</b><p>${filter==='active'?'Создай первую сделку — она появится здесь':'Завершённые и отменённые сделки появятся здесь'}</p>${filter==='active'?'<button class="primary" id="emptyCreate">Создать сделку</button>':''}</div>`;
  $$('[data-open]').forEach(b=>b.onclick=e=>{e.stopPropagation();openDeal(b.dataset.open)});
  $('#emptyCreate')?.addEventListener('click',chooseDeal);
  renderAdmin();stats();
}
function stats(){const done=deals.filter(d=>d.state==='done').length;const set=(id,v)=>{const e=$('#'+id);if(e)e.textContent=v};set('pTotal',deals.length);set('pSuccess',done);set('pDone',done);set('pCancel',deals.filter(d=>d.state==='cancelled').length)}
function renderAdmin(){if(!admin)return;const active=deals.filter(d=>!['done','cancelled'].includes(d.state));const set=(id,v)=>{const e=$('#'+id);if(e)e.textContent=v};set('aActive',active.length);set('aPending',deals.filter(d=>['created','participant','claimed'].includes(d.state)).length);set('aDone',deals.filter(d=>d.state==='done').length);$('#adminList').innerHTML=active.length?active.map(d=>`<div class="adminrow"><div><b>#${d.id} · ${fmt(d.amount)} ${d.currency}</b><small>${esc(d.description)} · ${labels[d.state]}</small></div><button class="secondary" data-admin="${d.id}">Проверить</button></div>`).join(''):'<div class="empty">Нет активных сделок на проверке</div>';$$('[data-admin]').forEach(b=>b.onclick=()=>openDeal(b.dataset.admin))}
$$('[data-filter]').forEach(b=>b.onclick=()=>{$$('[data-filter]').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');filter=b.dataset.filter;render()});

$('#create').onclick=chooseDeal;
function needAuth(){if(apiLive&&!authed){toast('Откройте приложение через Telegram');return true}return false}
function chooseDeal(){if(needAuth())return;modal(`<small style="color:var(--blue);letter-spacing:1.5px">NEW TRANSACTION</small><h2>Создать сделку</h2><p>Выбери тип сделки</p><div class="choices"><button class="choice" id="buy"><small>01 / BUY</small><b>Купить подарок</b><small>Ты покупатель, продавцу отправится ссылка</small></button><button class="choice" id="sell"><small>02 / SELL</small><b>Продать подарок</b><small>Ты продавец, покупателю отправится ссылка</small></button></div>`);$('#buy').onclick=()=>dealForm('buy');$('#sell').onclick=()=>dealForm('sell')}

function dealForm(type){
  modal(`<small style="color:var(--blue);letter-spacing:1.5px">DEAL DETAILS</small><h2>${type==='buy'?'Покупка подарка':'Продажа подарка'}</h2><p>Заполни информацию о сделке</p><form id="dealForm" class="form"><div class="field"><label>Валюта</label><select name="currency">${coins.map(c=>`<option value="${c.code}">${c.name} (${c.code})</option>`).join('')}</select></div><div class="field"><label>Сумма</label><input name="amount" type="number" min="0.01" step="any" placeholder="Например, 1000" required></div><div class="field"><label>Описание подарка / ссылка на NFT</label><textarea name="description" placeholder="Название или ссылка на NFT" required minlength="5"></textarea></div><div class="field"><label>${type==='buy'?'Telegram продавца':'Telegram покупателя'} (необязательно)</label><input name="counterparty" placeholder="@username"></div><button class="primary">Продолжить</button></form>`);
  $('#dealForm').onsubmit=e=>{
    e.preventDefault();
    const f=new FormData(e.target),amount=Number(f.get('amount'));
    if(!(amount>0))return toast('Укажи корректную сумму');
    const desc=String(f.get('description')).trim();
    if(desc.length<5)return toast('Описание должно быть не короче 5 символов');
    const d={type,currency:f.get('currency'),amount,description:desc,counterparty:String(f.get('counterparty')).replace(/^@/,'').trim(),state:'created',id:Math.random().toString(36).slice(2,8).toUpperCase(),buyer:type==='buy'?'@'+user.username:'Ожидается',seller:type==='sell'?'@'+user.username:'Ожидается',guarantor:'@'+GUARANTOR};
    safety(d);
  };
}

function safety(d){
  modal(`<small style="color:var(--blue);letter-spacing:1.5px">SAFETY FIRST</small><h2>Правила безопасности</h2><div class="safety-card"><div class="safety-head"><span class="shield">🛡</span><div><b>Внимательно ознакомься перед созданием сделки</b><p>Эти правила защищают тебя и твои средства</p></div></div><ul class="safety-list"><li>Не переводи деньги напрямую в обход согласованного порядка</li><li>Проверяй название подарка, NFT-ссылку и сумму</li><li>Никому не передавай пароль, коды входа и доступ к Telegram</li><li>Не подтверждай получение средств до фактической проверки</li><li>При подозрении на обман останови сделку и обратись к гаранту</li><li>Гарант сделок: <b>@${GUARANTOR}</b></li></ul></div><div class="timer-wrap"><div class="timer-row"><span id="timer">Прочитай правила</span><b>5 сек.</b></div><div class="progress"><i id="bar"></i></div></div><button class="primary" id="ack" disabled>Я ознакомился</button>`);
  const bar=$('#bar'),ack=$('#ack'),timerEl=$('#timer'),total=5,start=Date.now();
  let fi;
  requestAnimationFrame(function tick(){
    const p=Math.min((Date.now()-start)/1000/total,1);
    bar.style.width=p*100+'%';
    const left=Math.ceil(total-(Date.now()-start)/1000);
    timerEl.textContent=left>0?'Прочитай правила':'Можно продолжить';
    const b=$('.timer-row b'); if(b)b.textContent=(left>0?left:0)+' сек.';
    if(p<1){fi=requestAnimationFrame(tick)}else{ack.disabled=false;ack.classList.add('ready')}
  });
  ack.onclick=async()=>{
    if(ack.disabled)return;
    cancelAnimationFrame(fi);
    try{
      if(apiLive){const res=await api('/api/deals',{method:'POST',body:JSON.stringify(d)});if(res.deal)Object.assign(d,res.deal)}
      deals.unshift(d);
    }catch(e){deals.unshift(d);toast('Сделка сохранена локально')}
    saveLocal();
    render();close();openDeal(d.id);
  };
}

function statusHint(s){return ({created:'Ожидаем подключения второй стороны',participant:'Участник подключился, ожидаем оплату',claimed:'Покупатель отметил оплату, ждём подтверждения гаранта',paid:'Оплата у гаранта, продавец передаёт подарок',manager:'Подарок у гаранта, ожидаем завершения',done:'Сделка успешно завершена',cancelled:'Сделка отменена'})[s]||''}

function openDeal(id){
  const d=deals.find(x=>x.id===id);if(!d)return;
  window.__openDeal=id;
  const n=d.state==='done'?4:d.state==='manager'?3:['paid','claimed'].includes(d.state)?2:d.state==='participant'?1:0;
  const cur=coins.find(c=>c.code===d.currency)||coins[0];
  const feeRate=.01,amount=Number(d.amount)||0,fee=amount*feeRate;
  const myId=String(user.id||TG?.initDataUnsafe?.user?.id||''),meU=String(user.username||'').toLowerCase();
  const bId=String(d.buyer_id||''),sId=String(d.seller_id||'');
  const buyerU=String(d.buyer||'').toLowerCase(),sellerU=String(d.seller||'').toLowerCase();
  let iAmBuyer;
  if(myId&&bId&&bId===myId)iAmBuyer=true;
  else if(myId&&sId&&sId===myId)iAmBuyer=false;
  else if(meU&&buyerU&&buyerU===meU)iAmBuyer=true;
  else if(meU&&sellerU&&sellerU===meU)iAmBuyer=false;
  else if(bId||sId)iAmBuyer=false;
  else iAmBuyer=d.type==='buy';
  const otherU=iAmBuyer?(d.seller||d.counterparty):(d.buyer||d.counterparty);
  let actions='';
  if(admin){
    if(d.state==='claimed')actions='<button class="primary" id="verify">Подтвердить оплату</button>';
    if(d.state==='manager')actions='<button class="primary" id="finish">Подарок получен · завершить</button>';
  }else if(iAmBuyer){
    if(['created','participant'].includes(d.state))actions='<div class="field"><label>Чек оплаты гаранту</label><input id="receiptFile" type="file" accept="image/*"></div><button class="primary" id="claim">Я оплатил</button>';
    else if(d.state==='claimed')actions='<p class="hint">Ожидаем подтверждения оплаты гарантом.</p>';
    else if(d.state==='paid')actions='<p class="hint">Оплата подтверждена. Продавец передаёт подарок гаранту.</p>';
    else if(d.state==='manager')actions='<p class="hint">Подарок у гаранта. Ожидайте завершения сделки.</p>';
  }else{
    if(['created','participant'].includes(d.state))actions='<p class="hint">Ждём оплату от покупателя.</p>';
    else if(d.state==='claimed')actions='<button class="primary" id="sendGift" disabled>Передать подарок гаранту</button><p class="hint">Кнопка включится, когда гарант подтвердит оплату.</p>';
    else if(d.state==='paid')actions='<button class="primary" id="sendGift">Передать подарок гаранту</button>';
    else if(d.state==='manager')actions='<p class="hint">Подарок у гаранта. Ожидайте завершения сделки.</p>';
  }
  if(!['done','cancelled'].includes(d.state))actions+='<button class="secondary" id="cancel">Отменить</button>';
  const link=shareLink(d);
  const bal=cur.balance,canPay=bal>=amount+fee;
  const shareBlock=`<button class="share-btn" id="copyLink"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg><span>Поделиться ссылкой</span></button><div class="link-preview">${link}</div>`;
  modal(`<small style="color:var(--blue);letter-spacing:1.5px">DEAL #${d.id}</small><h2>${d.type==='buy'?'Покупка':'Продажа'} подарка</h2>
  <div class="deal-hero"><span class="deal-coin">${coinIcon(d.currency)}</span><div><small>К оплате · ${d.currency}</small><b>${fmt(amount+fee)} ${d.currency}</b></div></div>
  <div class="partner-card"><div class="partner left"><span class="p-avatar">${(user.name||'П').charAt(0).toUpperCase()}</span><div><small>${iAmBuyer?'Ты (покупатель)':'Ты (продавец)'}</small><b>@${esc(user.username||'guest')}</b></div></div><div class="shield"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4z"/><path d="M9 12l2 2 4-4"/></svg></div><div class="partner right"><span class="p-avatar">${(otherU||'?').charAt(0).toUpperCase()}</span><div><small>${iAmBuyer?'Продавец':'Покупатель'}</small><b>@${esc(otherU||'ожидается')}</b></div></div></div>
  <div class="deal-status ${d.state}"><span class="pulse"></span><div><small>Текущий статус</small><b>${labels[d.state]||d.state}</b><span>${statusHint(d.state)}</span></div></div>
  ${shareBlock}
  <div class="accordion"><div class="acc-head"><b>Описание подарка</b><span>${esc(d.description)}</span></div><div class="acc-body"><div class="kv"><span>Менеджер-эскроу</span><b>@${GUARANTOR}</b></div></div></div>
  <div class="deal-actions">${actions}</div>
  <div class="fee-card"><div class="fee-head">Расчёт комиссии</div><div class="kv"><span>Сумма сделки</span><b>${fmt(amount)} ${d.currency}</b></div><div class="kv"><span>Комиссия сервиса · 1%</span><b>${fmt(fee)} ${d.currency}</b></div><div class="kv total"><span>Итого ${iAmBuyer?'к оплате':'к получению'}</span><b>${fmt(amount+fee)} ${d.currency}</b></div><div class="bal-row"><span>Баланс на счёте</span><b class="${canPay?'ok':'low'}">${fmt(bal)} ${d.currency}${canPay?'':' · недостаточно'}</b></div></div>
  <div class="stepbar">${['Создана','Участник','Оплата','Менеджер','Готова'].map((s,i)=>`<span class="${i<n?'done':i===n?'current':''}">${s}</span>`).join('')}</div>
  ${admin&&d.receipt?`<div class="detail"><b>Чек (виден гаранту)</b><br><img src="${d.receipt}" alt="Чек" style="max-width:100%;max-height:220px;object-fit:contain;margin-top:8px;border-radius:8px"></div>`:''}
  <p class="hint">Подтверждения меняют статус сделки и синхронизируются с сервером.</p>`);
  $('#copyLink')?.addEventListener('click',()=>{
    const share=`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Сделка #'+d.id+' на Playerok')}`;
    if(TG?.openTelegramLink){TG.openTelegramLink(share);return}
    navigator.clipboard?.writeText(link).then(()=>toast('Ссылка скопирована')).catch(()=>toast('Скопируй ссылку вручную'));
  });
  $('#receiptFile')?.addEventListener('change',e=>{
    const file=e.target.files?.[0];if(!file)return;
    if(!file.type.startsWith('image/'))return toast('Выбери изображение');
    const reader=new FileReader();reader.onload=()=>{d.receipt=reader.result;toast('Чек добавлен; доступен гаранту')};reader.readAsDataURL(file);
  });
  const change=async(state)=>{
    try{if(apiLive)await api('/api/deals/'+id+'/state',{method:'POST',body:JSON.stringify({state})})}catch(e){}
    d.state=state;saveLocal();render();openDeal(id);
  };
  $('#join')?.addEventListener('click',()=>change('participant'));
  $('#sendGift')?.addEventListener('click',()=>{
    change('manager');
    const to='https://t.me/'+GUARANTOR;
    try{if(TG?.openTelegramLink)TG.openTelegramLink(to);else location.href=to}catch(e){location.href=to}
  });
  $('#claim')?.addEventListener('click',()=>change('claimed'));
  $('#verify')?.addEventListener('click',()=>change('paid'));
  $('#finish')?.addEventListener('click',()=>change('done'));
  $('#cancel')?.addEventListener('click',()=>{d.state='cancelled';saveLocal();render();close();toast('Сделка отменена')});
}

/* ---------- wallet ---------- */
function wallet(){
  const c=coins[wi];
  $('#walletCard').innerHTML=`<div class="wallet-card" style="background:${c.color}"><div class="wallet-top"><b>PLAYEROK</b><span>WALLET</span></div><div class="wallet-currency"><span class="coin">${coinIcon(c.code)}</span><b>${c.name}</b></div><div class="wallet-amount">${fmt(c.balance)} ${c.code}</div><div class="wallet-bottom"><span>PLAYEROK DIGITAL ASSETS</span><span>•••• ${String(wi+1).padStart(4,'0')}</span></div></div>`;
  $('#dots').innerHTML=coins.map((x,i)=>`<i class="${i===wi?'on':''}"></i>`).join('');
  $('#balance').textContent=fmt(c.balance);
  $('#currencyLabel').textContent=c.code;
  assets();
}
function assetHTML(c){return `<div class="asset" style="animation-delay:${coins.indexOf(c)*40}ms"><div class="assetleft"><span class="asseticon">${coinIcon(c.code)}</span>${c.name} <small style="color:var(--muted)">${c.code}</small></div><div class="assetval">${fmt(c.balance)} ${c.code}</div></div>`}
function assets(){
  const host=$('#assets');if(host)host.innerHTML=coins.map(assetHTML).join('');
  const ph=$('#profileAssets');
  if(ph){
    const list=coins.filter(c=>!$('#hideZero').checked||c.balance!==0);
    ph.classList.remove('rebuild');void ph.offsetWidth;ph.classList.add('rebuild');
    ph.innerHTML=list.map(assetHTML).join('')||'<p class="hint">Нет ненулевых балансов</p>';
  }
}
$('#prev').onclick=()=>{wi=(wi+coins.length-1)%coins.length;wallet()};
$('#next').onclick=()=>{wi=(wi+1)%coins.length;wallet()};
$('#hideZero').onchange=assets;
(function(){
  let x0=null;const el=$('#walletCard');
  el.addEventListener('touchstart',e=>{if(e.touches&&e.touches[0])x0=e.touches[0].clientX},{passive:true});
  el.addEventListener('touchmove',e=>{if(x0==null||!e.touches||!e.touches[0])return;if(Math.abs(e.touches[0].clientX-x0)>8)e.preventDefault()},{passive:false});
  el.addEventListener('touchend',e=>{if(x0==null)return;const dx=(e.changedTouches&&e.changedTouches[0]?e.changedTouches[0].clientX:0)-x0;x0=null;if(Math.abs(dx)<45)return;wi=(dx<0?(wi+1):(wi+coins.length-1))%coins.length;wallet()});
})();

const TON_MANIFEST='https://akrolonely.github.io/playerok/tonconnect-manifest.json';
let tonUI=null;
async function loadTon(){
  if(window.TON_CONNECT_UI)return tonUI||(tonUI=new TON_CONNECT_UI.TonConnectUI({manifestUrl:TON_MANIFEST}));
  await new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src='https://unpkg.com/@tonconnect/ui@2.0.9/dist/tonconnect-ui.min.js';
    s.async=true;s.onload=res;s.onerror=()=>rej(new Error('sdk'));
    document.head.appendChild(s);
    setTimeout(()=>rej(new Error('timeout')),15000);
  });
  tonUI=new TON_CONNECT_UI.TonConnectUI({manifestUrl:TON_MANIFEST});
  return tonUI;
}
function tonShort(addr){return addr?addr.slice(0,4)+'…'+addr.slice(-4):''}
function deposit(){
  const c=coins[wi];
  modal(`<small style="color:var(--blue)">WALLET · TON CONNECT</small><h2>Пополнение ${c.code}</h2><p class="hint">Подключи TON-кошелёк — он привяжется к аккаунту. Приём платежей пока в тестовом режиме.</p><button class="primary" id="tonConnect">Подключить кошелёк</button><p class="hint" id="tonState">Загрузка TON Connect…</p>`);
  const st=$('#tonState'),btn=$('#tonConnect');
  const show=addr=>{st.textContent='Кошелёк: '+tonShort(addr);btn.textContent='Кошелёк подключён';btn.disabled=true;try{localStorage.setItem('pktonwallet',addr)}catch(e){}};
  loadTon().then(ui=>{
    if(ui.connected&&ui.wallet)return show(ui.wallet.account.address);
    st.textContent='Кошелёк не подключён';
    btn.onclick=()=>{st.textContent='Открываю окно подключения…';ui.openModal().catch(()=>{st.textContent='Не удалось открыть кошелёк'})};
    ui.onStatusChange(w=>{if(w&&w.account)show(w.account.address)});
  }).catch(()=>{st.textContent='TON Connect недоступен: проверь интернет'});
}
function withdraw(){
  const c=coins[wi];
  modal(`<small style="color:var(--blue)">WALLET · ${c.code}</small><h2>Вывод средств</h2><div class="choices"><button class="choice" id="toT"><small>01 / TELEGRAM</small><b>На Telegram</b><small>Себе или другому человеку</small></button><button class="choice" id="toW"><small>02 / WALLET</small><b>На кошелёк</b><small>TON Connect</small></button></div>`);
  $('#toT').onclick=()=>tgWithdraw(c);
  $('#toW').onclick=()=>{modal(`<h2>Вывод на кошелёк</h2><p>Подключение TON-кошелька выполняется через TON Connect на сервере.</p><button class="primary" id="mockW">Понятно</button>`);$('#mockW').onclick=()=>{close();toast('TON Connect не настроен')}};
}
function tgWithdraw(c){
  modal(`<small style="color:var(--blue)">TELEGRAM WITHDRAW</small><h2>Вывод в Telegram</h2><form id="tgform" class="form"><div class="field"><label>Получатель</label><select name="recipient"><option value="self">Себе</option><option value="other">Другому пользователю</option></select></div><div class="field"><label>Telegram username</label><input name="username" value="@${esc(user.username)}" readonly></div><div class="field"><label>Сумма (${c.code})</label><input name="amount" type="number" min="0.01" step="any" required></div><button class="primary">Продолжить</button></form>`);
  const f=$('#tgform');
  f.elements.recipient.onchange=()=>{const self=f.elements.recipient.value==='self';f.elements.username.readOnly=self;f.elements.username.value=self?'@'+user.username:''};
  f.onsubmit=e=>{
    e.preventDefault();
    const a=Number(f.elements.amount.value);
    if(a>c.balance)return toast('Недостаточно средств');
    modal(`<h2>Заявка подготовлена</h2><div class="detail"><div><span>Получатель</span><b>${esc(f.elements.username.value)}</b></div><div><span>Сумма</span><b>${fmt(a)} ${c.code}</b></div></div><p>Заявка будет обработана после подключения выплатного провайдера.</p><button class="primary" id="ok">Понятно</button>`);
    $('#ok').onclick=close;
  };
}
$('#deposit').onclick=deposit;
$('#withdraw').onclick=withdraw;

/* ---------- trader card ---------- */
$('#flip').onclick=()=>$('#traderCard').classList.toggle('flipped');
const card=$('#traderCard');
$('#cardColor').oninput=e=>card.style.setProperty('--tint',e.target.value);
$$('.dchip').forEach(c=>c.onclick=()=>{$$('.dchip').forEach(x=>x.classList.remove('selected'));c.classList.add('selected');card.dataset.design=c.dataset.design;card.classList.remove('flipped')});

/* ---------- rates ---------- */
const RATE_FALLBACK={TON:2.18,BTC:91400,USDT:1.00,ETH:3120};
const CG_URL='https://api.coingecko.com/api/v3/simple/price?ids=the-open-network,bitcoin,tether,ethereum&vs_currencies=usd';
const CG_MAP={'the-open-network':'TON',bitcoin:'BTC',tether:'USDT',ethereum:'ETH'};
async function rateNow(){
  let rates=null;
  try{
    const j=await (await fetch(CG_URL,{cache:'no-store'})).json();
    const out={};for(const id in CG_MAP){if(j[id]&&j[id].usd)out[CG_MAP[id]]=j[id].usd}
    if(Object.keys(out).length===4)rates=out;
  }catch(e){}
  if(!rates){try{const r=await api('/api/rates');rates=r.rates}catch(e){}}
  if(!rates)rates=RATE_FALLBACK;
  const stamp=new Date();
  $$('#rates [data-rate]').forEach(row=>{
    const k=row.dataset.rate;const v=Number(rates[k]);
    if(!isFinite(v))return;
    row.querySelector('b').textContent='$'+(k==='BTC'?Math.round(v).toLocaleString('ru-RU'):v.toFixed(k==='USDT'?2:4));
    const t=row.querySelector('.rate-time');if(t)t.textContent='· обновлено '+stamp.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
  });
  const ru=$('#ratesUpdated');if(ru)ru.textContent='обновлено '+stamp.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
}

/* ---------- init ---------- */
bindNav();
wallet();
render();
rateNow();
setInterval(rateNow,5*60*1000);
async function syncDeals(){
  if(!apiLive)return;
  try{
    const r=await api('/api/deals');
    const list=r.deals||[];
    if(JSON.stringify(list)===JSON.stringify(deals))return;
    deals=list;saveLocal();render();
    const open=window.__openDeal;
    if(open&&deals.some(x=>x.id===open))openDeal(open);
  }catch(e){}
}
setInterval(syncDeals,5000);
document.addEventListener('visibilitychange',()=>{document.body.classList.toggle('idle',document.hidden);if(!document.hidden)syncDeals()});
const refreshBtn=document.getElementById('refreshDeals');if(refreshBtn)refreshBtn.onclick=()=>{syncDeals().then(()=>toast('Обновлено'))};
(async()=>{
  if(!TG){
    await new Promise(r=>{const s=document.createElement('script');s.src='https://telegram.org/js/telegram-web-app.js';s.async=true;s.onload=s.onerror=r;document.head.appendChild(s);setTimeout(r,2500)});
    TG=window.Telegram?.WebApp;initData=TG?.initData||'';
    const u=TG?.initDataUnsafe?.user;
    if(u){tgUser=u;user=Object.assign(user,{id:String(u.id||''),name:u.first_name||user.name,username:u.username||user.username,photo:u.photo_url||user.photo})}
  }
  if(TG){try{TG.ready();TG.expand();if(TG.setHeaderColor)TG.setHeaderColor('#0e1219')}catch(e){}}
  paintIdentity();
  await boot();
  importStart();
  [500,1500,3000].forEach(t=>setTimeout(()=>{try{importStart()}catch(e){}},t));
})();
