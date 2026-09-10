'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const STORAGE_ROOT = process.env.STORAGE_ROOT || process.env.RAILWAY_VOLUME_MOUNT_PATH || ROOT;
const DATA = path.join(STORAGE_ROOT, 'data');
const UPLOADS = path.join(STORAGE_ROOT, 'uploads');
const DB_PATH = path.join(DATA, 'portal.db');
const PORT = Number(process.env.PORT || 3000);

if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_PASSWORD) {
  console.error('ERRO: defina ADMIN_PASSWORD no ambiente de producao antes de iniciar.');
  process.exit(1);
}
const SESSION_DAYS = 7;
const MAX_BODY = 20 * 1024 * 1024;

fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(UPLOADS, { recursive: true });

if (process.argv.includes('--reset-demo')) {
  try { fs.rmSync(DB_PATH, { force: true }); } catch {}
  console.log('Banco demo removido. Execute novamente npm start.');
  process.exit(0);
}

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');

function nowISO(){ return new Date().toISOString(); }
function addDaysISO(days){ return new Date(Date.now()+days*86400000).toISOString(); }
function uid(){ return crypto.randomUUID(); }
function normalizeEmail(v){ return String(v||'').trim().toLowerCase(); }
function text(v){ return String(v ?? '').trim(); }
function safeJson(v, fallback){ try { return JSON.parse(v); } catch { return fallback; } }
function moneyBR(cents){ return Number(cents||0); }

function passwordHash(password){
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function passwordVerify(password, packed){
  try {
    const [salt, hex] = String(packed).split(':');
    const a = Buffer.from(hex, 'hex');
    const b = crypto.scryptSync(String(password), salt, 64);
    return a.length === b.length && crypto.timingSafeEqual(a,b);
  } catch { return false; }
}
function sha256(s){ return crypto.createHash('sha256').update(s).digest('hex'); }

// ============================================================================
// EMAIL - Envio de e-mail (estrutura pronta para Nodemailer/SMTP)
// ============================================================================
// Variáveis de ambiente necessárias para produção:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL, SMTP_FROM_NAME
//
// Para habilitar o envio real, instale 'nodemailer' (npm i nodemailer) e
// descomente o bloco de transporte abaixo.
async function sendEmail(to, subject, htmlBody){
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const fromEmail = process.env.SMTP_FROM_EMAIL || 'carandai25comercial@gmail.com';
  const fromName = process.env.SMTP_FROM_NAME || 'Carandaí 25';

  if(!smtpHost || !smtpUser || !smtpPass){
    console.log('----------------------------------------------------------------');
    console.log('[sendEmail] SMTP não configurado. Simulando envio de e-mail:');
    console.log(`  De: ${fromName} <${fromEmail}>`);
    console.log(`  Para: ${to}`);
    console.log(`  Assunto: ${subject}`);
    console.log(`  Corpo (HTML) length: ${String(htmlBody||'').length} caracteres`);
    console.log('----------------------------------------------------------------');
    return { ok:true, simulated:true };
  }

  try{
    // Implementação real com Nodemailer (descomentar após "npm i nodemailer"):
    //
    // const nodemailer = require('nodemailer');
    // const transporter = nodemailer.createTransport({
    //   host: smtpHost,
    //   port: Number(smtpPort||587),
    //   secure: Number(smtpPort)===465,
    //   auth: { user: smtpUser, pass: smtpPass }
    // });
    // const info = await transporter.sendMail({
    //   from: `"${fromName}" <${fromEmail}>`,
    //   to,
    //   subject,
    //   html: htmlBody
    // });
    // console.log(`[sendEmail] E-mail enviado: ${info.messageId}`);
    // return { ok:true, messageId: info.messageId };

    console.log(`[sendEmail] Configuração SMTP detectada, mas Nodemailer não está instalado. Envio não realizado para: ${to}`);
    return { ok:false, error:'Nodemailer não configurado' };
  }catch(err){
    console.error('[sendEmail] Erro ao enviar e-mail:', err);
    return { ok:false, error:err.message };
  }
}

// Substitui as variáveis do template de contrato pelos dados reais da marca
function formatContractEmail(brand, structure){
  let template;
  try{
    template = fs.readFileSync(path.join(ROOT,'email-templates','contrato-template.html'),'utf8');
  }catch(err){
    console.error('[formatContractEmail] Não foi possível ler o template:', err);
    template = '<p>Contrato de participação - {{BRAND_NAME}}</p>';
  }

  const structureDescription = describeStructureForEmail(structure);

  return template
    .replace(/{{BRAND_NAME}}/g, brand.name || 'Marca')
    .replace(/{{BRAND_CONTACT}}/g, brand.contact_name || brand.name || 'Contato')
    .replace(/{{BRAND_LEGAL_NAME}}/g, brand.legal_name || '—')
    .replace(/{{BRAND_CNPJ}}/g, brand.cnpj || '—')
    .replace(/{{BRAND_SEGMENT}}/g, brand.segment || 'Moda')
    .replace(/{{BRAND_CONTACT_EMAIL}}/g, brand.contact_email || brand.login_email || '—')
    .replace(/{{STRUCTURE_DESCRIPTION}}/g, structureDescription)
    .replace(/{{DATE}}/g, new Date().toLocaleDateString('pt-BR'));
}

function describeStructureForEmail(structure){
  if(!structure) return 'Estrutura conforme segmento contratado.';
  const title = structure.title || 'Estrutura contratada';
  const items = Array.isArray(structure.items) && structure.items.length
    ? `<ul style="margin-left:20px;">${structure.items.map(i=>`<li>${i}</li>`).join('')}</ul>`
    : '';
  const note = structure.note ? `<p style="margin-top:8px;color:#666;font-size:13px;">${structure.note}</p>` : '';
  return `<strong>${title}</strong>${items}${note}`;
}

function initSchema(){
  db.exec(`
    CREATE TABLE IF NOT EXISTS brands (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      legal_name TEXT DEFAULT '',
      cnpj TEXT DEFAULT '',
      segment TEXT DEFAULT '',
      contact_name TEXT DEFAULT '',
      contact_email TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      structure_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      brand_id TEXT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','brand')),
      created_at TEXT NOT NULL,
      FOREIGN KEY(brand_id) REFERENCES brands(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      csrf TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      brand_id TEXT,
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime TEXT DEFAULT 'application/octet-stream',
      created_at TEXT NOT NULL,
      FOREIGN KEY(brand_id) REFERENCES brands(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS contracts (
      id TEXT PRIMARY KEY,
      brand_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      file_id TEXT,
      signed_at TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(brand_id) REFERENCES brands(id) ON DELETE CASCADE,
      FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS bills (
      id TEXT PRIMARY KEY,
      brand_id TEXT NOT NULL,
      installment INTEGER DEFAULT 1,
      label TEXT NOT NULL,
      amount_cents INTEGER NOT NULL DEFAULT 0,
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      file_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(brand_id) REFERENCES brands(id) ON DELETE CASCADE,
      FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS requirements (
      id TEXT PRIMARY KEY,
      brand_id TEXT NOT NULL,
      code TEXT NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      due_date TEXT,
      file_id TEXT,
      notes TEXT DEFAULT '',
      updated_at TEXT NOT NULL,
      UNIQUE(brand_id, code),
      FOREIGN KEY(brand_id) REFERENCES brands(id) ON DELETE CASCADE,
      FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      brand_id TEXT NOT NULL,
      sector TEXT NOT NULL,
      sender_role TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      read_by_brand INTEGER NOT NULL DEFAULT 0,
      read_by_admin INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(brand_id) REFERENCES brands(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      brand_id TEXT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      priority TEXT DEFAULT 'normal',
      created_at TEXT NOT NULL,
      FOREIGN KEY(brand_id) REFERENCES brands(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_bills_brand ON bills(brand_id);
    CREATE INDEX IF NOT EXISTS idx_req_brand ON requirements(brand_id);
    CREATE INDEX IF NOT EXISTS idx_msg_brand ON messages(brand_id);
  `);
}

const STRUCTURES = {
  'Moda': {
    image:'/assets/estruturas/estrutura-moda.png?v=2',
    title:'Estrutura contratada · Moda',
    items:['Arara: 1,80 m de altura','1,70 m de comprimento','0,30 m de largura','1 cadeira'],
    brandResponsibility:['Levar os próprios cabides'],
    note:'A disposição final poderá variar conforme o mix e o layout geral do evento.'
  },
  'Bem-Estar / Decoração': {
    image:'/assets/estruturas/estrutura-bem-estar-decoracao.png?v=2',
    title:'Estrutura contratada · Bem-Estar / Decoração',
    items:['Estante: 2,00 m de altura','1,50 m de comprimento','0,50 m de largura','5 prateleiras de 0,35 m','Aparador conforme contratação','1 cadeira'],
    brandResponsibility:[],
    note:'A posição final da marca é informada pela produção no momento da montagem. Atenção: na página 8 do manual, o texto informa 0,45 m de altura para o aparador, enquanto o desenho indica 0,80 m; confirme a medida final com a Logística.'
  },
  'Bolsas e Sapatos': {
    image:'/assets/estruturas/estrutura-bolsas-sapatos.png?v=2',
    title:'Estrutura contratada · Bolsas e Sapatos',
    items:['Estante: 1,80 m de altura','2,30 m de comprimento','0,30 m de largura','5 prateleiras de 0,35 m','1 cadeira'],
    brandResponsibility:[],
    note:'Organize o mix exposto para manter circulação, visibilidade da marca e reposição rápida.'
  },
  'Acessórios': {
    image:'/assets/estruturas/estrutura-acessorios.png?v=2',
    title:'Estrutura contratada · Acessórios',
    items:['Mesa: 1,60 m x 0,80 m','1 cadeira'],
    brandResponsibility:['Levar displays e suportes adequados','Levar embalagens próprias para joias e acessórios'],
    note:'Respeite os limites do espaço contratado.'
  }
};

const DEFAULT_REQUIREMENTS = [
  ['sefaz','Autorização de Funcionamento Provisório SEFAZ/RJ','2026-11-03'],
  ['nota_fiscal','Nota fiscal da mercadoria para o evento','2026-11-04'],
  ['placa','Comprovante + grafia da placa da marca','2026-10-28'],
  ['cadastro','Dados cadastrais e contato da equipe no evento','2026-10-20']
];

function createBrand({name, legal_name='', cnpj='', segment='Moda', contact_name='', contact_email='', phone='', login_email, password}){
  const brandId = uid();
  const created = nowISO();
  const structure = STRUCTURES[segment] || {title:`Estrutura contratada · ${segment||'Personalizada'}`,items:[],brandResponsibility:[],note:''};
  db.prepare(`INSERT INTO brands(id,name,legal_name,cnpj,segment,contact_name,contact_email,phone,status,structure_json,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(brandId,name,legal_name,cnpj,segment,contact_name,contact_email,phone,'active',JSON.stringify(structure),created);
  const userId = uid();
  db.prepare(`INSERT INTO users(id,brand_id,name,email,password_hash,role,created_at) VALUES(?,?,?,?,?,?,?)`)
    .run(userId,brandId,contact_name||name,normalizeEmail(login_email||contact_email),passwordHash(password||'Marca@2026'),'brand',created);
  db.prepare(`INSERT INTO contracts(id,brand_id,status,updated_at) VALUES(?,?,?,?)`).run(uid(),brandId,'pending',created);
  const req = db.prepare(`INSERT INTO requirements(id,brand_id,code,label,status,due_date,updated_at) VALUES(?,?,?,?,?,?,?)`);
  for (const [code,label,due] of DEFAULT_REQUIREMENTS) req.run(uid(),brandId,code,label,'pending',due,created);
  return brandId;
}

function seed(){
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count) return;
  const created = nowISO();
  db.prepare(`INSERT INTO users(id,brand_id,name,email,password_hash,role,created_at) VALUES(?,?,?,?,?,?,?)`)
    .run(uid(),null,'Admin Carandaí 25','admin@carandai25.com',passwordHash(process.env.ADMIN_PASSWORD||'Admin@2026'),'admin',created);

  if (process.env.SEED_DEMO === '0') return;

  const demo = createBrand({
    name:'MARCA DEMO · MODA',
    legal_name:'Marca Demo Moda Ltda.',
    cnpj:'00.000.000/0001-00',
    segment:'Moda',
    contact_name:'Equipe da Marca',
    contact_email:'demo@marca.com',
    phone:'(21) 90000-0000',
    login_email:'demo@marca.com',
    password:'Marca@2026'
  });
  const demo2 = createBrand({
    name:'MARCA DEMO · ACESSÓRIOS',
    legal_name:'Marca Demo Acessórios Ltda.',
    cnpj:'11.111.111/0001-11',
    segment:'Acessórios',
    contact_name:'Equipe Acessórios',
    contact_email:'acessorios@demo.com',
    phone:'(21) 91111-1111',
    login_email:'acessorios@demo.com',
    password:'Marca@2026'
  });

  db.prepare(`INSERT INTO bills(id,brand_id,installment,label,amount_cents,due_date,status,created_at) VALUES(?,?,?,?,?,?,?,?)`)
    .run(uid(),demo,1,'1ª parcela · Espaço Jockey Club',250000,'2026-09-20','paid',created);
  db.prepare(`INSERT INTO bills(id,brand_id,installment,label,amount_cents,due_date,status,created_at) VALUES(?,?,?,?,?,?,?,?)`)
    .run(uid(),demo,2,'2ª parcela · Espaço Jockey Club',250000,'2026-10-20','pending',created);
  db.prepare(`INSERT INTO bills(id,brand_id,installment,label,amount_cents,due_date,status,created_at) VALUES(?,?,?,?,?,?,?,?)`)
    .run(uid(),demo2,1,'Parcela única · Espaço Jockey Club',420000,'2026-10-10','pending',created);

  db.prepare(`INSERT INTO messages(id,brand_id,sector,sender_role,sender_name,body,created_at,read_by_brand,read_by_admin) VALUES(?,?,?,?,?,?,?,?,?)`)
    .run(uid(),demo,'Logística','admin','Equipe Carandaí 25','Olá! Sua estrutura contratada para o Rio está cadastrada no portal. Qualquer ajuste pode ser tratado por aqui.',created,0,1);
  db.prepare(`INSERT INTO notifications(id,brand_id,title,body,priority,created_at) VALUES(?,?,?,?,?,?)`)
    .run(uid(),null,'Montagem · Rio de Janeiro','Montagem das marcas em 04/11/2026, das 13h às 19h. Entrada de carga pela Rua Jardim Botânico, 971.','high',created);
  db.prepare(`INSERT INTO notifications(id,brand_id,title,body,priority,created_at) VALUES(?,?,?,?,?,?)`)
    .run(uid(),null,'Evento no Jockey Club','Carandaí 25 · 05 a 08 de novembro de 2026 · 13h às 21h · Tribunas B & C.','normal',created);
}

initSchema();
seed();

const loginAttempts = new Map();
function rateLimit(ip){
  const now=Date.now();
  let x=loginAttempts.get(ip)||{n:0,t:now};
  if(now-x.t>15*60*1000) x={n:0,t:now};
  x.n++; loginAttempts.set(ip,x);
  return x.n<=30;
}

function parseCookies(req){
  const out={};
  const raw=req.headers.cookie||'';
  raw.split(';').forEach(p=>{const i=p.indexOf('=');if(i>0)out[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1).trim());});
  return out;
}
function setSessionCookie(res, token, req){
  const secure = process.env.NODE_ENV==='production' || String(req.headers['x-forwarded-proto']||'').includes('https');
  const parts=[`c25_session=${encodeURIComponent(token)}`,'HttpOnly','Path=/','SameSite=Lax',`Max-Age=${SESSION_DAYS*86400}`];
  if(secure) parts.push('Secure');
  res.setHeader('Set-Cookie',parts.join('; '));
}
function clearSessionCookie(res){ res.setHeader('Set-Cookie','c25_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0'); }
function getSession(req){
  const token=parseCookies(req).c25_session;
  if(!token) return null;
  const row=db.prepare(`SELECT s.id AS session_id,s.csrf,s.expires_at,u.id AS user_id,u.brand_id,u.name,u.email,u.role
    FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?`).get(sha256(token));
  if(!row) return null;
  if(new Date(row.expires_at).getTime()<Date.now()){ db.prepare('DELETE FROM sessions WHERE id=?').run(row.session_id); return null; }
  return row;
}
function requireAuth(req,res,roles){
  const s=getSession(req);
  if(!s){ json(res,401,{error:'Não autenticado'}); return null; }
  if(roles && !roles.includes(s.role)){ json(res,403,{error:'Acesso não autorizado'}); return null; }
  return s;
}
function verifyCsrf(req,res,s,body){
  const token = req.headers['x-csrf-token'] || body?._csrf;
  if(!token || token!==s.csrf){ json(res,403,{error:'Sessão inválida. Atualize a página e tente novamente.'}); return false; }
  return true;
}

function json(res,status,obj){
  const body=JSON.stringify(obj);
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(body),'Cache-Control':'no-store'});
  res.end(body);
}
function readJson(req){
  return new Promise((resolve,reject)=>{
    let total=0; const chunks=[];
    req.on('data',c=>{total+=c.length;if(total>MAX_BODY){reject(Object.assign(new Error('Arquivo ou requisição excede 16 MB'),{status:413}));req.destroy();return;}chunks.push(c)});
    req.on('end',()=>{try{const raw=Buffer.concat(chunks).toString('utf8');resolve(raw?JSON.parse(raw):{});}catch(e){reject(Object.assign(new Error('JSON inválido'),{status:400}))}});
    req.on('error',reject);
  });
}
function mimeByExt(file){
  const ext=path.extname(file).toLowerCase();
  return ({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.pdf':'application/pdf','.txt':'text/plain; charset=utf-8','.ico':'image/x-icon'}[ext]||'application/octet-stream');
}
function sanitizeName(name){
  const base=path.basename(String(name||'arquivo')).replace(/[^a-zA-Z0-9._-]+/g,'_').slice(-100);
  return base||'arquivo';
}
function saveBase64File({brandId,kind,label,file}){
  if(!file?.data || !file?.name) throw Object.assign(new Error('Arquivo não enviado'),{status:400});
  const m=String(file.data).match(/^data:([^;]+);base64,(.+)$/s);
  if(!m) throw Object.assign(new Error('Formato do arquivo inválido'),{status:400});
  const mime=m[1]; const buf=Buffer.from(m[2],'base64');
  if(buf.length>12*1024*1024) throw Object.assign(new Error('Arquivo acima de 12 MB'),{status:413});
  const id=uid();
  const original=sanitizeName(file.name);
  const stored=`${id}-${original}`;
  fs.writeFileSync(path.join(UPLOADS,stored),buf);
  db.prepare(`INSERT INTO files(id,brand_id,kind,label,original_name,stored_name,mime,created_at) VALUES(?,?,?,?,?,?,?,?)`)
    .run(id,brandId,kind,label||original,original,stored,mime,nowISO());
  return id;
}
function removeFileIfUnreferenced(fileId){
  if(!fileId) return;
  const refs = db.prepare(`SELECT
    (SELECT COUNT(*) FROM contracts WHERE file_id=?) +
    (SELECT COUNT(*) FROM bills WHERE file_id=?) +
    (SELECT COUNT(*) FROM requirements WHERE file_id=?) AS n`).get(fileId,fileId,fileId).n;
  if(Number(refs)>0) return;
  const f=db.prepare('SELECT stored_name FROM files WHERE id=?').get(fileId);
  if(f){ try{fs.rmSync(path.join(UPLOADS,f.stored_name),{force:true});}catch{} db.prepare('DELETE FROM files WHERE id=?').run(fileId); }
}
function fileMeta(fileId){ if(!fileId)return null; return db.prepare('SELECT id,label,original_name,mime,created_at FROM files WHERE id=?').get(fileId)||null; }

function brandSnapshot(brandId){
  const brand=db.prepare('SELECT * FROM brands WHERE id=?').get(brandId);
  if(!brand) return null;
  const contract=db.prepare('SELECT * FROM contracts WHERE brand_id=?').get(brandId)||null;
  if(contract) contract.file=fileMeta(contract.file_id);
  const bills=db.prepare('SELECT * FROM bills WHERE brand_id=? ORDER BY installment,due_date').all(brandId).map(x=>({...x,file:fileMeta(x.file_id)}));
  const requirements=db.prepare('SELECT * FROM requirements WHERE brand_id=? ORDER BY due_date,label').all(brandId).map(x=>({...x,file:fileMeta(x.file_id)}));
  const messages=db.prepare('SELECT * FROM messages WHERE brand_id=? ORDER BY created_at ASC').all(brandId);
  const notifications=db.prepare('SELECT * FROM notifications WHERE brand_id IS NULL OR brand_id=? ORDER BY created_at DESC').all(brandId);
  const structure=safeJson(brand.structure_json,{});
  if(!structure.image && STRUCTURES[brand.segment]?.image) structure.image=STRUCTURES[brand.segment].image;
  return {
    brand:{...brand,structure},
    contract,bills,requirements,messages,notifications,
    contacts:{
      Financeiro:'financeiro2@carandai25.com',
      Marketing:'marketing@carandai25.com',
      Comercial:'carandai25comercial@gmail.com',
      Logística:'carandai25financeiro@gmail.com'
    },
    event:{
      name:'Carandaí 25 · Rio de Janeiro',
      venue:'Jockey Club Brasileiro · Tribunas B & C',
      address:'Praça Santos Dumont, 31 · Gávea · Rio de Janeiro',
      dates:'05 a 08 de novembro de 2026',
      hours:'13h às 21h',
      setup:'04/11/2026 · 13h às 19h',
      teardown:'08/11 após 21h até 00h ou 09/11 · 10h às 16h',
      cargo:'Entrada de carga: Rua Jardim Botânico, 971',
      maps:'https://www.google.com/maps/search/?api=1&query=Jockey+Club+Brasileiro+Praça+Santos+Dumont+31+Rio+de+Janeiro'
    }
  };
}

function adminBrandList(){
  const rows=db.prepare(`SELECT b.*,u.email AS login_email,
    (SELECT COUNT(*) FROM requirements r WHERE r.brand_id=b.id AND r.status NOT IN ('approved','done')) AS pending_docs,
    (SELECT COUNT(*) FROM bills bl WHERE bl.brand_id=b.id AND bl.status NOT IN ('paid','cancelled')) AS open_bills,
    (SELECT COUNT(*) FROM messages m WHERE m.brand_id=b.id AND m.sender_role='brand' AND m.read_by_admin=0) AS unread_messages
    FROM brands b LEFT JOIN users u ON u.brand_id=b.id AND u.role='brand' ORDER BY b.name`).all();
  return rows.map(r=>({...r,structure:safeJson(r.structure_json,{})}));
}

async function api(req,res,url){
  const pathname=url.pathname;

  if(pathname==='/api/health' && req.method==='GET'){
    return json(res,200,{ok:true,service:'carandai25-portal',version:'4.4.0',storage:STORAGE_ROOT});
  }

  if(pathname==='/api/login' && req.method==='POST'){
    const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim();
    if(!rateLimit(ip)) return json(res,429,{error:'Muitas tentativas. Aguarde alguns minutos.'});
    const body=await readJson(req);
    const email=normalizeEmail(body.email); const password=String(body.password||'');
    const u=db.prepare('SELECT * FROM users WHERE email=?').get(email);
    if(!u || !passwordVerify(password,u.password_hash)) return json(res,401,{error:'E-mail ou senha inválidos'});
    if(u.role==='brand' && u.brand_id){
      const brandStatus=db.prepare('SELECT status FROM brands WHERE id=?').get(u.brand_id)?.status;
      if(brandStatus!=='active') return json(res,403,{error:'Acesso da marca temporariamente desativado'});
    }
    const token=crypto.randomBytes(32).toString('base64url'); const csrf=crypto.randomBytes(24).toString('base64url');
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(nowISO());
    db.prepare('INSERT INTO sessions(id,user_id,token_hash,csrf,expires_at,created_at) VALUES(?,?,?,?,?,?)')
      .run(uid(),u.id,sha256(token),csrf,addDaysISO(SESSION_DAYS),nowISO());
    setSessionCookie(res,token,req);
    return json(res,200,{ok:true,role:u.role,csrf});
  }

  if(pathname==='/api/logout' && req.method==='POST'){
    const s=getSession(req);
    if(s) db.prepare('DELETE FROM sessions WHERE id=?').run(s.session_id);
    clearSessionCookie(res); return json(res,200,{ok:true});
  }

  if(pathname==='/api/me' && req.method==='GET'){
    const s=requireAuth(req,res); if(!s)return;
    const brand=s.brand_id?db.prepare('SELECT id,name,segment FROM brands WHERE id=?').get(s.brand_id):null;
    return json(res,200,{user:{id:s.user_id,name:s.name,email:s.email,role:s.role,brand_id:s.brand_id},brand,csrf:s.csrf});
  }

  if(pathname==='/api/dashboard' && req.method==='GET'){
    const s=requireAuth(req,res,['brand']); if(!s)return;
    db.prepare(`UPDATE messages SET read_by_brand=1 WHERE brand_id=? AND sender_role='admin'`).run(s.brand_id);
    return json(res,200,brandSnapshot(s.brand_id));
  }

  if(pathname.startsWith('/api/file/') && req.method==='GET'){
    const s=requireAuth(req,res); if(!s)return;
    const id=pathname.split('/').pop();
    const f=db.prepare('SELECT * FROM files WHERE id=?').get(id);
    if(!f) return json(res,404,{error:'Arquivo não encontrado'});
    if(s.role!=='admin' && f.brand_id!==s.brand_id) return json(res,403,{error:'Acesso negado'});
    const p=path.join(UPLOADS,f.stored_name);
    if(!fs.existsSync(p)) return json(res,404,{error:'Arquivo indisponível'});
    res.writeHead(200,{'Content-Type':f.mime||'application/octet-stream','Content-Length':fs.statSync(p).size,'Content-Disposition':`inline; filename="${sanitizeName(f.original_name)}"`,'Cache-Control':'private, max-age=60'});
    fs.createReadStream(p).pipe(res); return;
  }

  if(pathname==='/api/message' && req.method==='POST'){
    const s=requireAuth(req,res,['brand']); if(!s)return;
    const body=await readJson(req); if(!verifyCsrf(req,res,s,body))return;
    const sector=text(body.sector); const message=text(body.body);
    if(!['Financeiro','Marketing','Comercial','Logística'].includes(sector) || message.length<2) return json(res,400,{error:'Preencha setor e mensagem'});
    db.prepare(`INSERT INTO messages(id,brand_id,sector,sender_role,sender_name,body,created_at,read_by_brand,read_by_admin) VALUES(?,?,?,?,?,?,?,?,?)`)
      .run(uid(),s.brand_id,sector,'brand',s.name,message,nowISO(),1,0);
    return json(res,201,{ok:true});
  }

  if(pathname.startsWith('/api/requirement/') && pathname.endsWith('/upload') && req.method==='POST'){
    const s=requireAuth(req,res,['brand']); if(!s)return;
    const id=pathname.split('/')[3]; const body=await readJson(req); if(!verifyCsrf(req,res,s,body))return;
    const r=db.prepare('SELECT * FROM requirements WHERE id=? AND brand_id=?').get(id,s.brand_id);
    if(!r) return json(res,404,{error:'Documento não encontrado'});
    const old=r.file_id;
    const fileId=saveBase64File({brandId:s.brand_id,kind:'requirement',label:r.label,file:body.file});
    db.prepare(`UPDATE requirements SET file_id=?,status='received',updated_at=? WHERE id=?`).run(fileId,nowISO(),id);
    removeFileIfUnreferenced(old);
    return json(res,200,{ok:true,file:fileMeta(fileId)});
  }

  if(pathname.startsWith('/api/bill/') && pathname.endsWith('/receipt') && req.method==='POST'){
    const s=requireAuth(req,res,['brand']); if(!s)return;
    const id=pathname.split('/')[3]; const body=await readJson(req); if(!verifyCsrf(req,res,s,body))return;
    const bill=db.prepare('SELECT * FROM bills WHERE id=? AND brand_id=?').get(id,s.brand_id);
    if(!bill) return json(res,404,{error:'Boleto não encontrado'});
    const fileId=saveBase64File({brandId:s.brand_id,kind:'payment_receipt',label:`Comprovante · ${bill.label}`,file:body.file});
    db.prepare(`INSERT INTO messages(id,brand_id,sector,sender_role,sender_name,body,created_at,read_by_brand,read_by_admin) VALUES(?,?,?,?,?,?,?,?,?)`)
      .run(uid(),s.brand_id,'Financeiro','brand',s.name,`Comprovante enviado para: ${bill.label}. Arquivo #${fileId}`,nowISO(),1,0);
    return json(res,200,{ok:true});
  }

  if(pathname==='/api/admin/overview' && req.method==='GET'){
    const s=requireAuth(req,res,['admin']); if(!s)return;
    const counts={
      brands:db.prepare('SELECT COUNT(*) AS n FROM brands').get().n,
      openBills:db.prepare(`SELECT COUNT(*) AS n FROM bills WHERE status NOT IN ('paid','cancelled')`).get().n,
      pendingDocs:db.prepare(`SELECT COUNT(*) AS n FROM requirements WHERE status NOT IN ('approved','done')`).get().n,
      unreadMessages:db.prepare(`SELECT COUNT(*) AS n FROM messages WHERE sender_role='brand' AND read_by_admin=0`).get().n
    };
    return json(res,200,{counts,brands:adminBrandList(),csrf:s.csrf,structures:Object.keys(STRUCTURES)});
  }

  if(pathname==='/api/admin/brands' && req.method==='POST'){
    const s=requireAuth(req,res,['admin']); if(!s)return;
    const body=await readJson(req); if(!verifyCsrf(req,res,s,body))return;
    if(!text(body.name) || !normalizeEmail(body.login_email) || String(body.password||'').length<8) return json(res,400,{error:'Nome, e-mail de login e senha (mín. 8 caracteres) são obrigatórios'});
    try{
      const id=createBrand({name:text(body.name),legal_name:text(body.legal_name),cnpj:text(body.cnpj),segment:text(body.segment)||'Moda',contact_name:text(body.contact_name),contact_email:text(body.contact_email),phone:text(body.phone),login_email:normalizeEmail(body.login_email),password:String(body.password)});
      if(body.send_contract===true){
        try{
          const createdBrand=db.prepare('SELECT * FROM brands WHERE id=?').get(id);
          const structure=safeJson(createdBrand.structure_json,{});
          const loginEmail=normalizeEmail(body.login_email);
          const html=formatContractEmail({...createdBrand,login_email:loginEmail},structure);
          await sendEmail(loginEmail,'Contrato de Participação - Carandaí 25',html);
        }catch(mailErr){ console.error('[admin/brands] Falha ao enviar contrato por e-mail:',mailErr); }
      }
      return json(res,201,{ok:true,id});
    }catch(e){ if(String(e.message).includes('UNIQUE')) return json(res,409,{error:'Este e-mail já está em uso'}); throw e; }
  }

  const brandMatch=pathname.match(/^\/api\/admin\/brand\/([^/]+)$/);
  if(brandMatch && req.method==='GET'){
    const s=requireAuth(req,res,['admin']); if(!s)return;
    const id=brandMatch[1];
    const snap=brandSnapshot(id); if(!snap)return json(res,404,{error:'Marca não encontrada'});
    const login=db.prepare(`SELECT id,name,email FROM users WHERE brand_id=? AND role='brand'`).get(id);
    db.prepare(`UPDATE messages SET read_by_admin=1 WHERE brand_id=? AND sender_role='brand'`).run(id);
    return json(res,200,{...snap,login,csrf:s.csrf,structures:STRUCTURES});
  }
  if(brandMatch && req.method==='PATCH'){
    const s=requireAuth(req,res,['admin']); if(!s)return;
    const id=brandMatch[1]; const body=await readJson(req); if(!verifyCsrf(req,res,s,body))return;
    const b=db.prepare('SELECT * FROM brands WHERE id=?').get(id); if(!b)return json(res,404,{error:'Marca não encontrada'});
    const segment=text(body.segment||b.segment); let structure=safeJson(b.structure_json,{});
    if(body.segment && STRUCTURES[segment]) structure={...STRUCTURES[segment]};
    if(body.structure){
      structure={...body.structure};
      if(!structure.image && STRUCTURES[segment]?.image) structure.image=STRUCTURES[segment].image;
    }
    if(!structure.image && STRUCTURES[segment]?.image) structure.image=STRUCTURES[segment].image;
    db.prepare(`UPDATE brands SET name=?,legal_name=?,cnpj=?,segment=?,contact_name=?,contact_email=?,phone=?,status=?,structure_json=? WHERE id=?`)
      .run(text(body.name||b.name),text(body.legal_name??b.legal_name),text(body.cnpj??b.cnpj),segment,text(body.contact_name??b.contact_name),text(body.contact_email??b.contact_email),text(body.phone??b.phone),text(body.status||b.status),JSON.stringify(structure),id);
    if(body.login_email){
      try{db.prepare(`UPDATE users SET email=?,name=? WHERE brand_id=? AND role='brand'`).run(normalizeEmail(body.login_email),text(body.contact_name||body.name||b.name),id);}catch(e){if(String(e.message).includes('UNIQUE'))return json(res,409,{error:'E-mail de login já utilizado'});throw e;}
    }
    if(body.new_password){ if(String(body.new_password).length<8)return json(res,400,{error:'Nova senha deve ter pelo menos 8 caracteres'}); db.prepare(`UPDATE users SET password_hash=? WHERE brand_id=? AND role='brand'`).run(passwordHash(body.new_password),id); }
    return json(res,200,{ok:true});
  }
  if(brandMatch && req.method==='DELETE'){
    const s=requireAuth(req,res,['admin']); if(!s)return;
    const id=brandMatch[1]; const body=await readJson(req); if(!verifyCsrf(req,res,s,body))return;
    const brand=db.prepare('SELECT id,name FROM brands WHERE id=?').get(id); if(!brand)return json(res,404,{error:'Marca não encontrada'});
    const stored=db.prepare('SELECT stored_name FROM files WHERE brand_id=?').all(id).map(x=>x.stored_name);
    db.prepare('DELETE FROM brands WHERE id=?').run(id);
    for(const f of stored){ try{fs.rmSync(path.join(UPLOADS,f),{force:true});}catch{} }
    return json(res,200,{ok:true});
  }

  const contractMatch=pathname.match(/^\/api\/admin\/brand\/([^/]+)\/contract$/);
  if(contractMatch && req.method==='POST'){
    const s=requireAuth(req,res,['admin']); if(!s)return;
    const brandId=contractMatch[1]; const body=await readJson(req); if(!verifyCsrf(req,res,s,body))return;
    const c=db.prepare('SELECT * FROM contracts WHERE brand_id=?').get(brandId); if(!c)return json(res,404,{error:'Contrato não encontrado'});
    let fileId=c.file_id;
    if(body.file){ fileId=saveBase64File({brandId,kind:'contract',label:'Contrato da marca',file:body.file}); }
    db.prepare(`UPDATE contracts SET status=?,file_id=?,signed_at=?,updated_at=? WHERE brand_id=?`).run(text(body.status)||c.status,fileId,text(body.signed_at)||null,nowISO(),brandId);
    if(body.file) removeFileIfUnreferenced(c.file_id);
    return json(res,200,{ok:true});
  }

  const billCreate=pathname.match(/^\/api\/admin\/brand\/([^/]+)\/bills$/);
  if(billCreate && req.method==='POST'){
    const s=requireAuth(req,res,['admin']); if(!s)return;
    const brandId=billCreate[1]; const body=await readJson(req); if(!verifyCsrf(req,res,s,body))return;
    let fileId=null; if(body.file) fileId=saveBase64File({brandId,kind:'bill',label:text(body.label)||'Boleto',file:body.file});
    db.prepare(`INSERT INTO bills(id,brand_id,installment,label,amount_cents,due_date,status,file_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)`)
      .run(uid(),brandId,Number(body.installment||1),text(body.label)||'Parcela',Math.round(Number(body.amount||0)*100),text(body.due_date)||null,text(body.status)||'pending',fileId,nowISO());
    return json(res,201,{ok:true});
  }

  const billUpdate=pathname.match(/^\/api\/admin\/bill\/([^/]+)$/);
  if(billUpdate && req.method==='PATCH'){
    const s=requireAuth(req,res,['admin']); if(!s)return;
    const id=billUpdate[1]; const body=await readJson(req); if(!verifyCsrf(req,res,s,body))return;
    const b=db.prepare('SELECT * FROM bills WHERE id=?').get(id); if(!b)return json(res,404,{error:'Boleto não encontrado'});
    let fileId=b.file_id; if(body.file) fileId=saveBase64File({brandId:b.brand_id,kind:'bill',label:text(body.label)||b.label,file:body.file});
    db.prepare(`UPDATE bills SET installment=?,label=?,amount_cents=?,due_date=?,status=?,file_id=? WHERE id=?`)
      .run(Number(body.installment??b.installment),text(body.label??b.label),body.amount!==undefined?Math.round(Number(body.amount)*100):b.amount_cents,text(body.due_date??b.due_date)||null,text(body.status??b.status),fileId,id);
    if(body.file) removeFileIfUnreferenced(b.file_id);
    return json(res,200,{ok:true});
  }
  if(billUpdate && req.method==='DELETE'){
    const s=requireAuth(req,res,['admin']); if(!s)return;
    const body=await readJson(req); if(!verifyCsrf(req,res,s,body))return;
    const b=db.prepare('SELECT * FROM bills WHERE id=?').get(billUpdate[1]); if(!b)return json(res,404,{error:'Boleto não encontrado'});
    db.prepare('DELETE FROM bills WHERE id=?').run(billUpdate[1]); removeFileIfUnreferenced(b.file_id); return json(res,200,{ok:true});
  }

  const reqUpdate=pathname.match(/^\/api\/admin\/requirement\/([^/]+)$/);
  if(reqUpdate && req.method==='PATCH'){
    const s=requireAuth(req,res,['admin']); if(!s)return;
    const id=reqUpdate[1]; const body=await readJson(req); if(!verifyCsrf(req,res,s,body))return;
    const r=db.prepare('SELECT * FROM requirements WHERE id=?').get(id); if(!r)return json(res,404,{error:'Documento não encontrado'});
    db.prepare(`UPDATE requirements SET label=?,status=?,due_date=?,notes=?,updated_at=? WHERE id=?`)
      .run(text(body.label??r.label),text(body.status??r.status),text(body.due_date??r.due_date)||null,text(body.notes??r.notes),nowISO(),id);
    return json(res,200,{ok:true});
  }

  const reqCreate=pathname.match(/^\/api\/admin\/brand\/([^/]+)\/requirements$/);
  if(reqCreate && req.method==='POST'){
    const s=requireAuth(req,res,['admin']); if(!s)return;
    const brandId=reqCreate[1]; const body=await readJson(req); if(!verifyCsrf(req,res,s,body))return;
    const label=text(body.label); if(!label)return json(res,400,{error:'Informe o documento'});
    const code=`custom_${crypto.randomBytes(4).toString('hex')}`;
    db.prepare(`INSERT INTO requirements(id,brand_id,code,label,status,due_date,notes,updated_at) VALUES(?,?,?,?,?,?,?,?)`).run(uid(),brandId,code,label,'pending',text(body.due_date)||null,text(body.notes),nowISO());
    return json(res,201,{ok:true});
  }

  const replyMatch=pathname.match(/^\/api\/admin\/brand\/([^/]+)\/message$/);
  if(replyMatch && req.method==='POST'){
    const s=requireAuth(req,res,['admin']); if(!s)return;
    const brandId=replyMatch[1]; const body=await readJson(req); if(!verifyCsrf(req,res,s,body))return;
    const sector=text(body.sector); const message=text(body.body);
    if(!['Financeiro','Marketing','Comercial','Logística'].includes(sector)||message.length<2)return json(res,400,{error:'Preencha setor e mensagem'});
    db.prepare(`INSERT INTO messages(id,brand_id,sector,sender_role,sender_name,body,created_at,read_by_brand,read_by_admin) VALUES(?,?,?,?,?,?,?,?,?)`)
      .run(uid(),brandId,sector,'admin','Equipe Carandaí 25',message,nowISO(),0,1);
    return json(res,201,{ok:true});
  }

  return json(res,404,{error:'Rota não encontrada'});
}

function serveStatic(req,res,url){
  let pathname=decodeURIComponent(url.pathname);
  if(pathname==='/') pathname='/index.html';
  let filePath=path.normalize(path.join(PUBLIC,pathname));
  if(!filePath.startsWith(PUBLIC)) { res.writeHead(403); return res.end('Forbidden'); }
  if(!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()){
    filePath=path.join(PUBLIC,'index.html');
  }
  const st=fs.statSync(filePath);
  const base=path.basename(filePath);
  const noCache=new Set(['index.html','app.js','styles.css','sw.js','manifest.json']).has(base);
  const headers={'Content-Type':mimeByExt(filePath),'Content-Length':st.size};
  if(filePath.endsWith('.png')||filePath.endsWith('.jpg')||filePath.endsWith('.jpeg'))headers['Cache-Control']='public, max-age=86400';
  else headers['Cache-Control']=noCache?'no-cache':'public, max-age=3600';
  if(['image/png','image/jpeg'].includes(headers['Content-Type']))headers['Accept-Encoding']='gzip, deflate';
  res.writeHead(200,headers);
  fs.createReadStream(filePath).pipe(res);
}

const server=http.createServer(async (req,res)=>{
  try{
    const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
    if(url.pathname.startsWith('/api/')) return await api(req,res,url);
    return serveStatic(req,res,url);
  }catch(e){
    console.error(e);
    if(!res.headersSent) json(res,e.status||500,{error:e.message||'Erro interno'}); else res.end();
  }
});

server.listen(PORT,()=>{
  console.log(`\nCarandaí 25 · Portal da Marca v4.3`);
  console.log(`Acesse: http://localhost:${PORT}`);
  console.log(`Storage: ${STORAGE_ROOT}`);
  if(process.env.NODE_ENV!=='production'){
    console.log(`Admin local: admin@carandai25.com / ${process.env.ADMIN_PASSWORD||'Admin@2026'}`);
    if(process.env.SEED_DEMO!=='0'){
      console.log(`Marca demo: demo@marca.com / Marca@2026`);
      console.log(`Outra marca: acessorios@demo.com / Marca@2026`);
    }
  }
  console.log('');
});
