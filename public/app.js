(() => {
  'use strict';

  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const state = {
    me:null, csrf:null, data:null, admin:null, brandDetail:null,
    commercial:null, crmDetail:null, commercialUsers:null, staff:null, staffDetail:null, staffUsers:null,
    view:null, selectedSector:'Logística', adminTab:'summary', search:'', passwordChangeRequired:false,
    crmSearch:'', crmFilter:'all', crmReportFilter:'all', crmTab:'timeline',
    crmMonth:new Date().toISOString().slice(0,7)
  };

  const authScreen=$('#authScreen'), portal=$('#portal'), content=$('#content'), sideNav=$('#sideNav'), sidebar=$('#sidebar');
  const toastEl=$('#toast'), modalBackdrop=$('#modalBackdrop'), modal=$('#modal');

  function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function nl(v){return esc(v).replace(/\n/g,'<br>');}
  function initials(v){return String(v||'C25').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'C25';}
  function fmtDate(v){if(!v)return '—';const [y,m,d]=String(v).slice(0,10).split('-');if(!d)return esc(v);return `${d}/${m}/${y}`;}
  function fmtDateTime(v){if(!v)return '';try{return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(v));}catch{return v;}}
  function fmtMoney(cents){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(cents)||0)/100);}
  function moneyInput(cents){return (Number(cents||0)/100).toFixed(2);}
  function todayInput(){return new Date().toISOString().slice(0,10);}
  const MAX_CONTRACT_INSTALLMENTS=10;
  function paymentMethodOptions(selected='boleto'){
    return [['pix','PIX'],['boleto','Boleto bancário'],['payment_link','Link de pagamento']].map(([v,l])=>`<option value="${v}" ${selected===v?'selected':''}>${l}</option>`).join('');
  }
  function installmentCountOptions(selected=1){
    const n=Math.max(1,Math.min(MAX_CONTRACT_INSTALLMENTS,Number(selected)||1));
    return Array.from({length:MAX_CONTRACT_INSTALLMENTS},(_,i)=>i+1).map(i=>`<option value="${i}" ${i===n?'selected':''}>${i} ${i===1?'parcela':'parcelas'}</option>`).join('');
  }
  function installmentFieldsHtml(installments=[],selectedCount=1){
    const count=Math.max(1,Math.min(MAX_CONTRACT_INSTALLMENTS,Number(selectedCount)||1));
    return Array.from({length:MAX_CONTRACT_INSTALLMENTS},(_,i)=>{
      const p=installments[i]||{}; const n=i+1; const active=n<=count;
      return `<div class="field ${active?'':'hidden'}" data-installment-field="${n}"><label>${n}ª parcela · vencimento<input name="installment${n}_due" type="date" value="${esc(p.due_date||'')}" ${active?'required':'disabled'}></label></div><div class="field ${active?'':'hidden'}" data-installment-field="${n}"><label>${n}ª parcela · valor (R$)<input name="installment${n}_value" inputmode="decimal" value="${p.amount_cents?moneyInput(p.amount_cents):''}" ${active?'required':'disabled'}></label></div>`;
    }).join('');
  }
  function bindInstallmentCount(form){
    const select=$('[name="installment_count"]',form); if(!select)return;
    const apply=()=>{const count=Math.max(1,Math.min(MAX_CONTRACT_INSTALLMENTS,Number(select.value)||1));$$('[data-installment-field]',form).forEach(field=>{const active=Number(field.dataset.installmentField)<=count;field.classList.toggle('hidden',!active);$('input',field).disabled=!active;$('input',field).required=active;});};
    select.addEventListener('change',apply); apply();
  }
  function statusLabel(s){return ({pending:'Pendente',received:'Recebido',approved:'Aprovado',done:'Concluído',paid:'Pago',overdue:'Vencido',rejected:'Reprovado',draft:'Rascunho',signed:'Assinado',active:'Ativo',inactive:'Inativo',cancelled:'Cancelado',prospect:'Novo contato',contacted:'Contatado',negotiation:'Em negociação',client:'Cliente',paused:'Pausado'}[s]||s||'—');}
  function todayISO(){const d=new Date();const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`;}
  function status(s){return `<span class="status ${esc(s)}">${esc(statusLabel(s))}</span>`;}
  function toast(msg){toastEl.textContent=msg;toastEl.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>toastEl.classList.remove('show'),2800);}
  function showError(err){toast(err?.message||'Não foi possível concluir a ação.');}
  function percentDone(reqs){if(!reqs?.length)return 0;const done=reqs.filter(r=>['approved','done'].includes(r.status)).length;return Math.round(done*100/reqs.length);}
  function openFile(id){if(id)window.open(`/api/file/${encodeURIComponent(id)}`,'_blank','noopener');}
  function bindPasswordToggles(root=document){
    $$('[data-password-toggle]',root).forEach(btn=>{
      if(btn.dataset.bound==='1')return; btn.dataset.bound='1';
      btn.addEventListener('click',()=>{
        const input=document.getElementById(btn.dataset.passwordToggle); if(!input)return;
        const show=input.type==='password'; input.type=show?'text':'password';
        btn.textContent=show?'Ocultar':'Ver'; btn.setAttribute('aria-label',show?'Ocultar senha':'Mostrar senha');
      });
    });
  }

  async function api(url, opts={}){
    const o={...opts,headers:{...(opts.headers||{})}};
    if(o.body && typeof o.body!=='string'){o.headers['Content-Type']='application/json';o.body=JSON.stringify(o.body);}
    if(state.csrf && !['GET','HEAD'].includes((o.method||'GET').toUpperCase())) o.headers['X-CSRF-Token']=state.csrf;
    const r=await fetch(url,o);
    let data=null; try{data=await r.json();}catch{}
    if(!r.ok){const e=new Error(data?.error||`Erro ${r.status}`);e.status=r.status;throw e;}
    return data;
  }
  function fileData(file){
    return new Promise((resolve,reject)=>{
      if(!file)return resolve(null);
      if(file.size>12*1024*1024)return reject(new Error('O arquivo deve ter no máximo 12 MB.'));
      const fr=new FileReader();fr.onload=()=>resolve({name:file.name,data:fr.result});fr.onerror=()=>reject(new Error('Não foi possível ler o arquivo.'));fr.readAsDataURL(file);
    });
  }

  function showAuth(){authScreen.classList.remove('hidden');portal.classList.add('hidden');}
  function showPortal(){authScreen.classList.add('hidden');portal.classList.remove('hidden');}
  function setShell(){
    const role=state.me.role;
    const roleLabels={admin:'Master',commercial:'Comercial',finance:'Financeiro',marketing:'Marketing',brand:'Marca'};
    $('#roleChip').textContent=roleLabels[role]||'Portal';
    $('#avatarInitials').textContent=initials(state.me.name);
    if(role==='admin'){
      $('#sideBrand').textContent='GESTÃO CARANDAÍ 25';
      $('#sideMeta').textContent='ACESSO MASTER';
    }else if(role==='commercial'){
      $('#sideBrand').textContent='EQUIPE COMERCIAL';
      $('#sideMeta').textContent='CRM · MARCAS & CLIENTES';
    }else if(role==='finance'){
      $('#sideBrand').textContent='EQUIPE FINANCEIRO';
      $('#sideMeta').textContent='CONTRATOS · BOLETOS';
    }else if(role==='marketing'){
      $('#sideBrand').textContent='EQUIPE MARKETING';
      $('#sideMeta').textContent='COMUNICAÇÃO · MARCAS';
    }else{
      $('#sideBrand').textContent=state.me.brand?.name||'Minha marca';
      $('#sideMeta').textContent='Jockey Club · 05–08 NOV';
    }
    const nav=role==='admin' ? [
      ['admin-home','Visão geral','01'],['admin-brands','Marcas do evento','02'],['admin-pending','Pendências','03'],['commercial-home','CRM Comercial','04'],['admin-users','Usuários e acessos','05']
    ] : role==='commercial' ? [
      ['commercial-home','Início','01'],['commercial-clients','Marcas / Clientes','02'],['commercial-agenda','Agenda','03'],['commercial-reports','Relatórios','04']
    ] : role==='finance' || role==='marketing' ? [
      ['staff-home','Início','01'],['staff-brands','Marcas','02']
    ] : [
      ['home','Início','01'],['event','Meu evento','02'],['contract','Contrato','03'],['bills','Boletos','04'],['structure','Estrutura','05'],['docs','Documentos','06'],['manuals','Manuais','07'],['messages','Mensagens','08'],['contacts','Equipe','09'],['profile','Perfil','10']
    ];
    sideNav.innerHTML=nav.map(([id,label,n])=>`<button class="nav-item" data-view="${id}"><span>${label}</span><span>${n}</span></button>`).join('');
    $$('.nav-item',sideNav).forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.view)));
  }
  function activateNav(view){$$('.nav-item',sideNav).forEach(b=>b.classList.toggle('active',b.dataset.view===view||(view==='admin-brand'&&b.dataset.view==='admin-brands')||(view==='commercial-client'&&b.dataset.view==='commercial-clients')||(view==='staff-brand'&&b.dataset.view==='staff-brands')));}
  function closeSidebar(){sidebar.classList.remove('open');}

  async function boot(){
    try{
      const me=await api('/api/me');
      state.me={...me.user,brand:me.brand};state.csrf=me.csrf;state.passwordChangeRequired=!!me.user.must_change_password;showPortal();setShell();
      if(state.me.role!=='admin' && state.passwordChangeRequired){ openPasswordChangeModal(true); return; }
      await navigate(state.me.role==='admin'?'admin-home':state.me.role==='commercial'?'commercial-home':['finance','marketing'].includes(state.me.role)?'staff-home':'home');
    }catch(e){showAuth();}
  }

  bindPasswordToggles(authScreen);

  $('#loginForm').addEventListener('submit',async e=>{
    e.preventDefault();const msg=$('#loginMessage');msg.textContent='';
    try{
      const r=await api('/api/login',{method:'POST',body:{email:$('#loginEmail').value,password:$('#loginPassword').value}});
      state.csrf=r.csrf;await boot();
    }catch(err){msg.textContent=err.message;}
  });
  $('#logoutButton').addEventListener('click',async()=>{try{await api('/api/logout',{method:'POST'});}catch{} state.me=null;state.csrf=null;state.data=null;state.commercial=null;state.crmDetail=null;state.staff=null;state.staffDetail=null;showAuth();closeSidebar();});
  $('#menuToggle').addEventListener('click',()=>sidebar.classList.toggle('open'));
  $('#avatarButton').addEventListener('click',()=>navigate(state.me?.role==='admin'?'admin-home':state.me?.role==='commercial'?'commercial-home':['finance','marketing'].includes(state.me?.role)?'staff-home':'profile'));
  modalBackdrop.addEventListener('click',e=>{if(e.target===modalBackdrop)closeModal();});

  function openModal(html){modal.innerHTML=html;modalBackdrop.classList.remove('hidden');$('.modal-close',modal)?.addEventListener('click',closeModal);bindPasswordToggles(modal);}
  function closeModal(){if(state.passwordChangeRequired)return;modalBackdrop.classList.add('hidden');modal.innerHTML='';}
  function forceCloseModal(){modalBackdrop.classList.add('hidden');modal.innerHTML='';}
  function modalHead(title,sub=''){return `<div class="modal-head"><div><span class="kicker">${esc(sub)}</span><h2>${esc(title)}</h2></div><button class="modal-close" aria-label="Fechar">×</button></div>`;}
  function openPasswordChangeModal(required=false){
    state.passwordChangeRequired=required || state.passwordChangeRequired;
    const head=required
      ? `<div class="modal-head"><div><span class="kicker">PRIMEIRO ACESSO</span><h2>Crie sua nova senha</h2></div></div>`
      : modalHead('Alterar senha','SEGURANÇA');
    modal.innerHTML=`${head}<p>${required?'Por segurança, a senha inicial é temporária. Defina agora uma nova senha pessoal para continuar no Portal da Marca.':'Informe sua senha atual e escolha uma nova senha de acesso.'}</p><form id="changePasswordForm" class="form-grid"><div class="field full"><label>Senha atual<div class="password-wrap"><input id="currentPassword" name="current_password" type="password" minlength="8" required autocomplete="current-password"><button type="button" class="password-toggle" data-password-toggle="currentPassword">Ver</button></div></label></div><div class="field full"><label>Nova senha<div class="password-wrap"><input id="newOwnPassword" name="new_password" type="password" minlength="8" required autocomplete="new-password"><button type="button" class="password-toggle" data-password-toggle="newOwnPassword">Ver</button></div></label><small>Mínimo de 8 caracteres.</small></div><div class="field full"><label>Confirmar nova senha<div class="password-wrap"><input id="confirmOwnPassword" name="confirm_password" type="password" minlength="8" required autocomplete="new-password"><button type="button" class="password-toggle" data-password-toggle="confirmOwnPassword">Ver</button></div></label></div><div class="field full"><button class="btn btn-dark" type="submit">Salvar nova senha e continuar</button></div></form>`;
    modalBackdrop.classList.remove('hidden'); bindPasswordToggles(modal);
    if(!required) $('.modal-close',modal)?.addEventListener('click',closeModal);
    $('#changePasswordForm').addEventListener('submit',async e=>{
      e.preventDefault(); const body=Object.fromEntries(new FormData(e.target).entries());
      if(body.new_password!==body.confirm_password)return toast('A confirmação da nova senha não confere.');
      try{await api('/api/password/change',{method:'POST',body});state.passwordChangeRequired=false;forceCloseModal();toast('Senha alterada com sucesso.');await boot();}catch(err){showError(err)}
    });
  }

  async function navigate(view, param){
    state.view=view;activateNav(view);closeSidebar();window.scrollTo({top:0,behavior:'smooth'});
    content.innerHTML='<div class="loading"><div><div class="loading-mark">25</div><p>Carregando...</p></div></div>';
    try{

      if(state.me.role==='brand'){
        await loadBrand();
        const fn={home:viewHome,event:viewEvent,contract:viewContract,bills:viewBills,structure:viewStructure,docs:viewDocs,manuals:viewManuals,messages:viewMessages,contacts:viewContacts,profile:viewProfile}[view]||viewHome;
        fn(); return;
      }
      if(view.startsWith('commercial-')){
        if(!['admin','commercial'].includes(state.me.role)){await navigate('staff-home');return;}
        if(view==='commercial-client'){await loadCrmClient(param||state.crmDetail?.client?.id);viewCommercialClient();}
        else{await loadCommercial();if(view==='commercial-home')viewCommercialHome();else if(view==='commercial-agenda')viewCommercialAgenda();else if(view==='commercial-reports')viewCommercialReports();else viewCommercialClients();}
        return;
      }
      if(['finance','marketing'].includes(state.me.role)){
        if(view==='staff-brand'){await loadStaffBrand(param||state.staffDetail?.brand?.id);viewStaffBrand();}
        else{await loadStaff();if(view==='staff-brands')viewStaffBrands();else viewStaffHome();}
        return;
      }
      if(state.me.role==='commercial'){await navigate('commercial-home');return;}
      if(view==='admin-users'){await loadStaffUsers();viewAdminUsers();return;}
      if(view==='admin-brand') await loadAdminBrand(param||state.brandDetail?.brand?.id); else await loadAdmin();
      if(view==='admin-home') viewAdminHome();
      else if(view==='admin-pending') viewAdminPending();
      else if(view==='admin-brand') viewAdminBrand();
      else viewAdminBrands();
    }catch(err){
      if(err.status===401){showAuth();return;}
      content.innerHTML=`<div class="empty"><strong>Algo não carregou.</strong>${esc(err.message)}</div>`;
    }
  }
  async function loadBrand(){state.data=await api('/api/dashboard');}
  async function loadAdmin(){state.admin=await api('/api/admin/overview');state.csrf=state.admin.csrf||state.csrf;}
  async function loadAdminBrand(id){if(!id)throw new Error('Selecione uma marca.');state.brandDetail=await api(`/api/admin/brand/${encodeURIComponent(id)}`);state.csrf=state.brandDetail.csrf||state.csrf;}
  async function loadStaff(){state.staff=await api('/api/staff/overview');state.csrf=state.staff.csrf||state.csrf;}
  async function loadStaffBrand(id){if(!id)throw new Error('Selecione uma marca.');state.staffDetail=await api(`/api/staff/brand/${encodeURIComponent(id)}`);state.csrf=state.staffDetail.csrf||state.csrf;}
  async function loadStaffUsers(){state.staffUsers=await api('/api/admin/staff-users');state.csrf=state.staffUsers.csrf||state.csrf;}
  async function loadCommercial(){state.commercial=await api('/api/commercial/overview');state.csrf=state.commercial.csrf||state.csrf;}
  async function loadCrmClient(id){if(!id)throw new Error('Selecione uma marca/cliente.');state.crmDetail=await api(`/api/commercial/client/${encodeURIComponent(id)}`);state.csrf=state.crmDetail.csrf||state.csrf;}
  async function loadCommercialUsers(){state.commercialUsers=await api('/api/admin/commercial-users');state.csrf=state.commercialUsers.csrf||state.csrf;}

  function pageHead(kicker,title,desc,meta='',metaLabel=''){
    return `<div class="page-head"><div><span class="kicker">${esc(kicker)}</span><h1>${title}</h1>${desc?`<p>${esc(desc)}</p>`:''}</div>${meta?`<div class="head-meta"><strong>${esc(meta)}</strong><span>${esc(metaLabel)}</span></div>`:''}</div>`;
  }

  /* BRAND VIEWS */
  function viewHome(){
    const d=state.data,b=d.brand,openBills=d.bills.filter(x=>!['paid','cancelled'].includes(x.status)),pending=d.requirements.filter(x=>!['approved','done'].includes(x.status));
    const unread=d.messages.filter(m=>m.sender_role==='admin'&&!m.read_by_brand).length;
    const progress=percentDone(d.requirements);
    content.innerHTML=`
      ${pageHead('PORTAL DA MARCA',esc(b.name),'Área individual da sua marca. O que aparece aqui pertence apenas ao seu cadastro.',d.event.dates,'RIO DE JANEIRO')}
      <section class="hero-panel"><div><span class="kicker">JOCKEY CLUB BRASILEIRO</span><h2>Prepare sua marca.<br>O evento começa aqui.</h2><p>${esc(d.event.venue)} · ${esc(d.event.hours)}. Acompanhe suas pendências antes da montagem e use o portal para falar com cada setor.</p></div><div class="event-side"><strong>${esc(d.event.setup)}</strong><span>Montagem das marcas</span><strong style="margin-top:18px">${esc(d.event.cargo)}</strong><span>Acesso de carga</span></div></section>
      <div class="metric-grid">
        <div class="metric ${pending.length?'attention':''}"><div class="num">${pending.length}</div><div class="label">Documentos pendentes</div></div>
        <div class="metric"><div class="num">${openBills.length}</div><div class="label">Parcelas em aberto</div></div>
        <div class="metric blue"><div class="num">${progress}%</div><div class="label">Checklist documental</div></div>
        <div class="metric"><div class="num">${d.messages.filter(m=>m.sender_role==='admin').length}</div><div class="label">Mensagens da equipe</div></div>
      </div>
      <div class="section-title"><h2>Acesso rápido</h2><p>O conteúdo muda de acordo com a sua marca.</p></div>
      <div class="quick-grid">
        ${quick('contract','01','Contrato',d.contract?.file?'Documento disponível':statusLabel(d.contract?.status||'pending'))}
        ${quick('bills','02','Boletos',openBills.length?`${openBills.length} em aberto`:'Tudo em dia')}
        ${quick('structure','03','Estrutura',b.segment||'Personalizada')}
        ${quick('docs','04','Documentos',pending.length?`${pending.length} pendência(s)`:'Checklist concluído')}
        ${quick('event','05','Logística','Horários, acesso e chegada')}
        ${quick('manuals','06','Manuais','Expositor + Fiscal')}
        ${quick('messages','07','Mensagens',unread?`${unread} nova(s)`:'Fale com a equipe')}
        ${quick('contacts','08','Equipe','Financeiro · Comercial · Logística · Marketing')}
      </div>
      <div class="section-title"><h2>Próximos pontos</h2><p>Baseado no cadastro da sua marca.</p></div>
      <div class="two-col">
        <div class="card"><span class="label">DOCUMENTAÇÃO</span><h3>${pending.length?'Ainda há itens para enviar':'Documentação em ordem'}</h3><p>${pending.length?`Você tem ${pending.length} item(ns) aguardando envio ou aprovação.`:'Os documentos cadastrados estão aprovados/concluídos.'}</p><div class="progress"><span style="width:${progress}%"></span></div><div class="inline-actions" style="margin-top:16px"><button class="btn btn-small" data-go="docs">Ver documentos</button></div></div>
        <div class="card"><span class="label">ÚLTIMO AVISO</span><h3>${esc(d.notifications[0]?.title||'Carandaí 25')}</h3><p>${esc(d.notifications[0]?.body||'Acompanhe as informações do evento pelo portal.')}</p><div class="inline-actions" style="margin-top:16px"><button class="btn btn-small" data-go="event">Ver evento</button></div></div>
      </div>`;
    bindGo();
  }
  function quick(view,n,title,sub){return `<button class="quick" data-go="${view}"><span class="qnum">${n}</span><div><div class="qtitle">${esc(title)}</div><p>${esc(sub)}</p></div></button>`;}
  function bindGo(){$$('[data-go]',content).forEach(x=>x.addEventListener('click',()=>navigate(x.dataset.go)));}

  function viewEvent(){
    const e=state.data.event;
    content.innerHTML=`
      ${pageHead('RIO DE JANEIRO','Meu <em>evento.</em>','Informações operacionais da edição do Jockey Club.',e.dates,'05–08 NOV 2026')}
      <div class="structure-hero" style="background:var(--orange)"><div><span class="kicker">CARANDAÍ 25 · JOCKEY CLUB</span><h2>Chegar, montar,<br>vender, desmontar.</h2><p>${esc(e.address)} · Tribunas B & C.</p></div><div class="structure-items"><div>Evento · ${esc(e.hours)}</div><div>Carga · Rua Jardim Botânico, 971</div><div>Carros · Praça Santos Dumont, 31</div><div>Estacionamento · por conta do expositor</div></div></div>
      <div class="section-title"><h2>Linha do tempo</h2><p>Datas oficiais do manual do expositor.</p></div>
      <div class="event-timeline">
        <div class="date">04 NOV</div><div class="detail"><strong>Montagem · 13h às 19h</strong><p>Aplicável aos segmentos de Moda, Decoração e Bem-Estar.</p></div>
        <div class="date">05–08 NOV</div><div class="detail"><strong>Evento · 13h às 21h</strong><p>Quinta a domingo · Jockey Club Brasileiro · Tribunas B & C.</p></div>
        <div class="date">08 NOV</div><div class="detail"><strong>Desmontagem após 21h</strong><p>Somente após a saída do último cliente, até 00h.</p></div>
        <div class="date">09 NOV</div><div class="detail"><strong>Segunda janela · 10h às 16h</strong><p>Retirada final conforme orientação operacional.</p></div>
      </div>
      <div class="section-title"><h2>Como chegar</h2><p>Acesso de carga é diferente do acesso de carros comuns.</p></div>
      <div class="two-col"><div class="card"><span class="label">CARROS COMUNS</span><h3>Praça Santos Dumont, 31</h3><p>Também é possível acessar pela Rua Jardim Botânico, 971.</p><a class="btn btn-small" href="${esc(e.maps)}" target="_blank" rel="noopener">Abrir no Google Maps ↗</a></div><div class="card"><span class="label">CARGA</span><h3>Rua Jardim Botânico, 971</h3><p>Entrada de carga exclusivamente por este acesso. Estacionamento é por conta do expositor.</p></div></div>
      <div class="note" style="margin-top:18px">A Carandaí 25 não se responsabiliza por objetos deixados no Jockey Club após o período de desmontagem.</div>`;
  }

  function viewContract(){
    const c=state.data.contract||{};
    const generated=c.generated_file||c.file;
    const signed=c.signed_file;
    content.innerHTML=`${pageHead('DOCUMENTOS COMERCIAIS','Meu <em>contrato.</em>','Aqui ficam separados o contrato enviado para assinatura e a via assinada da sua marca.',statusLabel(c.status||'pending'),'STATUS')}
      <div class="two-col">
        <div class="card"><div class="card-row"><div><span class="label">CONTRATO PARA ASSINATURA</span><h3 class="contract-file-name">${generated?'Contrato disponível':'Aguardando geração'}</h3><p>${generated?`Arquivo: ${esc(generated.original_name)}${c.generated_at?` · gerado em ${fmtDateTime(c.generated_at)}`:''}`:'A equipe Comercial ainda não gerou o contrato desta marca.'}</p></div>${status(generated?'pending':'draft')}</div>${generated?`<div class="inline-actions" style="margin-top:18px"><button class="btn btn-dark" id="openGeneratedContract">Abrir contrato ↗</button></div>`:''}</div>
        <div class="card"><div class="card-row"><div><span class="label">CONTRATO ASSINADO</span><h3>${signed?'Via assinada salva':'Ainda não recebido'}</h3><p>${signed?`Arquivo: ${esc(signed.original_name)}${c.signed_at?` · assinatura ${fmtDate(c.signed_at)}`:''}`:'Quando a via assinada for recebida e conferida, ela ficará disponível aqui.'}</p></div>${status(signed?'signed':'pending')}</div>${signed?`<div class="inline-actions" style="margin-top:18px"><button class="btn btn-dark" id="openSignedContract">Abrir contrato assinado ↗</button></div>`:''}</div>
      </div>
      <div class="note" style="margin-top:18px"><strong>Assinatura eletrônica:</strong> o contrato é assinado digitalmente. O link de assinatura é enviado pela plataforma Contraktor em um e-mail separado.</div>
      <div class="inline-actions" style="margin-top:18px"><a class="btn" href="mailto:carandai25comercial@gmail.com?subject=Carandai%2025%20-%20Contrato%20da%20marca">Falar com Comercial</a></div>`;
    $('#openGeneratedContract')?.addEventListener('click',()=>openFile(generated?.id));
    $('#openSignedContract')?.addEventListener('click',()=>openFile(signed?.id));
  }

  function viewBills(){
    const bills=state.data.bills;
    content.innerHTML=`${pageHead('FINANCEIRO','Boletos & <em>pagamentos.</em>','As parcelas e PDFs são individualizados por marca.',String(bills.filter(x=>!['paid','cancelled'].includes(x.status)).length),'EM ABERTO')}
      ${bills.length?`<div>${bills.map(b=>`<div class="bill-row"><div class="bill-main"><strong>${esc(b.label)}</strong><span>Parcela ${esc(b.installment)} · vencimento ${fmtDate(b.due_date)}</span><div class="inline-actions" style="margin-top:7px">${b.file?`<button class="btn btn-small" data-file="${b.file.id}">Abrir boleto</button>`:''}${!['paid','cancelled'].includes(b.status)?`<button class="btn btn-small btn-soft" data-receipt="${b.id}">Enviar comprovante</button>`:''}</div></div><div class="bill-side"><div class="price">${fmtMoney(b.amount_cents)}</div>${status(b.status)}<div class="due">${fmtDate(b.due_date)}</div></div></div>`).join('')}</div>`:`<div class="empty"><strong>Nenhuma cobrança cadastrada.</strong>Quando o Financeiro disponibilizar as parcelas da sua marca, elas aparecerão aqui.</div>`}
      <div class="section-title"><h2>Financeiro</h2><p>Dúvidas sobre boleto, vencimento ou comprovante.</p></div>
      <div class="card"><span class="label">CANAL DIRETO</span><h3>financeiro2@carandai25.com</h3><p>Você também pode usar a central de mensagens do portal.</p><div class="inline-actions"><button class="btn btn-dark" id="msgFinance">Mensagem no portal</button><a class="btn" href="mailto:financeiro2@carandai25.com?subject=Carandai%2025%20-%20Financeiro">Enviar e-mail</a></div></div>`;
    $$('[data-file]',content).forEach(b=>b.addEventListener('click',()=>openFile(b.dataset.file)));
    $$('[data-receipt]',content).forEach(b=>b.addEventListener('click',()=>uploadReceipt(b.dataset.receipt)));
    $('#msgFinance')?.addEventListener('click',()=>{state.selectedSector='Financeiro';navigate('messages')});
  }
  function uploadReceipt(billId){
    openModal(`${modalHead('Enviar comprovante','FINANCEIRO')}<form id="receiptForm" class="form-grid"><div class="field full"><label>Arquivo</label><input type="file" id="receiptFile" accept="application/pdf,image/jpeg,image/png" required><small>PDF, JPG ou PNG · até 12 MB.</small></div><div class="field full"><button class="btn btn-dark" type="submit">Enviar ao Financeiro</button></div></form>`);
    $('#receiptForm').addEventListener('submit',async e=>{e.preventDefault();try{const file=await fileData($('#receiptFile').files[0]);await api(`/api/bill/${billId}/receipt`,{method:'POST',body:{file}});closeModal();toast('Comprovante enviado.');await navigate('bills');}catch(err){showError(err)}});
  }

  function viewStructure(){
    const b=state.data.brand;
    const s=b.structure||{}, items=s.items||[], resp=s.brandResponsibility||[];
    const image=s.image||'';
    content.innerHTML=`${pageHead('ESPAÇO DA MARCA','Estrutura <em>contratada.</em>','Esta tela é personalizada conforme o segmento e a contratação da marca.',b.segment||'—','SEGMENTO')}
      <div class="structure-hero"><div><span class="kicker">${esc(b.segment||'ESTRUTURA')}</span><h2>${esc(s.title||'Estrutura da marca')}</h2><p>${esc(s.note||'Consulte a equipe de Logística para detalhes do layout.')}</p></div><div class="structure-items">${items.map(x=>`<div>${esc(x)}</div>`).join('')||'<div>Estrutura personalizada</div>'}</div></div>
      ${image?`<section class="structure-image-section"><div class="structure-image-head"><span class="kicker">REFERÊNCIA VISUAL · MANUAL DO EXPOSITOR</span><h2>Estrutura do seu segmento</h2><p>A imagem abaixo é a referência visual oficial cadastrada para ${esc(b.segment||'sua marca')}.</p></div><div class="structure-image-frame"><img src="${esc(image)}" alt="Estrutura Carandaí 25 · ${esc(b.segment||'segmento')}" loading="lazy"></div></section>`:''}
      <div class="two-col"><div class="card"><span class="label">FORNECIDO PELA PRODUÇÃO</span><h3>O que estará no seu espaço</h3><div class="rule-list">${items.map(x=>`<div class="rule-row"><div><div class="title">${esc(x)}</div></div><span>✓</span></div>`).join('')||'<p>Consulte a logística.</p>'}</div></div><div class="card"><span class="label">RESPONSABILIDADE DA MARCA</span><h3>O que você precisa levar</h3>${resp.length?`<div class="rule-list">${resp.map(x=>`<div class="rule-row"><div><div class="title">${esc(x)}</div></div><span>→</span></div>`).join('')}</div>`:'<p>Nenhum item específico cadastrado além das obrigações gerais do manual.</p>'}<div class="inline-actions" style="margin-top:16px"><button class="btn btn-dark" id="msgLog">Falar com Logística</button></div></div></div>`;
    $('#msgLog')?.addEventListener('click',()=>{state.selectedSector='Logística';navigate('messages')});
  }

  function viewDocs(){
    const reqs=state.data.requirements,p=percentDone(reqs);
    content.innerHTML=`${pageHead('CHECKLIST DA MARCA','Documentos <em>pendentes.</em>','Envie seus arquivos pelo portal. A equipe muda o status para aprovado após conferência.',`${p}%`,'CONCLUÍDO')}
      <div class="card" style="margin-bottom:22px"><span class="label">PROGRESSO DOCUMENTAL</span><div class="progress"><span style="width:${p}%"></span></div><p>${reqs.filter(r=>['approved','done'].includes(r.status)).length} de ${reqs.length} item(ns) concluído(s).</p></div>
      <div>${reqs.map(r=>`<div class="doc-row"><div class="doc-main"><strong>${esc(r.label)}</strong><span>Prazo: ${fmtDate(r.due_date)}${r.notes?` · ${esc(r.notes)}`:''}</span>${r.file?`<div class="file-box">▱ ${esc(r.file.original_name)} <button class="link-button" data-file="${r.file.id}">abrir</button></div>`:''}</div><div class="inline-actions">${status(r.status)}${!['approved','done'].includes(r.status)?`<button class="btn btn-small" data-upload="${r.id}">Enviar arquivo</button>`:''}</div></div>`).join('')}</div>
      <div class="note" style="margin-top:22px"><strong>Para montar:</strong> o manual informa que Autorização SEFAZ/RJ e nota fiscal da mercadoria são obrigatórias.</div>`;
    $$('[data-file]',content).forEach(b=>b.addEventListener('click',()=>openFile(b.dataset.file)));
    $$('[data-upload]',content).forEach(b=>b.addEventListener('click',()=>uploadRequirement(b.dataset.upload)));
  }
  function uploadRequirement(id){
    const r=state.data.requirements.find(x=>x.id===id);if(!r)return;
    openModal(`${modalHead(r.label,'ENVIAR DOCUMENTO')}<form id="docUploadForm" class="form-grid"><div class="field full"><label>Arquivo</label><input type="file" id="docFile" accept="application/pdf,image/jpeg,image/png,.xml" required><small>PDF, JPG, PNG ou XML · até 12 MB.</small></div><div class="field full"><button class="btn btn-dark" type="submit">Enviar para conferência</button></div></form>`);
    $('#docUploadForm').addEventListener('submit',async e=>{e.preventDefault();try{const file=await fileData($('#docFile').files[0]);await api(`/api/requirement/${id}/upload`,{method:'POST',body:{file}});closeModal();toast('Documento enviado para conferência.');await navigate('docs');}catch(err){showError(err)}});
  }

  function viewManuals(){
    content.innerHTML=`${pageHead('INFORMAÇÃO DO EVENTO','Manuais <em>oficiais.</em>','Acesso centralizado aos materiais operacionais desta edição.','2','ARQUIVOS')}
      <div class="two-col"><div class="card"><span class="label">17 PÁGINAS</span><h3>Manual do Expositor</h3><p>Local, datas, acessos, montagem, desmontagem, infraestrutura, estruturas por segmento, legalização e checklist.</p><div class="inline-actions"><a class="btn btn-dark" href="/docs/Manual_do_Expositor_Carandai25.pdf" target="_blank">Abrir PDF ↗</a></div></div><div class="card"><span class="label">FISCAL</span><h3>Manual Fiscal</h3><p>Material complementar voltado especialmente às operações interestaduais e orientações fiscais.</p><div class="inline-actions"><a class="btn btn-dark" href="/docs/Manual_Fiscal_Expositor_Carandai25.pdf" target="_blank">Abrir PDF ↗</a></div></div></div>
      <div class="note" style="margin-top:20px">Os materiais fiscais complementares devem ser validados pelo contador da marca quando houver dúvida de enquadramento, CFOP ou recolhimento.</div>`;
  }

  const CONTACTS={Financeiro:'financeiro2@carandai25.com',Marketing:'marketing@carandai25.com',Comercial:'carandai25comercial@gmail.com',Logística:'carandai25financeiro@gmail.com'};
  function viewContacts(){
    content.innerHTML=`${pageHead('CENTRAL DE ATENDIMENTO','Falar com a <em>equipe.</em>','Use o portal para manter o histórico ou abra seu e-mail diretamente.','4','SETORES')}
      <div class="two-col">${Object.entries(CONTACTS).map(([sector,email],i)=>`<div class="card"><span class="label">${String(i+1).padStart(2,'0')} · SETOR</span><h3>${esc(sector)}</h3><p>${sector==='Financeiro'?'Boletos, pagamentos e comprovantes.':sector==='Comercial'?'Contrato, participação, condições e espaço.':sector==='Logística'?'Montagem, acesso, estrutura, placa, estoque e desmontagem.':'Divulgação, materiais, redes sociais e comunicação.'}</p><div class="rule-list"><div class="rule-row"><div><div class="title">${esc(email)}</div></div></div></div><div class="inline-actions" style="margin-top:14px"><button class="btn btn-dark btn-small" data-sector="${esc(sector)}">Mensagem no portal</button><a class="btn btn-small" href="mailto:${esc(email)}?subject=Carandai%2025%20-%20${encodeURIComponent(sector)}">E-mail ↗</a></div></div>`).join('')}</div>`;
    $$('[data-sector]',content).forEach(b=>b.addEventListener('click',()=>{state.selectedSector=b.dataset.sector;navigate('messages')}));
  }

  function viewMessages(){
    const d=state.data, sector=state.selectedSector||'Logística';
    const msgs=d.messages.filter(m=>m.sector===sector);
    content.innerHTML=`${pageHead('HISTÓRICO DA MARCA','Mensagens <em>diretas.</em>','Converse por setor e mantenha o histórico centralizado no portal.',String(d.messages.length),'MENSAGENS')}
      ${messageLayout(sector,msgs,'brand')}`;
    bindMessageUI('brand');
  }
  function messageLayout(sector,msgs,role){
    return `<div class="message-layout"><div class="sector-list">${Object.entries(CONTACTS).map(([s,email])=>`<button class="sector-button ${s===sector?'active':''}" data-sectorpick="${esc(s)}"><strong>${esc(s)}</strong><span>${esc(email)}</span></button>`).join('')}</div><div class="thread"><div class="thread-head"><div><span class="mini-label">CONVERSA COM</span><h3>${esc(sector)}</h3></div><a class="btn btn-small" href="mailto:${esc(CONTACTS[sector])}">Abrir e-mail ↗</a></div><div class="messages" id="threadMessages">${msgs.length?msgs.map(m=>`<div class="bubble ${m.sender_role===role?'mine':''}"><div class="meta">${esc(m.sender_name)} · ${fmtDateTime(m.created_at)}</div><p>${nl(m.body)}</p></div>`).join(''):'<div class="empty"><strong>Nenhuma mensagem ainda.</strong>Inicie a conversa abaixo.</div>'}</div><form class="message-form" id="messageForm"><textarea id="messageText" placeholder="Escreva sua mensagem para ${esc(sector)}..." required></textarea><button class="btn btn-dark" type="submit">Enviar</button></form></div></div>`;
  }
  function bindMessageUI(role){
    $$('[data-sectorpick]',content).forEach(b=>b.addEventListener('click',()=>{state.selectedSector=b.dataset.sectorpick;if(role==='brand')viewMessages();else renderAdminMessages();}));
    $('#messageForm')?.addEventListener('submit',async e=>{e.preventDefault();const body=$('#messageText').value.trim();if(!body)return;try{if(role==='brand')await api('/api/message',{method:'POST',body:{sector:state.selectedSector,body}});else await api(`/api/admin/brand/${state.brandDetail.brand.id}/message`,{method:'POST',body:{sector:state.selectedSector,body}});toast('Mensagem enviada.');if(role==='brand'){await loadBrand();viewMessages();}else{await loadAdminBrand(state.brandDetail.brand.id);renderAdminMessages();}}catch(err){showError(err)}});
    const tm=$('#threadMessages');if(tm)tm.scrollTop=tm.scrollHeight;
  }

  function viewProfile(){
    const b=state.data.brand;
    content.innerHTML=`${pageHead('MINHA CONTA','Perfil da <em>marca.</em>','Dados associados ao login atual.',b.segment||'—','SEGMENTO')}
      <div class="two-col"><div class="card"><span class="label">MARCA</span><h3>${esc(b.name)}</h3><div class="rule-list"><div class="rule-row"><div><div class="title">Razão social</div><div class="sub">${esc(b.legal_name||'Não informada')}</div></div></div><div class="rule-row"><div><div class="title">CNPJ</div><div class="sub">${esc(b.cnpj||'Não informado')}</div></div></div><div class="rule-row"><div><div class="title">Segmento</div><div class="sub">${esc(b.segment||'—')}</div></div></div></div></div><div class="card"><span class="label">CONTATO</span><h3>${esc(b.contact_name||state.me.name)}</h3><div class="rule-list"><div class="rule-row"><div><div class="title">E-mail</div><div class="sub">${esc(b.contact_email||state.me.email)}</div></div></div><div class="rule-row"><div><div class="title">Telefone</div><div class="sub">${esc(b.phone||'Não informado')}</div></div></div></div><p>Alterações cadastrais são feitas pela equipe Carandaí 25.</p></div></div><div class="card" style="margin-top:18px"><span class="label">SEGURANÇA</span><h3>Senha de acesso</h3><p>Você pode alterar sua senha sempre que quiser. No primeiro acesso, a troca da senha temporária é obrigatória.</p><button class="btn btn-dark btn-small" id="changeOwnPassword">Alterar minha senha</button></div>`;
    $('#changeOwnPassword').addEventListener('click',()=>openPasswordChangeModal(false));
  }


  /* CRM COMERCIAL */
  function crmType(c){
    const tags=[];if(Number(c.serves_event)===1)tags.push('<span class="crm-tag event">Evento</span>');if(Number(c.serves_store)===1)tags.push('<span class="crm-tag store">Loja</span>');return tags.join(' ');
  }
  function crmFilterRows(rows,filter=state.crmFilter,search=state.crmSearch){
    return rows.filter(c=>{
      const q=String(search||'').trim().toLowerCase();
      const hit=!q||\`\${c.trade_name} \${c.contact_name} \${c.phone} \${c.email||''} \${c.cnpj||''} \${c.legal_name||''} \${c.address||''}\`.toLowerCase().includes(q);
      const type=filter==='all'||(filter==='event'&&Number(c.serves_event)===1)||(filter==='store'&&Number(c.serves_store)===1)||(filter==='both'&&Number(c.serves_event)===1&&Number(c.serves_store)===1);
      return hit&&type;
    });
  }
  function crmClientTable(rows){
    return \`<div class="crm-table"><div class="crm-line head"><div>Marca / Cliente</div><div>Contato</div><div>Atuação</div><div>Status</div><div>Último contato</div><div>Próximo</div><div></div></div>\${rows.map(c=>\`<div class="crm-line" data-crm="\${c.id}"><div><div class="name">\${esc(c.trade_name)}</div>\${state.me.role==='admin'&&c.owner_name?\`<div class="seg">Responsável: \${esc(c.owner_name)}</div>\`:''}</div><div><strong>\${esc(c.contact_name)}</strong><span>\${esc(c.phone)}</span></div><div>\${crmType(c)}</div><div>\${status(c.status)}</div><div>\${fmtDate(c.last_contact)}</div><div>\${fmtDate(c.next_contact)}</div><div>→</div></div>\`).join('')||'<div class="empty"><strong>Nenhum cadastro encontrado.</strong>Use “Nova marca / cliente” para começar o histórico comercial.</div>'}</div>\`;
  }
  function bindCrmRows(){$('[data-crm]',content).forEach(r=>{r.style.cursor='pointer';r.addEventListener('click',()=>{state.crmTab='timeline';navigate('commercial-client',r.dataset.crm)});});}
  function crmFilters(){return \`<div class="crm-filterbar"><input class="search" id="crmSearch" placeholder="Buscar marca, contato, telefone ou CNPJ" value="\${esc(state.crmSearch)}"><select id="crmFilter" class="search"><option value="all" \${state.crmFilter==='all'?'selected':''}>Todos</option><option value="event" \${state.crmFilter==='event'?'selected':''}>Evento</option><option value="store" \${state.crmFilter==='store'?'selected':''}>Loja</option><option value="both" \${state.crmFilter==='both'?'selected':''}>Evento + Loja</option></select><button class="btn btn-dark" id="newCrmClient">+ Nova marca / cliente</button></div>\`;}

  function viewCommercialHome(){
    const d=state.commercial,c=d.counts,today=todayISO();
    const upcoming=d.activities.filter(a=>a.next_contact_date&&a.next_contact_date>=today).sort((a,b)=>String(a.next_contact_date).localeCompare(String(b.next_contact_date))).slice(0,8);
    const recent=d.activities.slice(0,6);
    content.innerHTML=\`\${pageHead('COMERCIAL CARANDAÍ 25','Relacionamento <em>com marcas.</em>','Histórico de prospecção, agenda e clientes de Evento e Loja.',String(c.total),'MARCAS / CLIENTES')}
      <section class="hero-panel crm-hero"><div><span class="kicker">CRM COMERCIAL</span><h2>Cada conversa.<br>Todo o histórico.</h2><p>Cadastre marcas novas mesmo sem CNPJ ou razão social, registre o que foi conversado por data e acompanhe os próximos contatos.</p></div><div class="event-side"><strong>\${c.event}</strong><span>Evento</span><strong style="margin-top:18px">\${c.store}</strong><span>Loja · \${c.both} em ambos</span></div></section>
      <div class="metric-grid"><div class="metric"><div class="num">\${c.total}</div><div class="label">Marcas / clientes</div></div><div class="metric blue"><div class="num">\${c.event}</div><div class="label">Evento</div></div><div class="metric"><div class="num">\${c.store}</div><div class="label">Loja</div></div><div class="metric attention"><div class="num">\${upcoming.length}</div><div class="label">Próximos contatos</div></div></div>
      <div class="inline-actions crm-home-actions"><button class="btn btn-dark" id="crmHomeNew">+ Cadastrar marca</button><button class="btn" id="crmHomeAgenda">Abrir agenda</button><button class="btn" id="crmHomeReports">Relatórios</button></div>
      <div class="two-col"><div><div class="section-title"><h2>Próximos contatos</h2><p>Follow-ups anotados na agenda.</p></div>\${upcoming.length?\`<div class="agenda-list">\${upcoming.map(a=>\`<button class="agenda-item" data-crm="\${a.client_id}"><div class="agenda-date">\${fmtDate(a.next_contact_date)}</div><div><strong>\${esc(a.trade_name)}</strong><p>\${esc(a.next_action||'Retomar contato')}</p></div><span>→</span></button>\`).join('')}</div>\`:'<div class="empty"><strong>Agenda livre.</strong>Nenhum próximo contato programado.</div>'}</div><div><div class="section-title"><h2>Conversas recentes</h2><p>Últimos registros da equipe.</p></div>\${recent.length?\`<div class="timeline compact">\${recent.map(a=>\`<div class="timeline-item"><div class="timeline-dot"></div><div><span>\${fmtDate(a.activity_date)} · \${esc(a.user_name||'Comercial')}</span><strong>\${esc(a.trade_name)}</strong><p>\${nl(a.note)}</p></div></div>\`).join('')}</div>\`:'<div class="empty"><strong>Sem histórico ainda.</strong>Registre o primeiro contato com uma marca.</div>'}</div></div>\`;
    $('#crmHomeNew').addEventListener('click',()=>openCrmClientModal());
    $('#crmHomeAgenda').addEventListener('click',()=>navigate('commercial-agenda'));
    $('#crmHomeReports').addEventListener('click',()=>navigate('commercial-reports'));
    $('[data-crm]',content).forEach(x=>x.addEventListener('click',()=>navigate('commercial-client',x.dataset.crm)));
  }

  function viewCommercialClients(){
    const rows=crmFilterRows(state.commercial.clients);
    content.innerHTML=\`\${pageHead('BASE COMERCIAL','Marcas & <em>clientes.</em>','CNPJ e razão social podem ser preenchidos depois. O histórico começa desde o primeiro contato.',String(rows.length),'RESULTADOS')}\${crmFilters()}\${crmClientTable(rows)}\`;
    $('#crmSearch').addEventListener('input',e=>{state.crmSearch=e.target.value;viewCommercialClients();$('#crmSearch')?.focus();});
    $('#crmFilter').addEventListener('change',e=>{state.crmFilter=e.target.value;viewCommercialClients();});
    $('#newCrmClient').addEventListener('click',()=>openCrmClientModal());
    bindCrmRows();
  }

  function openCrmClientModal(client=null){
    const isAdmin=state.me.role==='admin';
    const users=state.commercial?.commercialUsers||state.crmDetail?.commercialUsers||[];
    openModal(\`\${modalHead(client?'Editar marca / cliente':'Nova marca / cliente','CRM COMERCIAL')}<form id="crmClientForm" class="form-grid">
      <div class="field"><label>Nome fantasia<input name="trade_name" value="\${esc(client?.trade_name||'')}" required></label></div>
      <div class="field"><label>Nome do contato<input name="contact_name" value="\${esc(client?.contact_name||'')}" required></label></div>
      <div class="field"><label>Telefone de contato<input name="phone" value="\${esc(client?.phone||'')}" required></label></div>
      <div class="field"><label>E-mail<input name="email" type="email" value="\${esc(client?.email||'')}"></label></div>
      <div class="field"><label>CEP<input name="cep" value="\${esc(client?.cep||'')}" required></label></div>
      <div class="field full"><label>Endereço<input name="address" value="\${esc(client?.address||'')}" required></label></div>
      <div class="field"><label>CNPJ <small>opcional</small><input name="cnpj" value="\${esc(client?.cnpj||'')}"></label></div>
      <div class="field"><label>Razão social <small>opcional</small><input name="legal_name" value="\${esc(client?.legal_name||'')}"></label></div>
      <div class="field"><label>Status<select name="status">\${['prospect','contacted','negotiation','client','paused'].map(x=>\`<option value="\${x}" \${client?.status===x?'selected':''}>\${statusLabel(x)}</option>\`).join('')}</select></label></div>
      \${isAdmin?\`<div class="field"><label>Responsável comercial<select name="owner_user_id"><option value="">Sem responsável</option>\${users.map(u=>\`<option value="\${u.id}" \${client?.owner_user_id===u.id?'selected':''}>\${esc(u.name)}</option>\`).join('')}</select></label></div>\`:''}
      <div class="field full"><span class="field-label">Relacionamento</span><div class="crm-checks"><label><input type="checkbox" name="serves_event" \${Number(client?.serves_event)===1?'checked':''}> Evento</label><label><input type="checkbox" name="serves_store" \${Number(client?.serves_store)===1?'checked':''}> Loja</label></div><small>A mesma marca pode ser Evento e Loja ao mesmo tempo.</small></div>
      <div class="field full"><label>Observação geral<textarea name="notes">\${esc(client?.notes||'')}</textarea></label></div>
      <div class="field full"><button class="btn btn-dark" type="submit">\${client?'Salvar cadastro':'Cadastrar marca / cliente'}</button></div>
    </form>\`);
    $('#crmClientForm').addEventListener('submit',async e=>{e.preventDefault();try{const fd=new FormData(e.target);const body=Object.fromEntries(fd.entries());body.serves_event=$('[name="serves_event"]',e.target).checked;body.serves_store=$('[name="serves_store"]',e.target).checked;const url=client?\`/api/commercial/client/\${client.id}\`:'/api/commercial/clients';await api(url,{method:client?'PATCH':'POST',body});closeModal();toast(client?'Cadastro atualizado.':'Marca cadastrada no CRM.');await loadCommercial();if(client){await loadCrmClient(client.id);viewCommercialClient();}else viewCommercialClients();}catch(err){showError(err)}});
  }

  function viewCommercialClient(){
    const d=state.crmDetail,c=d.client;
    content.innerHTML=\`\${pageHead('HISTÓRICO COMERCIAL',esc(c.trade_name),'Cadastro, conversas e agenda desta marca.',statusLabel(c.status),'STATUS')}
      <div class="crm-client-head"><div><div class="crm-type-wrap">\${crmType(c)}</div><h2>\${esc(c.contact_name)}</h2><p>\${esc(c.phone)}\${c.email?\` · \${esc(c.email)}\`:''}</p></div><div class="inline-actions"><button class="btn btn-dark" id="addCrmActivity">+ Registrar contato</button><button class="btn" id="editCrmClient">Editar cadastro</button></div></div>
      <div class="admin-tabs">\${[['timeline','Linha do tempo'],['profile','Cadastro'],['agenda','Agenda']].map(([id,l])=>\`<button class="admin-tab \${state.crmTab===id?'active':''}" data-crmtab="\${id}">\${l}</button>\`).join('')}</div><div id="crmPanel" class="admin-panel"></div>\`;
    $('[data-crmtab]',content).forEach(x=>x.addEventListener('click',()=>{state.crmTab=x.dataset.crmtab;renderCrmTab();}));
    $('#addCrmActivity').addEventListener('click',()=>openCrmActivityModal(c.id));
    $('#editCrmClient').addEventListener('click',()=>openCrmClientModal(c));
    renderCrmTab();
  }
  function crmPanel(){return $('#crmPanel');}
  function renderCrmTab(){if(state.crmTab==='profile')renderCrmProfile();else if(state.crmTab==='agenda')renderCrmClientAgenda();else renderCrmTimeline();}
  function renderCrmTimeline(){
    const d=state.crmDetail,c=d.client;
    crmPanel().innerHTML=\`<div class="admin-toolbar"><span class="mini-label">LINHA DO TEMPO · \${d.activities.length} REGISTRO(S)</span><div class="inline-actions"><button class="btn btn-small" id="printCrmTimeline">Imprimir relatório</button><button class="btn btn-dark btn-small" id="timelineAdd">+ Novo contato</button></div></div>\${d.activities.length?\`<div class="timeline">\${d.activities.map(a=>\`<div class="timeline-item"><div class="timeline-dot"></div><div><span>\${fmtDate(a.activity_date)} · \${esc(a.user_name||'Equipe Comercial')}</span><strong>\${nl(a.note)}</strong>\${a.next_contact_date?\`<p>Próximo contato: \${fmtDate(a.next_contact_date)}\${a.next_action?\` · \${esc(a.next_action)}\`:''}</p>\`:''}<div class="timeline-actions"><button class="link-button" data-editactivity="\${a.id}">editar</button><button class="link-button danger-link" data-delactivity="\${a.id}">excluir</button></div></div></div>\`).join('')}</div>\`:'<div class="empty"><strong>Nenhuma conversa registrada.</strong>Adicione o primeiro contato para iniciar a linha do tempo.</div>'}\`;
    $('#timelineAdd').addEventListener('click',()=>openCrmActivityModal(c.id));
    $('#printCrmTimeline').addEventListener('click',()=>printCrmClientReport());
    $('[data-editactivity]',crmPanel()).forEach(x=>x.addEventListener('click',()=>openCrmActivityModal(c.id,d.activities.find(a=>a.id===x.dataset.editactivity))));
    $('[data-delactivity]',crmPanel()).forEach(x=>x.addEventListener('click',async()=>{if(!confirm('Excluir este registro da linha do tempo?'))return;try{await api(\`/api/commercial/activity/\${x.dataset.delactivity}\`,{method:'DELETE',body:{}});toast('Registro excluído.');await loadCrmClient(c.id);renderCrmTimeline();}catch(err){showError(err)}}));
  }

  function renderCrmProfile(){
    const c=state.crmDetail.client;
    crmPanel().innerHTML=\`<div class="two-col"><div class="card"><span class="label">MARCA / CLIENTE</span><h3>\${esc(c.trade_name)}</h3><div class="rule-list"><div class="rule-row"><div><div class="title">Nome do contato</div><div class="sub">\${esc(c.contact_name)}</div></div></div><div class="rule-row"><div><div class="title">Telefone</div><div class="sub">\${esc(c.phone)}</div></div></div><div class="rule-row"><div><div class="title">E-mail</div><div class="sub">\${esc(c.email||'Não informado')}</div></div></div><div class="rule-row"><div><div class="title">Relacionamento</div><div class="sub">\${crmType(c)||'Não definido'}</div></div></div></div></div><div class="card"><span class="label">DADOS CADASTRAIS</span><h3>\${esc(c.legal_name||'Razão social não informada')}</h3><div class="rule-list"><div class="rule-row"><div><div class="title">CNPJ</div><div class="sub">\${esc(c.cnpj||'Não informado')}</div></div></div><div class="rule-row"><div><div class="title">CEP</div><div class="sub">\${esc(c.cep)}</div></div></div><div class="rule-row"><div><div class="title">Endereço</div><div class="sub">\${esc(c.address)}</div></div></div></div><p>\${nl(c.notes||'')}</p><button class="btn btn-small" id="profileCrmEdit">Editar cadastro</button></div></div>\`;
    $('#profileCrmEdit').addEventListener('click',()=>openCrmClientModal(c));
  }

  function renderCrmClientAgenda(){
    const c=state.crmDetail.client,items=state.crmDetail.activities.filter(a=>a.next_contact_date).sort((a,b)=>String(a.next_contact_date).localeCompare(String(b.next_contact_date)));
    crmPanel().innerHTML=\`<div class="admin-toolbar"><span class="mini-label">PRÓXIMOS CONTATOS PROGRAMADOS</span><button class="btn btn-dark btn-small" id="agendaClientAdd">+ Agendar / registrar</button></div>\${items.length?\`<div class="agenda-list">\${items.map(a=>\`<div class="agenda-item static"><div class="agenda-date">\${fmtDate(a.next_contact_date)}</div><div><strong>\${esc(a.next_action||'Retomar contato')}</strong><p>Origem: conversa de \${fmtDate(a.activity_date)}</p></div></div>\`).join('')}</div>\`:'<div class="empty"><strong>Nenhum follow-up programado.</strong>Ao registrar uma conversa, defina a próxima data de contato.</div>'}\`;
    $('#agendaClientAdd').addEventListener('click',()=>openCrmActivityModal(c.id));
  }

  function openCrmActivityModal(clientId,activity=null,defaultDate=''){
    const client=(state.crmDetail?.client?.id===clientId?state.crmDetail.client:state.commercial?.clients.find(c=>c.id===clientId));
    openModal(\`\${modalHead(activity?'Editar contato':'Registrar conversa',client?.trade_name||'AGENDA COMERCIAL')}<form id="crmActivityForm" class="form-grid"><div class="field"><label>Data da conversa<input type="date" name="activity_date" value="\${esc(activity?.activity_date||defaultDate||todayISO())}" required></label></div><div class="field"><label>Próximo contato<input type="date" name="next_contact_date" value="\${esc(activity?.next_contact_date||'')}"></label></div><div class="field full"><label>O que foi conversado<textarea name="note" required>\${esc(activity?.note||'')}</textarea></label></div><div class="field full"><label>Próxima ação<textarea name="next_action" placeholder="Ex.: enviar proposta, ligar novamente, confirmar coleção...">\${esc(activity?.next_action||'')}</textarea></label></div><div class="field full"><button class="btn btn-dark" type="submit">Salvar no histórico</button></div></form>\`);
    $('#crmActivityForm').addEventListener('submit',async e=>{e.preventDefault();try{const body=Object.fromEntries(new FormData(e.target).entries());const url=activity?\`/api/commercial/activity/\${activity.id}\`:\`/api/commercial/client/\${clientId}/activity\`;await api(url,{method:activity?'PATCH':'POST',body});closeModal();toast('Histórico atualizado.');await loadCommercial();if(state.view==='commercial-client'){await loadCrmClient(clientId);viewCommercialClient();}else if(state.view==='commercial-agenda')viewCommercialAgenda();else viewCommercialHome();}catch(err){showError(err)}});
  }

  function openAgendaActivityModal(date){
    const clients=state.commercial.clients;
    if(!clients.length){toast('Cadastre uma marca antes de criar um contato.');return;}
    openModal(\`\${modalHead('Agenda comercial',fmtDate(date))}<form id="agendaActivityForm" class="form-grid"><div class="field full"><label>Marca / cliente<select name="client_id">\${clients.map(c=>\`<option value="\${c.id}">\${esc(c.trade_name)} · \${esc(c.contact_name)}</option>\`).join('')}</select></label></div><div class="field"><label>Data da conversa<input type="date" name="activity_date" value="\${esc(date)}" required></label></div><div class="field"><label>Próximo contato<input type="date" name="next_contact_date"></label></div><div class="field full"><label>O que foi conversado<textarea name="note" required></textarea></label></div><div class="field full"><label>Próxima ação<textarea name="next_action"></textarea></label></div><div class="field full"><button class="btn btn-dark" type="submit">Salvar na agenda</button></div></form>\`);
    $('#agendaActivityForm').addEventListener('submit',async e=>{e.preventDefault();try{const body=Object.fromEntries(new FormData(e.target).entries());const id=body.client_id;delete body.client_id;await api(\`/api/commercial/client/\${id}/activity\`,{method:'POST',body});closeModal();toast('Contato salvo na agenda.');await loadCommercial();viewCommercialAgenda();}catch(err){showError(err)}});
  }

  function calendarHtml(month,activities){
    const [y,m]=month.split('-').map(Number),first=new Date(y,m-1,1),days=new Date(y,m,0).getDate(),start=first.getDay();
    const names=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];let html=\`<div class="calendar-head">\${names.map(n=>\`<div>\${n}</div>\`).join('')}</div><div class="calendar-grid">\`;
    for(let i=0;i<start;i++)html+='<div class="calendar-day empty-day"></div>';
    for(let day=1;day<=days;day++){const date=\`\${y}-\${String(m).padStart(2,'0')}-\${String(day).padStart(2,'0')}\`;const conv=activities.filter(a=>a.activity_date===date);const follow=activities.filter(a=>a.next_contact_date===date);html+=\`<button class="calendar-day \${date===todayISO()?'today':''}" data-agenda-date="\${date}"><span class="day-num">\${day}</span>\${conv.slice(0,2).map(a=>\`<span class="cal-chip">\${esc(a.trade_name)}</span>\`).join('')}\${follow.slice(0,2).map(a=>\`<span class="cal-chip follow">↗ \${esc(a.trade_name)}</span>\`).join('')}\${conv.length+follow.length>4?\`<small>+\${conv.length+follow.length-4}</small>\`:''}</button>\`;}
    return html+'</div>';
  }

  function viewCommercialAgenda(){
    const d=state.commercial,today=todayISO(),upcoming=d.activities.filter(a=>a.next_contact_date&&a.next_contact_date>=today).sort((a,b)=>String(a.next_contact_date).localeCompare(String(b.next_contact_date))).slice(0,20);
    content.innerHTML=\`\${pageHead('AGENDA COMERCIAL','Agenda & <em>follow-up.</em>','Clique em uma data para registrar o que foi conversado. O próximo contato também fica programado.',state.crmMonth,'MÊS')}
      <div class="admin-toolbar"><input type="month" class="search" id="crmMonth" value="\${esc(state.crmMonth)}"><button class="btn btn-dark" id="agendaToday">+ Registrar hoje</button></div>
      <div class="calendar">\${calendarHtml(state.crmMonth,d.activities)}</div>
      <div class="section-title"><h2>Próximos contatos</h2><p>Agenda futura de todas as suas marcas.</p></div>\${upcoming.length?\`<div class="agenda-list">\${upcoming.map(a=>\`<button class="agenda-item" data-crm="\${a.client_id}"><div class="agenda-date">\${fmtDate(a.next_contact_date)}</div><div><strong>\${esc(a.trade_name)}</strong><p>\${esc(a.next_action||'Retomar contato')} · último registro \${fmtDate(a.activity_date)}</p></div><span>→</span></button>\`).join('')}</div>\`:'<div class="empty"><strong>Nenhum próximo contato.</strong>Use a agenda para programar os follow-ups.</div>'}\`;
    $('#crmMonth').addEventListener('change',e=>{state.crmMonth=e.target.value;viewCommercialAgenda();});
    $('#agendaToday').addEventListener('click',()=>openAgendaActivityModal(todayISO()));
    $('[data-agenda-date]',content).forEach(x=>x.addEventListener('click',()=>openAgendaActivityModal(x.dataset.agendaDate)));
    $('[data-crm]',content).forEach(x=>x.addEventListener('click',()=>navigate('commercial-client',x.dataset.crm)));
  }

  function reportRows(){return crmFilterRows(state.commercial.clients,state.crmReportFilter,'');}
  function viewCommercialReports(){
    const rows=reportRows();
    content.innerHTML=\`\${pageHead('RELATÓRIOS COMERCIAIS','Clientes por <em>canal.</em>','Filtre Evento, Loja ou marcas que trabalham nos dois formatos.',String(rows.length),'CADASTROS')}
      <div class="report-filter"><button class="btn \${state.crmReportFilter==='all'?'btn-dark':''}" data-reportfilter="all">Todos</button><button class="btn \${state.crmReportFilter==='event'?'btn-dark':''}" data-reportfilter="event">Evento</button><button class="btn \${state.crmReportFilter==='store'?'btn-dark':''}" data-reportfilter="store">Loja</button><button class="btn \${state.crmReportFilter==='both'?'btn-dark':''}" data-reportfilter="both">Evento + Loja</button></div>
      <div class="metric-grid report-metrics"><div class="metric"><div class="num">\${state.commercial.counts.total}</div><div class="label">Total</div></div><div class="metric blue"><div class="num">\${state.commercial.counts.event}</div><div class="label">Evento</div></div><div class="metric"><div class="num">\${state.commercial.counts.store}</div><div class="label">Loja</div></div><div class="metric"><div class="num">\${state.commercial.counts.both}</div><div class="label">Evento + Loja</div></div></div>
      <div class="admin-toolbar"><span class="mini-label">RELATÓRIO: \${esc(({all:'Todos',event:'Evento',store:'Loja',both:'Evento + Loja'})[state.crmReportFilter])}</span><div class="inline-actions"><button class="btn btn-small" id="printCrmReport">Imprimir</button><button class="btn btn-dark btn-small" id="exportCrmCsv">Exportar CSV</button></div></div>\${crmClientTable(rows)}\`;
    $('[data-reportfilter]',content).forEach(b=>b.addEventListener('click',()=>{state.crmReportFilter=b.dataset.reportfilter;viewCommercialReports();}));
    $('#printCrmReport').addEventListener('click',()=>printCrmList(rows));
    $('#exportCrmCsv').addEventListener('click',()=>downloadCrmCsv(rows));
    bindCrmRows();
  }

  function downloadCrmCsv(rows){
    const head=['Nome fantasia','Contato','Telefone','E-mail','CEP','Endereço','CNPJ','Razão social','Evento','Loja','Status','Responsável','Último contato','Próximo contato'];
    const vals=rows.map(c=>[c.trade_name,c.contact_name,c.phone,c.email,c.cep,c.address,c.cnpj,c.legal_name,Number(c.serves_event)===1?'Sim':'Não',Number(c.serves_store)===1?'Sim':'Não',statusLabel(c.status),c.owner_name||state.me.name,c.last_contact||'',c.next_contact||'']);
    const csv=[head,...vals].map(r=>r.map(v=>\`"\${String(v??'').replace(/"/g,'""')}"\`).join(';')).join('\\n');const blob=new Blob(['\\ufeff'+csv],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=\`carandai25-relatorio-\${state.crmReportFilter}-\${todayISO()}.csv\`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  function printWindow(title,body){const w=window.open('','_blank');if(!w)return toast('Permita pop-ups para imprimir o relatório.');w.document.write(\`<!doctype html><html><head><meta charset="utf-8"><title>\${esc(title)}</title><style>body{font-family:Arial,sans-serif;color:#111;padding:32px}h1{font-family:Georgia,serif;font-style:italic;font-weight:400}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border-bottom:1px solid #bbb;text-align:left;padding:8px}.meta{color:#666;font-size:11px}.item{border-bottom:1px solid #aaa;padding:14px 0}.item h3{margin:4px 0}.tag{display:inline-block;border:1px solid #111;padding:3px 6px;margin-right:4px;font-size:10px}</style></head><body><div class="meta">CARANDAÍ 25 · COMERCIAL · \${new Date().toLocaleDateString('pt-BR')}</div>\${body}</body></html>\`);w.document.close();w.focus();setTimeout(()=>w.print(),250);}
  function printCrmList(rows){printWindow('Relatório Comercial Carandaí 25',\`<h1>Relatório de marcas / clientes</h1><p>\${rows.length} cadastro(s) · filtro: \${esc(({all:'Todos',event:'Evento',store:'Loja',both:'Evento + Loja'})[state.crmReportFilter])}</p><table><thead><tr><th>Marca</th><th>Contato</th><th>Telefone</th><th>Tipo</th><th>Status</th></tr></thead><tbody>\${rows.map(c=>\`<tr><td>\${esc(c.trade_name)}</td><td>\${esc(c.contact_name)}</td><td>\${esc(c.phone)}</td><td>\${Number(c.serves_event)===1?'Evento ':''}\${Number(c.serves_store)===1?'Loja':''}</td><td>\${esc(statusLabel(c.status))}</td></tr>\`).join('')}</tbody></table>\`);}
  function printCrmClientReport(){const d=state.crmDetail,c=d.client;printWindow(\`Linha do tempo · \${c.trade_name}\`,\`<h1>\${esc(c.trade_name)}</h1><p>\${esc(c.contact_name)} · \${esc(c.phone)}\${c.email?' · '+esc(c.email):''}</p><p><span class="tag">\${Number(c.serves_event)===1?'Evento':''}</span>\${Number(c.serves_store)===1?'<span class="tag">Loja</span>':''} · \${esc(statusLabel(c.status))}</p><h2>Linha do tempo</h2>\${d.activities.map(a=>\`<div class="item"><div class="meta">\${fmtDate(a.activity_date)} · \${esc(a.user_name||'Equipe Comercial')}</div><h3>\${nl(a.note)}</h3>\${a.next_contact_date?\`<p>Próximo contato: \${fmtDate(a.next_contact_date)} · \${esc(a.next_action||'')}</p>\`:''}</div>\`).join('')||'<p>Nenhum contato registrado.</p>'}\`);}

  function profileLabel(p){return ({master:'Master',commercial:'Comercial',finance:'Financeiro',marketing:'Marketing'}[p]||p||'—');}
  function viewAdminUsers(){
    const users=state.staffUsers.users||[];
    content.innerHTML=\`\${pageHead('ACESSOS DO PORTAL','Usuários & <em>permissões.</em>','O Master cria os usuários internos. Todos entram pela mesma tela principal e veem apenas o setor autorizado.',String(users.filter(u=>Number(u.active)===1).length),'ATIVOS')}
      <div class="card access-explainer"><span class="label">PERFIS</span><div class="access-grid"><div><strong>Master</strong><p>Acesso total e gestão de usuários.</p></div><div><strong>Comercial</strong><p>CRM, agenda, histórico e relatórios.</p></div><div><strong>Financeiro</strong><p>Contratos, boletos e atendimento financeiro.</p></div><div><strong>Marketing</strong><p>Dados básicos e atendimento de Marketing.</p></div></div></div>
      <div class="admin-toolbar"><span class="mini-label">USUÁRIOS INTERNOS</span><button class="btn btn-dark" id="newStaffUser">+ Novo usuário</button></div>
      <div class="brand-table"><div class="staff-user-line head"><div>Usuário</div><div>E-mail</div><div>Perfil</div><div>Status</div><div></div></div>
      \${users.map(u=>\`<div class="staff-user-line"><div><div class="name">\${esc(u.name)}</div>\${u.profile==='master'?'<div class="seg">Usuário principal protegido</div>':''}</div><div>\${esc(u.email)}</div><div><span class="access-badge \${esc(u.profile)}">\${esc(profileLabel(u.profile))}</span></div><div>\${Number(u.active)===1?status('active'):status('inactive')}</div><div>\${u.profile==='master'?'<span class="mini-label">MASTER</span>':\`<button class="btn btn-small" data-editstaff="\${u.id}">Editar</button>\`}</div></div>\`).join('')}</div>\`;
    $('#newStaffUser').addEventListener('click',()=>openStaffUserModal());
    $$('[data-editstaff]',content).forEach(x=>x.addEventListener('click',()=>openStaffUserModal(users.find(u=>u.id===x.dataset.editstaff))));
  }
  function openStaffUserModal(user=null){
    openModal(\`\${modalHead(user?'Editar usuário':'Novo usuário interno','USUÁRIOS E ACESSOS')}<form id="staffUserForm" class="form-grid">
      <div class="field"><label>Nome<input name="name" value="\${esc(user?.name||'')}" required></label></div>
      <div class="field"><label>E-mail de login<input name="email" type="email" value="\${esc(user?.email||'')}" required></label></div>
      <div class="field"><label>Perfil de acesso<select name="profile" required><option value="commercial" \${user?.profile==='commercial'?'selected':''}>Comercial</option><option value="finance" \${user?.profile==='finance'?'selected':''}>Financeiro</option><option value="marketing" \${user?.profile==='marketing'?'selected':''}>Marketing</option></select></label></div>
      <div class="field"><label>\${user?'Nova senha temporária':'Senha inicial'}<div class="password-wrap"><input id="staffTempPassword" name="password" type="password" minlength="8" \${user?'placeholder="Deixe em branco para manter"':'required'}><button type="button" class="password-toggle" data-password-toggle="staffTempPassword">Ver</button></div></label><small>\${user?'Preencha somente para redefinir.':'No primeiro acesso o usuário deverá criar uma nova senha.'}</small></div>
      \${user?\`<div class="field full"><div class="crm-checks"><label><input type="checkbox" id="staffActive" \${Number(user.active)===1?'checked':''}> Usuário ativo</label></div></div>\`:''}
      <div class="field full"><button class="btn btn-dark" type="submit">Salvar usuário e acesso</button></div>
    </form>\`);
    bindPasswordToggles(modal);
    $('#staffUserForm').addEventListener('submit',async e=>{e.preventDefault();try{const body=Object.fromEntries(new FormData(e.target).entries());if(user){body.new_password=body.password;delete body.password;if(!body.new_password)delete body.new_password;body.active=$('#staffActive').checked;await api(\`/api/admin/staff-user/\${user.id}\`,{method:'PATCH',body});}else await api('/api/admin/staff-users',{method:'POST',body});closeModal();toast('Usuário e permissão salvos.');await loadStaffUsers();viewAdminUsers();}catch(err){showError(err)}});
  }

  function staffBrandTable(rows){
    const finance=state.me.role==='finance';
    return \`<div class="brand-table"><div class="staff-brand-line head"><div>Marca</div><div>Contato</div><div>\${finance?'Contrato':'Segmento'}</div><div>\${finance?'Boletos':'Msgs'}</div><div></div></div>\${rows.map(b=>\`<div class="staff-brand-line" data-staffbrand="\${b.id}"><div><div class="name">\${esc(b.name)}</div><div class="seg">\${esc(b.legal_name||'')}</div></div><div><strong>\${esc(b.contact_name||'—')}</strong><span>\${esc(b.contact_email||'')}</span></div><div>\${finance?status(b.contract_status||'pending'):esc(b.segment||'—')}</div><div>\${finance?Number(b.open_bills||0):Number(b.unread_messages||0)}</div><div>→</div></div>\`).join('')||'<div class="empty"><strong>Nenhuma marca cadastrada.</strong></div>'}</div>\`;
  }
  function bindStaffRows(){$$('[data-staffbrand]',content).forEach(r=>{r.style.cursor='pointer';r.addEventListener('click',()=>navigate('staff-brand',r.dataset.staffbrand));});}
  function viewStaffHome(){
    const d=state.staff,c=d.counts,finance=state.me.role==='finance';
    content.innerHTML=\`\${pageHead(finance?'FINANCEIRO':'MARKETING',finance?'Painel <em>Financeiro.</em>':'Painel de <em>Marketing.</em>',finance?'Contratos, cobranças e mensagens financeiras das marcas.':'Comunicação com as marcas pelo canal de Marketing.',String(c.brands),'MARCAS')}
      <div class="metric-grid"><div class="metric"><div class="num">\${c.brands}</div><div class="label">Marcas</div></div>\${finance?\`<div class="metric attention"><div class="num">\${c.openBills}</div><div class="label">Boletos em aberto</div></div><div class="metric blue"><div class="num">\${c.unsigned}</div><div class="label">Contratos não assinados</div></div>\`:'<div class="metric blue"><div class="num">MKT</div><div class="label">Canal de atendimento</div></div><div class="metric"><div class="num">25</div><div class="label">Carandaí</div></div>'}<div class="metric \${c.unreadMessages?'attention':''}"><div class="num">\${c.unreadMessages}</div><div class="label">Mensagens não lidas</div></div></div>
      <div class="section-title"><h2>Marcas</h2><p>Clique para abrir o atendimento do seu setor.</p></div>\${staffBrandTable(d.brands.slice(0,10))}\`;
    bindStaffRows();
  }
  function viewStaffBrands(){
    const rows=state.staff.brands.filter(b=>!state.search||\`\${b.name} \${b.contact_name} \${b.contact_email} \${b.cnpj}\`.toLowerCase().includes(state.search.toLowerCase()));
    content.innerHTML=\`\${pageHead(state.me.role==='finance'?'FINANCEIRO':'MARKETING','Marcas <em>cadastradas.</em>','Acesse somente as funções do seu setor.',String(rows.length),'RESULTADOS')}<div class="admin-toolbar"><input class="search" id="staffSearch" placeholder="Buscar marca, contato, e-mail ou CNPJ" value="\${esc(state.search)}"></div>\${staffBrandTable(rows)}\`;
    $('#staffSearch').addEventListener('input',e=>{state.search=e.target.value;viewStaffBrands();$('#staffSearch')?.focus();});bindStaffRows();
  }
  function viewStaffBrand(){
    const d=state.staffDetail,b=d.brand,finance=state.me.role==='finance';
    content.innerHTML=\`\${pageHead(finance?'FINANCEIRO DA MARCA':'MARKETING DA MARCA',esc(b.name),finance?'Contrato, boletos e conversa financeira.':'Contato e conversa com o Marketing.',b.segment||'—','SEGMENTO')}
      <div class="two-col"><div class="card"><span class="label">CONTATO</span><h3>\${esc(b.contact_name||'—')}</h3><p>\${esc(b.contact_email||'')} · \${esc(b.phone||'')}</p><p>\${esc(b.address||'')}</p></div><div class="card"><span class="label">CADASTRO</span><h3>\${esc(b.legal_name||'Razão social não informada')}</h3><p>CNPJ: \${esc(b.cnpj||'Não informado')}</p></div></div>
      \${finance?staffFinanceSections(d):''}
      <div class="section-title"><h2>Mensagens · \${esc(d.sector)}</h2><p>Histórico exclusivo do seu setor.</p></div><div id="staffMessageArea">\${staffMessageLayout(d.messages,d.sector)}</div>\`;
    bindStaffFinance(d);bindStaffMessages(d);
  }
  function staffFinanceSections(d){
    const c=d.contract||{},generated=c.generated_file||c.file,signed=c.signed_file;
    return \`<div class="section-title"><h2>Contrato & financeiro</h2><p>Acesso operacional do Financeiro.</p></div><div class="two-col"><div class="card"><span class="label">CONTRATO</span><h3 class="contract-file-name">\${generated?esc(generated.original_name):'Ainda não gerado'}</h3><p>\${signed?'Via assinada disponível.':'Via assinada ainda não salva.'}</p><div class="inline-actions">\${generated?\`<button class="btn btn-small" id="staffOpenContract">Abrir contrato</button>\`:''}\${signed?\`<button class="btn btn-small" id="staffOpenSigned">Abrir assinado</button>\`:''}</div></div><div class="card"><span class="label">BOLETOS</span><h3>\${d.bills?.filter(x=>!['paid','cancelled'].includes(x.status)).length||0} em aberto</h3><div class="rule-list">\${(d.bills||[]).map(x=>\`<div class="rule-row"><div><div class="title">\${esc(x.label)}</div><div class="sub">\${fmtDate(x.due_date)} · \${fmtMoney(x.amount_cents)}</div></div><div>\${status(x.status)}</div></div>\`).join('')||'<p>Nenhum boleto cadastrado.</p>'}</div></div></div>\`;
  }
  function bindStaffFinance(d){if(state.me.role!=='finance')return;$('#staffOpenContract')?.addEventListener('click',()=>openFile((d.contract?.generated_file||d.contract?.file)?.id));$('#staffOpenSigned')?.addEventListener('click',()=>openFile(d.contract?.signed_file?.id));}
  function staffMessageLayout(msgs,sector){return \`<div class="thread standalone"><div class="messages" id="staffThreadMessages">\${msgs.length?msgs.map(m=>\`<div class="bubble \${m.sender_role==='admin'?'mine':''}"><div class="meta">\${esc(m.sender_name)} · \${fmtDateTime(m.created_at)}</div><p>\${nl(m.body)}</p></div>\`).join(''):'<div class="empty"><strong>Nenhuma mensagem ainda.</strong>Inicie a conversa abaixo.</div>'}</div><form class="message-form" id="staffMessageForm"><textarea id="staffMessageText" placeholder="Escreva para a marca pelo setor \${esc(sector)}..." required></textarea><button class="btn btn-dark" type="submit">Enviar</button></form></div>\`;}
  function bindStaffMessages(d){$('#staffMessageForm')?.addEventListener('submit',async e=>{e.preventDefault();const body=$('#staffMessageText').value.trim();if(!body)return;try{await api(\`/api/staff/brand/\${d.brand.id}/message\`,{method:'POST',body:{body}});toast('Mensagem enviada.');await loadStaffBrand(d.brand.id);viewStaffBrand();}catch(err){showError(err)}});const tm=$('#staffThreadMessages');if(tm)tm.scrollTop=tm.scrollHeight;}



  /* ADMIN */
  function viewAdminHome(){
    const a=state.admin,c=a.counts;
    content.innerHTML=`${pageHead('GESTÃO DO PORTAL','Operação <em>Carandaí 25.</em>','Painel interno para administrar o que cada marca vê no próprio login.',String(c.brands),'MARCAS')}
      <section class="hero-panel"><div><span class="kicker">PAINEL INTERNO</span><h2>Uma base única.<br>Cada marca, seu conteúdo.</h2><p>Cadastre marcas, publique contratos e boletos, defina estrutura, aprove documentos e responda mensagens por setor.</p></div><div class="event-side"><strong>05–08 NOV 2026</strong><span>Jockey Club · Rio</span><strong style="margin-top:18px">04 NOV · 13h–19h</strong><span>Montagem</span></div></section>
      <div class="metric-grid"><div class="metric"><div class="num">${c.brands}</div><div class="label">Marcas cadastradas</div></div><div class="metric ${c.openBills?'attention':''}"><div class="num">${c.openBills}</div><div class="label">Boletos em aberto</div></div><div class="metric blue"><div class="num">${c.pendingDocs}</div><div class="label">Documentos pendentes</div></div><div class="metric ${c.unreadMessages?'attention':''}"><div class="num">${c.unreadMessages}</div><div class="label">Mensagens não lidas</div></div></div>
      <div class="quick-grid" style="margin-top:18px"><button class="quick-card" id="goCrm"><span>CRM COMERCIAL</span><strong>${c.crmClients||0} marcas / clientes</strong><small>${c.commercialUsers||0} usuário(s) comercial(is)</small></button><button class="quick-card" id="goStaffUsers"><span>USUÁRIOS E ACESSOS</span><strong>Master + setores</strong><small>Comercial, Financeiro e Marketing.</small></button></div>
      <div class="section-title"><h2>Atenção agora</h2><p>Marcas com maior número de pendências.</p></div>
      ${adminBrandTable(a.brands.slice().sort((x,y)=>(y.pending_docs+y.open_bills+y.unread_messages)-(x.pending_docs+x.open_bills+x.unread_messages)).slice(0,8))}`;
    bindBrandRows();
    $('#goCrm')?.addEventListener('click',()=>navigate('commercial-home'));
    $('#goStaffUsers')?.addEventListener('click',()=>navigate('admin-users'));
  }

  function adminBrandTable(rows){
    return `<div class="brand-table"><div class="brand-line head"><div>Marca</div><div class="seg">Segmento</div><div class="c1">Docs</div><div class="c2">Boletos</div><div class="c3">Msgs</div><div></div></div>${rows.map(b=>`<div class="brand-line" data-brand="${b.id}"><div><div class="name">${esc(b.name)}</div><div class="seg">${esc(b.login_email||'')}</div></div><div class="seg">${esc(b.segment||'—')}</div><div class="counter c1">${b.pending_docs}</div><div class="counter c2">${b.open_bills}</div><div class="counter c3">${b.unread_messages}</div><div>→</div></div>`).join('')||'<div class="empty"><strong>Nenhuma marca.</strong>Cadastre a primeira marca.</div>'}</div>`;
  }
  function bindBrandRows(){$$('[data-brand]',content).forEach(r=>{r.style.cursor='pointer';r.addEventListener('click',()=>{state.adminTab='summary';navigate('admin-brand',r.dataset.brand)});});}

  function viewAdminBrands(){
    const rows=state.admin.brands.filter(b=>!state.search||`${b.name} ${b.segment} ${b.login_email}`.toLowerCase().includes(state.search.toLowerCase()));
    content.innerHTML=`${pageHead('CADASTRO & OPERAÇÃO','Marcas <em>expositoras.</em>','Cada login está ligado a uma marca e só recebe os dados desse cadastro.',String(state.admin.brands.length),'CADASTRADAS')}
      <div class="admin-toolbar"><input class="search" id="brandSearch" placeholder="Buscar marca, segmento ou e-mail" value="${esc(state.search)}"><button class="btn btn-dark" id="newBrand">+ Nova marca</button></div>
      ${adminBrandTable(rows)}`;
    $('#brandSearch').addEventListener('input',e=>{state.search=e.target.value;viewAdminBrands();$('#brandSearch')?.focus();});
    $('#newBrand').addEventListener('click',openNewBrand);
    bindBrandRows();
  }

  function openNewBrand(){
    openModal(`${modalHead('Cadastrar nova marca','CADASTRO + CONTRATO AUTOMÁTICO')}<form id="newBrandForm" class="form-grid">
      <div class="field full"><div class="note"><strong>Contrato automático:</strong> ao salvar este cadastro, o portal já gera o PDF do contrato com os dados da marca e as condições comerciais abaixo.</div></div>
      <div class="field"><label>Nome da marca<input name="name" required></label></div><div class="field"><label>Segmento<select name="segment">${state.admin.structures.map(s=>`<option>${esc(s)}</option>`).join('')}</select></label></div>
      <div class="field"><label>Razão social / nome empresarial<input name="legal_name" required></label></div><div class="field"><label>CNPJ<input name="cnpj" required></label></div>
      <div class="field full"><label>Endereço / sede<input name="address" required placeholder="Rua, número, complemento, bairro, cidade/UF"></label></div>
      <div class="field"><label>Representante no contrato<input name="representative" required></label></div><div class="field"><label>Responsável / contato<input name="contact_name" required></label></div>
      <div class="field"><label>E-mail da marca<input name="contact_email" type="email" required></label></div><div class="field"><label>Telefone<input name="phone"></label></div>
      <div class="field"><label>E-mail de login<input name="login_email" type="email" required></label></div><div class="field"><label>Senha inicial<div class="password-wrap"><input id="newBrandPassword" name="password" type="password" minlength="8" required value="Marca@2026"><button type="button" class="password-toggle" data-password-toggle="newBrandPassword">Ver</button></div></label><small>Senha temporária: a marca será obrigada a alterá-la no primeiro acesso.</small></div>
      <div class="field full"><span class="mini-label">CONDIÇÕES COMERCIAIS DO CONTRATO</span></div>
      <div class="field"><label>Data do contrato<input name="contract_date" type="date" value="${todayInput()}" required></label></div><div class="field"><label>Valor total do espaço (R$)<input name="contract_total" inputmode="decimal" placeholder="6500,00" required></label></div>
      <div class="field"><label>Quantidade de parcelas<select name="installment_count" required>${installmentCountOptions(1)}</select></label><small>Escolha de 1 a 10 parcelas. Os campos serão abertos automaticamente.</small></div><div class="field"><label>Forma de pagamento<select name="payment_method" required>${paymentMethodOptions('boleto')}</select></label><small>PIX, boleto bancário ou link de pagamento.</small></div>
      <div id="newBrandInstallments" class="field full" style="display:contents">${installmentFieldsHtml([],1)}</div>
      <div class="field full"><small>A soma dos valores de todas as parcelas deve ser exatamente igual ao valor total do contrato.</small></div>
      <div class="field full"><button class="btn btn-dark" type="submit">Cadastrar marca e gerar contrato</button></div>
    </form>`);
    bindInstallmentCount($('#newBrandForm'));
    $('#newBrandForm').addEventListener('submit',async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.target).entries());try{const created=await api('/api/admin/brands',{method:'POST',body});closeModal();toast('Marca cadastrada e contrato gerado automaticamente.');await loadAdminBrand(created.id);state.adminTab='contract';viewAdminBrand();}catch(err){showError(err)}});
  }

  function viewAdminPending(){
    const rows=state.admin.brands.filter(b=>b.pending_docs||b.open_bills||b.unread_messages).sort((a,b)=>(b.pending_docs+b.open_bills+b.unread_messages)-(a.pending_docs+a.open_bills+a.unread_messages));
    content.innerHTML=`${pageHead('CONTROLE OPERACIONAL','Pendências <em>por marca.</em>','Priorize documentação, financeiro e mensagens que ainda precisam de ação.',String(rows.length),'COM PENDÊNCIAS')}${adminBrandTable(rows)}`;bindBrandRows();
  }

  function viewAdminBrand(){
    const d=state.brandDetail,b=d.brand;
    content.innerHTML=`${pageHead('GESTÃO DA MARCA',esc(b.name),'Tudo o que for cadastrado aqui aparecerá somente no login desta marca.',b.segment||'—','SEGMENTO')}
      <div class="admin-tabs">${[['summary','Resumo'],['profile','Cadastro'],['contract','Contrato'],['bills','Boletos'],['structure','Estrutura'],['docs','Documentos'],['messages','Mensagens']].map(([id,l])=>`<button class="admin-tab ${state.adminTab===id?'active':''}" data-tab="${id}">${l}</button>`).join('')}</div>
      <div id="adminPanel" class="admin-panel"></div>`;
    $$('[data-tab]',content).forEach(x=>x.addEventListener('click',()=>{state.adminTab=x.dataset.tab;$$('[data-tab]',content).forEach(t=>t.classList.toggle('active',t.dataset.tab===state.adminTab));renderAdminTab();}));
    renderAdminTab();
  }
  function renderAdminTab(){
    const f={summary:renderAdminSummary,profile:renderAdminProfile,contract:renderAdminContract,bills:renderAdminBills,structure:renderAdminStructure,docs:renderAdminDocs,messages:renderAdminMessages}[state.adminTab]||renderAdminSummary;f();
  }
  function adminPanel(){return $('#adminPanel');}

  function renderAdminSummary(){
    const d=state.brandDetail,b=d.brand,p=percentDone(d.requirements),open=d.bills.filter(x=>!['paid','cancelled'].includes(x.status));
    adminPanel().innerHTML=`<div class="metric-grid"><div class="metric"><div class="num">${p}%</div><div class="label">Documentação aprovada</div></div><div class="metric ${open.length?'attention':''}"><div class="num">${open.length}</div><div class="label">Boletos em aberto</div></div><div class="metric blue"><div class="num">${d.messages.filter(m=>m.sender_role==='brand'&&!m.read_by_admin).length}</div><div class="label">Mensagens não lidas</div></div><div class="metric"><div class="num">${statusLabel(d.contract?.status||'pending')}</div><div class="label">Contrato</div></div></div>
      <div class="two-col"><div class="card"><span class="label">LOGIN DA MARCA</span><h3>${esc(d.login?.email||'—')}</h3><p>Responsável: ${esc(d.login?.name||b.contact_name||'—')}</p><button class="btn btn-small" data-jumptab="profile">Editar cadastro</button></div><div class="card"><span class="label">ESTRUTURA</span><h3>${esc(b.segment||'—')}</h3><p>${esc(b.structure?.note||'')}</p><button class="btn btn-small" data-jumptab="structure">Editar estrutura</button></div></div>`;
    $$('[data-jumptab]',adminPanel()).forEach(b=>b.addEventListener('click',()=>{state.adminTab=b.dataset.jumptab;viewAdminBrand()}));
  }

  function renderAdminProfile(){
    const d=state.brandDetail,b=d.brand;
    adminPanel().innerHTML=`<form id="profileForm" class="form-grid"><div class="field"><label>Nome da marca<input name="name" value="${esc(b.name)}" required></label></div><div class="field"><label>Segmento<select name="segment">${Object.keys(d.structures).map(s=>`<option ${s===b.segment?'selected':''}>${esc(s)}</option>`).join('')}</select></label></div><div class="field"><label>Razão social<input name="legal_name" value="${esc(b.legal_name)}"></label></div><div class="field"><label>CNPJ<input name="cnpj" value="${esc(b.cnpj)}"></label></div><div class="field full"><label>Endereço / sede<input name="address" value="${esc(b.address||'')}"></label></div><div class="field"><label>Representante no contrato<input name="representative" value="${esc(b.representative||b.contact_name||'')}"></label></div><div class="field"><label>Responsável / contato<input name="contact_name" value="${esc(b.contact_name)}"></label></div><div class="field"><label>E-mail de contato<input name="contact_email" type="email" value="${esc(b.contact_email)}"></label></div><div class="field"><label>Telefone<input name="phone" value="${esc(b.phone)}"></label></div><div class="field"><label>E-mail de login<input name="login_email" type="email" value="${esc(d.login?.email||'')}"></label></div><div class="field"><label>Status<select name="status"><option value="active" ${b.status==='active'?'selected':''}>Ativo</option><option value="inactive" ${b.status==='inactive'?'selected':''}>Inativo</option></select></label></div><div class="field"><label>Nova senha temporária<div class="password-wrap"><input id="adminTempPassword" name="new_password" type="password" minlength="8" placeholder="Deixe em branco para manter"><button type="button" class="password-toggle" data-password-toggle="adminTempPassword">Ver</button></div></label><small>Ao definir uma nova senha aqui, a marca deverá alterá-la no próximo acesso.</small></div><div class="field full"><div class="inline-actions"><button class="btn btn-dark" type="submit">Salvar cadastro</button><button class="btn btn-danger" type="button" id="deleteBrand">Excluir marca</button></div></div></form>`;
    bindPasswordToggles(adminPanel());
    $('#deleteBrand').addEventListener('click',async()=>{if(!confirm(`Excluir definitivamente ${b.name}? Contratos, boletos, documentos e mensagens desta marca também serão removidos.`))return;try{await api(`/api/admin/brand/${b.id}`,{method:'DELETE',body:{}});toast('Marca excluída.');state.brandDetail=null;await navigate('admin-brands');}catch(err){showError(err)}});
    $('#profileForm').addEventListener('submit',async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.target).entries());if(!body.new_password)delete body.new_password;try{await api(`/api/admin/brand/${b.id}`,{method:'PATCH',body});toast('Cadastro atualizado.');await loadAdminBrand(b.id);renderAdminProfile();}catch(err){showError(err)}});
  }

  function renderAdminContract(){
    const d=state.brandDetail,c=d.contract||{},b=d.brand,t=c.terms||{};
    const generated=c.generated_file||c.file;
    const signed=c.signed_file;
    const inst=Array.isArray(t.installments)?t.installments:[];
    const usedCount=Math.max(1,Math.min(MAX_CONTRACT_INSTALLMENTS,Number(t.installment_count)||inst.filter(x=>x?.due_date||Number(x?.amount_cents||0)>0).length||1));
    while(inst.length<MAX_CONTRACT_INSTALLMENTS)inst.push({due_date:'',amount_cents:0});
    const recipient=b.contact_email || d.login?.email || '';
    const emailCfg=d.email_config||{configured:false,provider:'none'};
    const emailProvider=emailCfg.provider==='resend'?'Resend (HTTPS)':emailCfg.provider==='smtp'?'SMTP':'Não configurado';
    const sentInfo=c.email_status==='sent' ? `Enviado em ${fmtDateTime(c.emailed_at)} para ${esc(c.emailed_to||recipient)}${c.email_provider?` · ${esc(c.email_provider)}`:''}` : c.email_status==='error' ? `Falha no último envio: ${esc(c.email_error||'verifique a configuração de e-mail')}` : 'Ainda não houve envio registrado.';
    adminPanel().innerHTML=`
      <div class="two-col">
        <div class="card"><span class="label">CONTRATO PARA ASSINATURA</span><h3>${generated?esc(generated.original_name):'Ainda não gerado'}</h3><p>${generated?`Gerado automaticamente${c.generated_at?` em ${fmtDateTime(c.generated_at)}`:''}.`:'Preencha os dados ao lado e gere o contrato.'}</p>${generated?`<button class="btn btn-dark btn-small" id="adminOpenGenerated">Abrir contrato gerado</button>`:''}<div class="note" style="margin-top:14px">Este é o PDF que deve ser conferido e enviado para assinatura digital.</div></div>
        <div class="card"><span class="label">CONTRATO ASSINADO</span><h3 class="signed-contract-title">Nenhuma via assinada salva</h3><p>${signed?`Assinatura registrada em ${fmtDate(c.signed_at)}.`:'Depois que a assinatura for concluída na Contraktor, salve aqui o PDF assinado.'}</p>${signed?`<button class="btn btn-dark btn-small" id="adminOpenSigned">Abrir contrato assinado</button>`:''}<form id="signedContractForm" class="form-grid" style="margin-top:16px"><div class="field full"><label>PDF assinado<input type="file" id="signedContractFile" accept="application/pdf" required></label></div><div class="field full"><label>Data da assinatura<input type="date" name="signed_at" value="${esc(c.signed_at?.slice(0,10)||todayInput())}"></label></div><div class="field full"><button class="btn btn-dark" type="submit">Salvar contrato assinado</button></div></form></div>
      </div>
      <div class="section-title"><h2>Gerar / atualizar contrato</h2><p>O PDF é montado automaticamente a partir dos dados abaixo e do modelo oficial do Carandaí 25.</p></div>
      <div class="card"><form id="generateContractForm" class="form-grid">
        <div class="field"><label>Razão social / nome empresarial<input name="legal_name" value="${esc(b.legal_name||'')}" required></label></div><div class="field"><label>CNPJ<input name="cnpj" value="${esc(b.cnpj||'')}" required></label></div>
        <div class="field full"><label>Endereço / sede<input name="address" value="${esc(b.address||'')}" required></label></div><div class="field full"><label>Representante no contrato<input name="representative" value="${esc(b.representative||b.contact_name||'')}" required></label></div>
        <div class="field"><label>Data do contrato<input name="contract_date" type="date" value="${esc(t.contract_date||todayInput())}" required></label></div><div class="field"><label>Valor total do espaço (R$)<input name="contract_total" inputmode="decimal" value="${t.total_cents?moneyInput(t.total_cents):''}" required></label></div>
        <div class="field"><label>Quantidade de parcelas<select name="installment_count" required>${installmentCountOptions(usedCount)}</select></label><small>Escolha de 1 a 10 parcelas. Os campos serão abertos automaticamente.</small></div><div class="field"><label>Forma de pagamento<select name="payment_method" required>${paymentMethodOptions(t.payment_method||'boleto')}</select></label><small>PIX, boleto bancário ou link de pagamento.</small></div>
        <div id="contractInstallments" class="field full" style="display:contents">${installmentFieldsHtml(inst,usedCount)}</div>
        <div class="field full"><small>A soma das parcelas deve ser igual ao valor total. Ao gerar novamente, o PDF anterior para assinatura é substituído; o PDF assinado, se já salvo, é mantido separado.</small></div>
        <div class="field full"><button class="btn btn-dark" type="submit">Gerar / atualizar contrato automático</button></div>
      </form></div>
      <div class="section-title"><h2>Enviar contrato por e-mail</h2><p>O PDF gerado acima é anexado ao e-mail da marca.</p></div>
      <div class="card"><div class="card-row"><div><span class="label">SERVIÇO DE E-MAIL</span><h3>${esc(emailProvider)}</h3><p>${emailCfg.configured?`Remetente: ${esc(emailCfg.from||'configurado no Railway')}`:esc(emailCfg.hint||'Configure o serviço de e-mail no Railway.')}</p></div>${status(emailCfg.configured?'active':'pending')}</div>
        <div class="note" style="margin-top:14px">${sentInfo}</div>
        ${c.email_message_id?`<p style="font-size:11px;color:var(--muted);margin-top:8px">ID do envio: ${esc(c.email_message_id)}</p>`:''}
        <div style="margin-top:16px"><label class="mini-label" for="contractEmailTo">E-MAIL CADASTRADO DA MARCA</label><input class="search" id="contractEmailTo" type="email" value="${esc(recipient)}" style="width:100%;margin:7px 0 10px"><div class="note" style="margin:10px 0"><strong>Acesso ao portal:</strong> ${esc(d.login?.email||'sem login cadastrado')} · ${d.login?.has_temporary_password?'senha temporária disponível para incluir no e-mail':d.login?.must_change_password?'senha temporária pendente, mas não recuperável; redefina em Cadastro':'sem senha temporária disponível; a marca usa a senha pessoal já definida'}</div><div class="inline-actions"><button class="btn btn-dark" id="sendContractEmail" ${!generated?'disabled':''}>Enviar contrato por e-mail</button><button class="btn" id="testContractEmail">Testar e-mail</button></div><p style="font-size:11px;color:var(--muted);margin-top:10px">O e-mail apresenta o novo Portal da Marca, inclui login e senha temporária quando disponível, explica que a troca de senha será obrigatória no primeiro acesso e informa sobre a assinatura digital via Contraktor.</p></div>
      </div>`;
    bindInstallmentCount($('#generateContractForm'));
    $('#adminOpenGenerated')?.addEventListener('click',()=>openFile(generated?.id));
    $('#adminOpenSigned')?.addEventListener('click',()=>openFile(signed?.id));
    $('#generateContractForm').addEventListener('submit',async e=>{e.preventDefault();try{const body=Object.fromEntries(new FormData(e.target).entries());await api(`/api/admin/brand/${b.id}/contract/generate`,{method:'POST',body});toast('Contrato gerado e salvo automaticamente.');await loadAdminBrand(b.id);renderAdminContract();}catch(err){showError(err)}});
    $('#signedContractForm').addEventListener('submit',async e=>{e.preventDefault();try{const f=$('#signedContractFile').files[0];if(!f)return toast('Selecione o PDF assinado.');const file=await fileData(f);const signed_at=new FormData(e.target).get('signed_at');await api(`/api/admin/brand/${b.id}/contract/signed`,{method:'POST',body:{file,signed_at}});toast('Contrato assinado salvo separadamente.');await loadAdminBrand(b.id);renderAdminContract();}catch(err){showError(err)}});
    $('#sendContractEmail')?.addEventListener('click',async()=>{const to=$('#contractEmailTo').value.trim();if(!to)return toast('Informe o e-mail cadastrado da marca.');if(!confirm(`Enviar o contrato de ${b.name} para ${to}?`))return;try{const r=await api(`/api/admin/brand/${b.id}/contract/email`,{method:'POST',body:{to}});toast(`Contrato enviado para ${r.to}.`);await loadAdminBrand(b.id);renderAdminContract();}catch(err){await loadAdminBrand(b.id).catch(()=>{});renderAdminContract();showError(err)}});
    $('#testContractEmail')?.addEventListener('click',async()=>{const to=$('#contractEmailTo').value.trim();if(!to)return toast('Informe o e-mail cadastrado da marca.');try{const r=await api('/api/admin/email/test',{method:'POST',body:{to}});toast(`E-mail de teste enviado via ${r.provider||'serviço configurado'}.`);}catch(err){showError(err)}});
  }

  function renderAdminBills(){
    const d=state.brandDetail,b=d.brand;
    adminPanel().innerHTML=`<div class="admin-toolbar"><div><span class="mini-label">COBRANÇAS DA MARCA</span></div><button class="btn btn-dark btn-small" id="addBill">+ Adicionar boleto</button></div>${d.bills.length?d.bills.map(x=>`<div class="bill-row"><div class="bill-main"><strong>${esc(x.label)}</strong><span>Parcela ${x.installment} · ${fmtDate(x.due_date)}${x.file?` · ${esc(x.file.original_name)}`:''}</span><div class="inline-actions" style="margin-top:8px">${x.file?`<button class="btn btn-small" data-file="${x.file.id}">Abrir PDF</button>`:''}<button class="btn btn-small btn-soft" data-editbill="${x.id}">Editar</button><button class="btn btn-small btn-danger" data-delbill="${x.id}">Excluir</button></div></div><div class="bill-side"><div class="price">${fmtMoney(x.amount_cents)}</div>${status(x.status)}</div></div>`).join(''):`<div class="empty"><strong>Nenhum boleto.</strong>Cadastre a primeira cobrança da marca.</div>`}`;
    $('#addBill').addEventListener('click',()=>openBillModal());
    $$('[data-file]',adminPanel()).forEach(x=>x.addEventListener('click',()=>openFile(x.dataset.file)));
    $$('[data-editbill]',adminPanel()).forEach(x=>x.addEventListener('click',()=>openBillModal(d.bills.find(b=>b.id===x.dataset.editbill))));
    $$('[data-delbill]',adminPanel()).forEach(x=>x.addEventListener('click',async()=>{if(!confirm('Excluir este boleto?'))return;try{await api(`/api/admin/bill/${x.dataset.delbill}`,{method:'DELETE',body:{}});toast('Boleto excluído.');await loadAdminBrand(b.id);renderAdminBills();}catch(err){showError(err)}}));
  }
  function openBillModal(bill=null){
    const b=state.brandDetail.brand;
    openModal(`${modalHead(bill?'Editar boleto':'Adicionar boleto','FINANCEIRO')}<form id="billForm" class="form-grid"><div class="field"><label>Parcela<input name="installment" type="number" min="1" value="${bill?.installment||1}"></label></div><div class="field"><label>Status<select name="status">${['pending','paid','overdue','cancelled'].map(s=>`<option value="${s}" ${bill?.status===s?'selected':''}>${statusLabel(s)}</option>`).join('')}</select></label></div><div class="field full"><label>Descrição<input name="label" value="${esc(bill?.label||'Parcela · Espaço Jockey Club')}" required></label></div><div class="field"><label>Valor (R$)<input name="amount" type="number" min="0" step="0.01" value="${bill?((bill.amount_cents||0)/100).toFixed(2):''}" required></label></div><div class="field"><label>Vencimento<input name="due_date" type="date" value="${esc(bill?.due_date||'')}"></label></div><div class="field full"><label>PDF do boleto<input id="billFile" type="file" accept="application/pdf"></label><small>${bill?.file?'Se não escolher outro PDF, o atual é mantido.':'Opcional: pode cadastrar os dados agora e anexar o PDF depois.'}</small></div><div class="field full"><button class="btn btn-dark" type="submit">Salvar boleto</button></div></form>`);
    $('#billForm').addEventListener('submit',async e=>{e.preventDefault();try{const body=Object.fromEntries(new FormData(e.target).entries());const f=$('#billFile').files[0];if(f)body.file=await fileData(f);const url=bill?`/api/admin/bill/${bill.id}`:`/api/admin/brand/${b.id}/bills`;await api(url,{method:bill?'PATCH':'POST',body});closeModal();toast('Boleto salvo.');await loadAdminBrand(b.id);renderAdminBills();}catch(err){showError(err)}});
  }

  function renderAdminStructure(){
    const d=state.brandDetail,b=d.brand,s=b.structure||{};
    const items=(s.items||[]).join('\n'), resp=(s.brandResponsibility||[]).join('\n');
    const image=s.image||d.structures?.[b.segment]?.image||'';
    adminPanel().innerHTML=`<div class="two-col"><div class="card"><span class="label">ESTRUTURA PUBLICADA</span><h3>${esc(s.title||b.segment)}</h3>${image?`<div class="admin-structure-preview"><img src="${esc(image)}" alt="Estrutura ${esc(b.segment||'da marca')}"></div>`:''}<div class="rule-list">${(s.items||[]).map(i=>`<div class="rule-row"><div><div class="title">${esc(i)}</div></div></div>`).join('')||'<p>Sem itens cadastrados.</p>'}</div>${(s.brandResponsibility||[]).length?`<p><strong>Responsabilidade da marca:</strong><br>${(s.brandResponsibility||[]).map(esc).join('<br>')}</p>`:''}<p>${esc(s.note||'')}</p></div><div class="card"><span class="label">EDITAR O QUE A MARCA VÊ</span><form id="structureForm" class="form-grid"><div class="field full"><label>Segmento / modelo<select name="segment" id="structureSegment">${Object.keys(d.structures).map(x=>`<option ${x===b.segment?'selected':''}>${esc(x)}</option>`).join('')}</select></label><small>Ao trocar o segmento, o portal carrega automaticamente a estrutura e a imagem oficial correspondente do manual. Depois você pode personalizar os textos.</small></div><div class="field full"><label>Título<input name="title" id="structureTitle" value="${esc(s.title||'')}"></label></div><div class="field full"><label>Itens fornecidos<textarea name="items" id="structureItems">${esc(items)}</textarea></label><small>Um item por linha.</small></div><div class="field full"><label>Responsabilidades da marca<textarea name="responsibility" id="structureResponsibility">${esc(resp)}</textarea></label><small>Uma responsabilidade por linha.</small></div><div class="field full"><label>Observação<textarea name="note" id="structureNote">${esc(s.note||'')}</textarea></label></div><div class="field full"><button class="btn btn-dark" type="submit">Salvar estrutura da marca</button></div></form></div></div>`;
    $('#structureSegment').addEventListener('change',e=>{const t=d.structures[e.target.value];if(!t)return;$('#structureTitle').value=t.title||'';$('#structureItems').value=(t.items||[]).join('\n');$('#structureResponsibility').value=(t.brandResponsibility||[]).join('\n');$('#structureNote').value=t.note||'';const prev=$('.admin-structure-preview img',adminPanel());if(prev&&t.image)prev.src=t.image;});
    $('#structureForm').addEventListener('submit',async e=>{e.preventDefault();try{const fd=new FormData(e.target);const segment=fd.get('segment');const template=d.structures?.[segment]||{};const structure={image:template.image||s.image||'',title:String(fd.get('title')||'').trim(),items:String(fd.get('items')||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean),brandResponsibility:String(fd.get('responsibility')||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean),note:String(fd.get('note')||'').trim()};await api(`/api/admin/brand/${b.id}`,{method:'PATCH',body:{segment,structure}});toast('Estrutura e imagem atualizadas.');await loadAdminBrand(b.id);renderAdminStructure();}catch(err){showError(err)}});
  }

  function renderAdminDocs(){
    const d=state.brandDetail,b=d.brand;
    adminPanel().innerHTML=`<div class="admin-toolbar"><span class="mini-label">DOCUMENTOS DA MARCA</span><button class="btn btn-dark btn-small" id="addReq">+ Nova exigência</button></div>${d.requirements.map(r=>`<div class="doc-row"><div class="doc-main"><strong>${esc(r.label)}</strong><span>Prazo ${fmtDate(r.due_date)}${r.notes?` · ${esc(r.notes)}`:''}</span>${r.file?`<div class="file-box">▱ ${esc(r.file.original_name)} <button class="link-button" data-file="${r.file.id}">abrir</button></div>`:''}</div><div class="inline-actions"><select class="req-status" data-req="${r.id}"><option value="pending" ${r.status==='pending'?'selected':''}>Pendente</option><option value="received" ${r.status==='received'?'selected':''}>Recebido</option><option value="approved" ${r.status==='approved'?'selected':''}>Aprovado</option><option value="rejected" ${r.status==='rejected'?'selected':''}>Reprovado</option><option value="done" ${r.status==='done'?'selected':''}>Concluído</option></select>${status(r.status)}</div></div>`).join('')}`;
    $$('[data-file]',adminPanel()).forEach(x=>x.addEventListener('click',()=>openFile(x.dataset.file)));
    $$('.req-status',adminPanel()).forEach(s=>s.addEventListener('change',async()=>{try{await api(`/api/admin/requirement/${s.dataset.req}`,{method:'PATCH',body:{status:s.value}});toast('Status atualizado.');await loadAdminBrand(b.id);renderAdminDocs();}catch(err){showError(err)}}));
    $('#addReq').addEventListener('click',()=>{openModal(`${modalHead('Nova exigência','DOCUMENTOS')}<form id="reqForm" class="form-grid"><div class="field full"><label>Documento / item<input name="label" required></label></div><div class="field"><label>Prazo<input name="due_date" type="date"></label></div><div class="field full"><label>Observação<textarea name="notes"></textarea></label></div><div class="field full"><button class="btn btn-dark" type="submit">Adicionar ao checklist</button></div></form>`);$('#reqForm').addEventListener('submit',async e=>{e.preventDefault();try{await api(`/api/admin/brand/${b.id}/requirements`,{method:'POST',body:Object.fromEntries(new FormData(e.target).entries())});closeModal();toast('Exigência adicionada.');await loadAdminBrand(b.id);renderAdminDocs();}catch(err){showError(err)}});});
  }

  function renderAdminMessages(){
    const d=state.brandDetail,sector=state.selectedSector||'Logística';adminPanel().innerHTML=messageLayout(sector,d.messages.filter(m=>m.sector===sector),'admin');bindMessageUI('admin');
  }

  if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));}
  boot();
})();
