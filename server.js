'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { buildContractPdfBuffer, safeFileName } = require('./contract-pdf');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const STORAGE_ROOT = process.env.STORAGE_ROOT || process.env.RAILWAY_VOLUME_MOUNT_PATH || ROOT;
const DATA = path.join(STORAGE_ROOT, 'data');
const UPLOADS = path.join(STORAGE_ROOT, 'uploads');
const DB_PATH = path.join(DATA, 'portal.db');
const PORT = Number(process.env.PORT || 3000);

const SMTP_HOST = textEnv('SMTP_HOST');
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = textEnv('SMTP_USER');
const SMTP_PASS = textEnv('SMTP_PASS');
const SMTP_FROM = textEnv('SMTP_FROM') || SMTP_USER;
const SMTP_SECURE = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || SMTP_PORT === 465;
const RESEND_API_KEY = textEnv('RESEND_API_KEY');
const EMAIL_FROM = textEnv('EMAIL_FROM') || SMTP_FROM;
const EMAIL_REPLY_TO = textEnv('EMAIL_REPLY_TO') || 'carandai25comercial@gmail.com';

function textEnv(name){ return String(process.env[name] || '').trim(); }

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
function validEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(v)); }
function htmlEsc(v){ return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c])); }
function safeJson(v, fallback){ try { return JSON.parse(v); } catch { return fallback; } }
function moneyBR(cents){ return Number(cents||0); }
function parseMoneyToCents(v){
  let s=String(v??'').trim().replace(/R\$/gi,'').replace(/\s/g,'').replace(/[^0-9,.-]/g,'');
  if(!s) return 0;
  if(s.includes(',') && s.includes('.')) s=s.replace(/\./g,'').replace(',','.');
  else if(s.includes(',')) s=s.replace(',','.');
  else if((s.match(/\./g)||[]).length>1) s=s.replace(/\./g,'');
  const n=Number(s);
  return Number.isFinite(n)?Math.round(n*100):0;
}
function defaultContractTerms(){
  return {contract_date:new Date().toISOString().slice(0,10),total_cents:0,installments:[{due_date:'',amount_cents:0},{due_date:'',amount_cents:0},{due_date:'',amount_cents:0}]};
}
function contractTermsFromBody(body, previous={}){
  const base={...defaultContractTerms(),...(previous||{})};
  const old=Array.isArray(base.installments)?base.installments:[];
  const installments=[0,1,2].map(i=>({
    due_date:text(body[`installment${i+1}_due`] ?? old[i]?.due_date ?? ''),
    amount_cents:body[`installment${i+1}_value`]!==undefined?parseMoneyToCents(body[`installment${i+1}_value`]):Number(old[i]?.amount_cents||0)
  }));
  return {
    contract_date:text(body.contract_date ?? base.contract_date) || new Date().toISOString().slice(0,10),
    total_cents:body.contract_total!==undefined?parseMoneyToCents(body.contract_total):Number(base.total_cents||0),
    installments
  };
}

function validateContractDraft(brand,terms){
  const missing=[];
  if(!text(brand?.legal_name||brand?.name)) missing.push('razão social');
  if(!text(brand?.cnpj)) missing.push('CNPJ');
  if(!text(brand?.address)) missing.push('endereço / sede');
  if(!text(brand?.representative||brand?.contact_name)) missing.push('representante');
  if(missing.length) return `Preencha os dados obrigatórios do contrato: ${missing.join(', ')}.`;
  if(!text(terms?.contract_date)) return 'Informe a data do contrato.';
  if(Number(terms?.total_cents||0)<=0) return 'Informe o valor total do contrato.';
  const inst=Array.isArray(terms?.installments)?terms.installments:[];
  let used=0,sum=0;
  for(let i=0;i<3;i++){
    const row=inst[i]||{}; const due=text(row.due_date); const amount=Number(row.amount_cents||0);
    if(due || amount>0){
      if(!due || amount<=0) return `Preencha vencimento e valor da ${i+1}ª parcela, ou deixe os dois campos em branco.`;
      used++; sum+=amount;
    }
  }
  if(!used) return 'Cadastre pelo menos uma parcela do contrato.';
  if(sum!==Number(terms.total_cents||0)) return `A soma das parcelas (${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(sum/100)}) deve ser igual ao valor total (${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(terms.total_cents||0)/100)}).`;
  return '';
}

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
function credentialKey(){
  const secret=textEnv('CREDENTIALS_SECRET') || textEnv('ADMIN_PASSWORD') || 'carandai25-local-dev';
  return crypto.createHash('sha256').update(`carandai25-credentials|${secret}`).digest();
}
function encryptInitialPassword(password){
  const value=String(password||''); if(!value) return '';
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',credentialKey(),iv);
  const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  const tag=cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}
function decryptInitialPassword(packed){
  try{
    if(!packed) return '';
    const [iv64,tag64,data64]=String(packed).split('.');
    if(!iv64||!tag64||!data64) return '';
    const decipher=crypto.createDecipheriv('aes-256-gcm',credentialKey(),Buffer.from(iv64,'base64url'));
    decipher.setAuthTag(Buffer.from(tag64,'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data64,'base64url')),decipher.final()]).toString('utf8');
  }catch{return '';}
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
      address TEXT DEFAULT '',
      representative TEXT DEFAULT '',
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
      must_change_password INTEGER NOT NULL DEFAULT 0,
      initial_password_enc TEXT,
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
      signed_file_id TEXT,
      signed_at TEXT,
      generated_at TEXT,
      terms_json TEXT DEFAULT '{}',
      emailed_at TEXT,
      emailed_to TEXT,
      email_status TEXT,
      email_error TEXT,
      email_provider TEXT,
      email_message_id TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(brand_id) REFERENCES brands(id) ON DELETE CASCADE,
      FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE SET NULL,
      FOREIGN KEY(signed_file_id) REFERENCES files(id) ON DELETE SET NULL
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

  // Migração segura para bancos já existentes no Railway.
  const brandCols = new Set(db.prepare('PRAGMA table_info(brands)').all().map(x=>x.name));
  if(!brandCols.has('address')) db.exec("ALTER TABLE brands ADD COLUMN address TEXT DEFAULT ''");
  if(!brandCols.has('representative')) db.exec("ALTER TABLE brands ADD COLUMN representative TEXT DEFAULT ''");

  const userCols = new Set(db.prepare('PRAGMA table_info(users)').all().map(x=>x.name));
  if(!userCols.has('must_change_password')) db.exec('ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0');
  if(!userCols.has('initial_password_enc')) db.exec('ALTER TABLE users ADD COLUMN initial_password_enc TEXT');

  const contractCols = new Set(db.prepare('PRAGMA table_info(contracts)').all().map(x=>x.name));
  const contractMigrations=[
    ['signed_file_id','ALTER TABLE contracts ADD COLUMN signed_file_id TEXT'],
    ['generated_at','ALTER TABLE contracts ADD COLUMN generated_at TEXT'],
    ['terms_json',"ALTER TABLE contracts ADD COLUMN terms_json TEXT DEFAULT '{}'"],
    ['emailed_at','ALTER TABLE contracts ADD COLUMN emailed_at TEXT'],
    ['emailed_to','ALTER TABLE contracts ADD COLUMN emailed_to TEXT'],
    ['email_status','ALTER TABLE contracts ADD COLUMN email_status TEXT'],
    ['email_error','ALTER TABLE contracts ADD COLUMN email_error TEXT'],
    ['email_provider','ALTER TABLE contracts ADD COLUMN email_provider TEXT'],
    ['email_message_id','ALTER TABLE contracts ADD COLUMN email_message_id TEXT']
  ];
  for(const [col,sql] of contractMigrations) if(!contractCols.has(col)) db.exec(sql);
}

const STRUCTURES = {
  'Moda': {
    image:'/assets/estruturas/estrutura-moda.png?v=4',
    title:'Estrutura contratada · Moda',
    items:['Arara: 1,80 m de altura','1,70 m de comprimento','0,30 m de largura','1 cadeira'],
    brandResponsibility:['Levar os próprios cabides'],
    note:'A disposição final poderá variar conforme o mix e o layout geral do evento.'
  },
  'Bem-Estar / Decoração': {
    image:'/assets/estruturas/estrutura-bem-estar-decoracao.png?v=4',
    title:'Estrutura contratada · Bem-Estar / Decoração',
    items:['Estante: 2,00 m de altura','1,50 m de comprimento','0,50 m de largura','5 prateleiras de 0,35 m','Aparador conforme contratação','1 cadeira'],
    brandResponsibility:[],
    note:'A posição final da marca é informada pela produção no momento da montagem. Atenção: na página 8 do manual, o texto informa 0,45 m de altura para o aparador, enquanto o desenho indica 0,80 m; confirme a medida final com a Logística.'
  },
  'Bolsas e Sapatos': {
    image:'/assets/estruturas/estrutura-bolsas-sapatos.png?v=4',
    title:'Estrutura contratada · Bolsas e Sapatos',
    items:['Estante: 1,80 m de altura','2,30 m de comprimento','0,30 m de largura','5 prateleiras de 0,35 m','1 cadeira'],
    brandResponsibility:[],
    note:'Organize o mix exposto para manter circulação, visibilidade da marca e reposição rápida.'
  },
  'Acessórios': {
    image:'/assets/estruturas/estrutura-acessorios.png?v=4',
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

function createBrand({name, legal_name='', cnpj='', segment='Moda', contact_name='', contact_email='', phone='', address='', representative='', login_email, password}){
  const brandId = uid();
  const created = nowISO();
  const structure = STRUCTURES[segment] || {title:`Estrutura contratada · ${segment||'Personalizada'}`,items:[],brandResponsibility:[],note:''};
  db.prepare(`INSERT INTO brands(id,name,legal_name,cnpj,segment,contact_name,contact_email,phone,address,representative,status,structure_json,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(brandId,name,legal_name,cnpj,segment,contact_name,contact_email,phone,address,representative||contact_name,'active',JSON.stringify(structure),created);
  const userId = uid();
  const initialPassword=String(password||'Marca@2026');
  db.prepare(`INSERT INTO users(id,brand_id,name,email,password_hash,role,must_change_password,initial_password_enc,created_at) VALUES(?,?,?,?,?,?,?,?,?)`)
    .run(userId,brandId,contact_name||name,normalizeEmail(login_email||contact_email),passwordHash(initialPassword),'brand',1,encryptInitialPassword(initialPassword),created);
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
  const row=db.prepare(`SELECT s.id AS session_id,s.csrf,s.expires_at,u.id AS user_id,u.brand_id,u.name,u.email,u.role,u.must_change_password
    FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?`).get(sha256(token));
  if(!row) return null;
  if(new Date(row.expires_at).getTime()<Date.now()){ db.prepare('DELETE FROM sessions WHERE id=?').run(row.session_id); return null; }
  return row;
}
function requireAuth(req,res,roles,opts={}){
  const s=getSession(req);
  if(!s){ json(res,401,{error:'Não autenticado'}); return null; }
  if(roles && !roles.includes(s.role)){ json(res,403,{error:'Acesso não autorizado'}); return null; }
  if(s.role==='brand' && Number(s.must_change_password||0)===1 && !opts.allowPasswordChange){
    json(res,428,{error:'Por segurança, altere a senha inicial para continuar.',code:'PASSWORD_CHANGE_REQUIRED'}); return null;
  }
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
function saveBufferFile({brandId,kind,label,originalName,mime='application/pdf',buffer}){
  if(!Buffer.isBuffer(buffer) || !buffer.length) throw Object.assign(new Error('Arquivo gerado está vazio'),{status:500});
  const id=uid();
  const original=sanitizeName(originalName||'arquivo.pdf');
  const stored=`${id}-${original}`;
  fs.writeFileSync(path.join(UPLOADS,stored),buffer);
  db.prepare(`INSERT INTO files(id,brand_id,kind,label,original_name,stored_name,mime,created_at) VALUES(?,?,?,?,?,?,?,?)`)
    .run(id,brandId,kind,label||original,original,stored,mime,nowISO());
  return id;
}
function removeFileIfUnreferenced(fileId){
  if(!fileId) return;
  const refs = db.prepare(`SELECT
    (SELECT COUNT(*) FROM contracts WHERE file_id=?) +
    (SELECT COUNT(*) FROM contracts WHERE signed_file_id=?) +
    (SELECT COUNT(*) FROM bills WHERE file_id=?) +
    (SELECT COUNT(*) FROM requirements WHERE file_id=?) AS n`).get(fileId,fileId,fileId,fileId).n;
  if(Number(refs)>0) return;
  const f=db.prepare('SELECT stored_name FROM files WHERE id=?').get(fileId);
  if(f){ try{fs.rmSync(path.join(UPLOADS,f.stored_name),{force:true});}catch{} db.prepare('DELETE FROM files WHERE id=?').run(fileId); }
}
function fileMeta(fileId){ if(!fileId)return null; return db.prepare('SELECT id,label,original_name,mime,created_at FROM files WHERE id=?').get(fileId)||null; }

function smtpConfigured(){ return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS && SMTP_FROM); }
function resendConfigured(){ return Boolean(RESEND_API_KEY && EMAIL_FROM); }
function emailStatus(){
  if(resendConfigured()) return {configured:true,provider:'resend',from:EMAIL_FROM};
  if(smtpConfigured()) return {configured:true,provider:'smtp',from:SMTP_FROM};
  return {configured:false,provider:'none',from:'',hint:'Configure RESEND_API_KEY + EMAIL_FROM (recomendado no Railway) ou SMTP em plano Railway Pro.'};
}
function mailTransport(){
  if(!smtpConfigured()) throw Object.assign(new Error('SMTP não configurado.'),{status:503});
  return nodemailer.createTransport({host:SMTP_HOST,port:SMTP_PORT,secure:SMTP_SECURE,auth:{user:SMTP_USER,pass:SMTP_PASS},connectionTimeout:12000,greetingTimeout:12000,socketTimeout:20000});
}
async function deliverEmail({to,subject,html,attachment=null}){
  if(resendConfigured()){
    const payload={from:EMAIL_FROM,to:[to],subject,html};
    if(EMAIL_REPLY_TO) payload.reply_to=EMAIL_REPLY_TO;
    if(attachment) payload.attachments=[{filename:attachment.filename,content:attachment.buffer.toString('base64')}];
    const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${RESEND_API_KEY}`},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
    let data={}; try{data=await r.json();}catch{}
    if(!r.ok) throw Object.assign(new Error(`Resend recusou o envio (${r.status}): ${data?.message||data?.error||'verifique a chave e o domínio remetente'}`),{status:502});
    return {provider:'resend',message_id:data.id||''};
  }
  if(smtpConfigured()){
    const info=await mailTransport().sendMail({from:SMTP_FROM,to,replyTo:EMAIL_REPLY_TO||undefined,subject,html,attachments:attachment?[{filename:attachment.filename,content:attachment.buffer,contentType:attachment.mime||'application/pdf'}]:[]});
    return {provider:'smtp',message_id:info.messageId||''};
  }
  throw Object.assign(new Error('Envio de e-mail não configurado. No Railway Free/Trial/Hobby o SMTP é bloqueado; configure RESEND_API_KEY e EMAIL_FROM para enviar por HTTPS.'),{status:503});
}
async function generateContractForBrand(brandId,termsOverride=null,brandUpdates=null){
  let brand=db.prepare('SELECT * FROM brands WHERE id=?').get(brandId);
  if(!brand) throw Object.assign(new Error('Marca não encontrada'),{status:404});
  if(brandUpdates){
    const legal_name=text(brandUpdates.legal_name??brand.legal_name);
    const cnpj=text(brandUpdates.cnpj??brand.cnpj);
    const address=text(brandUpdates.address??brand.address);
    const representative=text(brandUpdates.representative??brand.representative??brand.contact_name);
    db.prepare('UPDATE brands SET legal_name=?,cnpj=?,address=?,representative=? WHERE id=?').run(legal_name,cnpj,address,representative,brandId);
    brand={...brand,legal_name,cnpj,address,representative};
  }
  const c=db.prepare('SELECT * FROM contracts WHERE brand_id=?').get(brandId);
  if(!c) throw Object.assign(new Error('Contrato não encontrado'),{status:404});
  const previous=safeJson(c.terms_json,defaultContractTerms());
  const terms=termsOverride||previous;
  const contractError=validateContractDraft(brand,terms);
  if(contractError) throw Object.assign(new Error(contractError),{status:400});
  const buffer=await buildContractPdfBuffer({brand,terms});
  const filename=`Contrato_Carandai25_${safeFileName(brand.name)}.pdf`;
  const newFileId=saveBufferFile({brandId,kind:'contract_generated',label:'Contrato gerado para assinatura',originalName:filename,mime:'application/pdf',buffer});
  const generatedAt=nowISO();
  db.prepare(`UPDATE contracts SET status=?,file_id=?,generated_at=?,terms_json=?,email_status=NULL,email_error=NULL,updated_at=? WHERE brand_id=?`)
    .run('pending',newFileId,generatedAt,JSON.stringify(terms),generatedAt,brandId);
  removeFileIfUnreferenced(c.file_id);
  return {file:fileMeta(newFileId),generated_at:generatedAt,terms};
}
async function sendContractEmail({brandId,to}){
  const brand=db.prepare(`SELECT b.*,u.email AS login_email,u.must_change_password,u.initial_password_enc FROM brands b LEFT JOIN users u ON u.brand_id=b.id AND u.role='brand' WHERE b.id=?`).get(brandId);
  if(!brand) throw Object.assign(new Error('Marca não encontrada'),{status:404});
  const allowed=[normalizeEmail(brand.contact_email),normalizeEmail(brand.login_email)].filter(Boolean);
  const recipient=normalizeEmail(to || brand.contact_email || brand.login_email);
  if(!validEmail(recipient)) throw Object.assign(new Error('Cadastre um e-mail válido para a marca antes de enviar o contrato.'),{status:400});
  if(!allowed.includes(recipient)) throw Object.assign(new Error('O contrato só pode ser enviado para o e-mail de contato ou de login cadastrado nesta marca.'),{status:400});
  const c=db.prepare('SELECT * FROM contracts WHERE brand_id=?').get(brandId);
  if(!c?.file_id) throw Object.assign(new Error('Gere o contrato automático desta marca antes de enviar por e-mail.'),{status:400});
  const f=db.prepare('SELECT * FROM files WHERE id=? AND brand_id=?').get(c.file_id,brandId);
  if(!f) throw Object.assign(new Error('Arquivo do contrato gerado não encontrado.'),{status:404});
  const filePath=path.join(UPLOADS,f.stored_name);
  if(!fs.existsSync(filePath)) throw Object.assign(new Error('PDF do contrato não está disponível no armazenamento.'),{status:404});
  const responsible=brand.representative || brand.contact_name || brand.name;
  const initialPassword=decryptInitialPassword(brand.initial_password_enc);
  const credentialPassword = Number(brand.must_change_password||0)===1 && initialPassword
    ? `<strong>${htmlEsc(initialPassword)}</strong>`
    : '<em>use a senha pessoal já definida pela marca; para reenviar uma senha temporária, a equipe Carandaí 25 deverá redefini-la no cadastro</em>';
  const subject=`Contrato + acesso ao Portal da Marca - Carandaí 25 - ${brand.name}`;
  const html=`
    <div style="font-family:Arial,Helvetica,sans-serif;color:#1d1714;line-height:1.55;max-width:680px">
      <p>Olá, ${htmlEsc(responsible)}.</p>
      <p>Segue em anexo o <strong>Contrato de Participação no evento Carandaí 25</strong>, referente à marca <strong>${htmlEsc(brand.name)}</strong>.</p>
      <p><strong>Evento:</strong> 05 a 08 de novembro de 2026 · Jockey Club · Tribunas B &amp; C · Rio de Janeiro.</p>
      <p>Pedimos a conferência dos dados e das condições comerciais do documento.</p>

      <h2 style="font-size:20px;margin:28px 0 8px">Novo Portal da Marca Carandaí 25</h2>
      <p>Para facilitar a participação no evento, a Carandaí 25 criou uma nova plataforma exclusiva para as marcas expositoras. O portal reúne em um só lugar as principais informações, documentos e canais de atendimento da sua participação.</p>
      <p>No <strong>Portal da Marca</strong>, você terá acesso a:</p>
      <ul>
        <li><strong>Manual do Expositor</strong> e materiais oficiais do evento;</li>
        <li><strong>Boletos e informações de pagamento</strong> vinculados à sua marca;</li>
        <li><strong>Área de mensagens</strong> para falar diretamente com Financeiro, Comercial, Logística e Marketing;</li>
        <li><strong>Contrato da marca</strong> e, após a conclusão da assinatura digital, a via assinada ficará arquivada no portal;</li>
        <li><strong>Orientações e acompanhamento documental da SEFAZ/RJ</strong>, incluindo os itens relacionados à Autorização de Funcionamento Provisório;</li>
        <li><strong>Estrutura contratada para o seu segmento</strong>, com medidas e referência visual do mobiliário que será utilizado no evento;</li>
        <li>Informações operacionais, documentos pendentes e dados específicos da sua participação.</li>
      </ul>

      <div style="border:1px solid #1d1714;padding:16px 18px;margin:24px 0;background:#f7f3e9">
        <strong>Seu acesso inicial</strong><br>
        Portal: <a href="https://portal.carandai25.com/">https://portal.carandai25.com/</a><br>
        Login: <strong>${htmlEsc(brand.login_email||recipient)}</strong><br>
        Senha inicial: ${credentialPassword}
      </div>
      <p><strong>Por segurança, no primeiro acesso a marca deverá criar uma nova senha pessoal.</strong> Depois da alteração, a senha inicial deixa de ser utilizada.</p>

      <h2 style="font-size:20px;margin:28px 0 8px">Assinatura do contrato</h2>
      <p><strong>A assinatura será realizada de forma digital.</strong> A marca receberá um novo e-mail enviado pela plataforma de assinatura <strong>Contraktor</strong>, com o link e as instruções para realizar a assinatura eletrônica.</p>
      <p>Se o e-mail da Contraktor não aparecer na caixa de entrada, verifique também as pastas de spam, lixo eletrônico e promoções.</p>
      <p>Após a assinatura, a via assinada poderá ficar disponível também no Portal da Marca.</p>
      <p>Atenciosamente,<br><strong>Carandaí 25</strong></p>
    </div>`;
  try{
    const delivery=await deliverEmail({to:recipient,subject,html,attachment:{filename:f.original_name||'Contrato_Carandai25.pdf',buffer:fs.readFileSync(filePath),mime:f.mime||'application/pdf'}});
    const sentAt=nowISO();
    db.prepare(`UPDATE contracts SET emailed_at=?,emailed_to=?,email_status='sent',email_error=NULL,email_provider=?,email_message_id=?,updated_at=? WHERE brand_id=?`)
      .run(sentAt,recipient,delivery.provider,delivery.message_id,sentAt,brandId);
    return {to:recipient,sent_at:sentAt,...delivery};
  }catch(err){
    const at=nowISO();
    try{db.prepare(`UPDATE contracts SET email_status='error',email_error=?,updated_at=? WHERE brand_id=?`).run(String(err.message||err).slice(0,900),at,brandId);}catch{}
    throw err;
  }
}
async function sendEmailTest(to){
  const recipient=normalizeEmail(to);
  if(!validEmail(recipient)) throw Object.assign(new Error('Informe um e-mail válido para o teste.'),{status:400});
  const html='<p>Teste de envio do <strong>Portal Carandaí 25</strong>.</p><p>Se você recebeu esta mensagem, o serviço de e-mail está configurado corretamente.</p>';
  return deliverEmail({to:recipient,subject:'Teste de e-mail - Portal Carandaí 25',html});
}

function brandSnapshot(brandId){
  const brand=db.prepare('SELECT * FROM brands WHERE id=?').get(brandId);
  if(!brand) return null;
  const contract=db.prepare('SELECT * FROM contracts WHERE brand_id=?').get(brandId)||null;
  if(contract){
    contract.terms=safeJson(contract.terms_json,defaultContractTerms());
    contract.file=fileMeta(contract.file_id);
    contract.generated_file=fileMeta(contract.file_id);
    contract.signed_file=fileMeta(contract.signed_file_id);
  }
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
    return json(res,200,{ok:true,service:'carandai25-portal',version:'4.7.0',storage:STORAGE_ROOT});
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
    return json(res,200,{ok:true,role:u.role,csrf,must_change_password:Number(u.must_change_password||0)===1});
  }

  if(pathname==='/api/logout' && req.method==='POST'){
    const s=getSession(req);
    if(s) db.prepare('DELETE FROM sessions WHERE id=?').run(s.session_id);
    clearSessionCookie(res); return json(res,200,{ok:true});
  }

  if(pathname==='/api/me' && req.method==='GET'){
    const s=requireAuth(req,res,null,{allowPasswordChange:true}); if(!s)return;
    const brand=s.brand_id?db.prepare('SELECT id,name,segment FROM brands WHERE id=?').get(s.brand_id):null;
    return json(res,200,{user:{id:s.user_id,name:s.name,email:s.email,role:s.role,brand_id:s.brand_id,must_change_password:Number(s.must_change_password||0)===1},brand,csrf:s.csrf});
  }

  if(pathname==='/api/password/change' && req.method==='POST'){
    const s=requireAuth(req,res,['brand'],{allowPasswordChange:true}); if(!s)return;
    const body=await readJson(req); if(!verifyCsrf(req,res,s,body))return;
    const current=String(body.current_password||'');
    const next=String(body.new_password||'');
    const confirm=String(body.confirm_password||'');
    if(next.length<8) return json(res,400,{error:'A nova senha deve ter pelo menos 8 caracteres.'});
    if(next!==confirm) return json(res,400,{error:'A confirmação da nova senha não confere.'});
    const u=db.prepare('SELECT password_hash FROM users WHERE id=?').get(s.user_id);
    if(!u || !passwordVerify(current,u.password_hash)) return json(res,400,{error:'A senha atual está incorreta.'});
    if(passwordVerify(next,u.password_hash)) return json(res,400,{error:'Escolha uma senha diferente da senha atual.'});
    db.prepare('UPDATE users SET password_hash=?,must_change_password=0,initial_password_enc=NULL WHERE id=?').run(passwordHash(next),s.user_id);
    return json(res,200,{ok:true});
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
    if(!text(body.name) || !validEmail(body.login_email) || String(body.password||'').length<8) return json(res,400,{error:'Nome, e-mail de login válido e senha (mín. 8 caracteres) são obrigatórios'});
    if(!validEmail(body.contact_email)) return json(res,400,{error:'Cadastre um e-mail de contato válido para a marca. Ele será usado no envio do contrato.'});
    try{
      const draftBrand={name:text(body.name),legal_name:text(body.legal_name),cnpj:text(body.cnpj),address:text(body.address),representative:text(body.representative||body.contact_name),contact_name:text(body.contact_name)};
      const terms=contractTermsFromBody(body);
      const contractError=validateContractDraft(draftBrand,terms);
      if(contractError) return json(res,400,{error:contractError});
      const pdfBuffer=await buildContractPdfBuffer({brand:draftBrand,terms});
      const id=createBrand({name:text(body.name),legal_name:text(body.legal_name),cnpj:text(body.cnpj),segment:text(body.segment)||'Moda',contact_name:text(body.contact_name),contact_email:text(body.contact_email),phone:text(body.phone),address:text(body.address),representative:text(body.representative||body.contact_name),login_email:normalizeEmail(body.login_email),password:String(body.password)});
      const fileId=saveBufferFile({brandId:id,kind:'contract_generated',label:'Contrato gerado para assinatura',originalName:`Contrato_Carandai25_${safeFileName(body.name)}.pdf`,mime:'application/pdf',buffer:pdfBuffer});
      const at=nowISO();
      db.prepare(`UPDATE contracts SET status='pending',file_id=?,generated_at=?,terms_json=?,updated_at=? WHERE brand_id=?`).run(fileId,at,JSON.stringify(terms),at,id);
      return json(res,201,{ok:true,id,contract_generated:true});
    }catch(e){ if(String(e.message).includes('UNIQUE')) return json(res,409,{error:'Este e-mail já está em uso'}); throw e; }
  }

  const brandMatch=pathname.match(/^\/api\/admin\/brand\/([^/]+)$/);
  if(brandMatch && req.method==='GET'){
    const s=requireAuth(req,res,['admin']); if(!s)return;
    const id=brandMatch[1];
    const snap=brandSnapshot(id); if(!snap)return json(res,404,{error:'Marca não encontrada'});
    const login=db.prepare(`SELECT id,name,email,must_change_password,CASE WHEN initial_password_enc IS NOT NULL AND initial_password_enc<>'' THEN 1 ELSE 0 END AS has_temporary_password FROM users WHERE brand_id=? AND role='brand'`).get(id);
    db.prepare(`UPDATE messages SET read_by_admin=1 WHERE brand_id=? AND sender_role='brand'`).run(id);
    return json(res,200,{...snap,login,csrf:s.csrf,structures:STRUCTURES,email_config:emailStatus()});
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
    db.prepare(`UPDATE brands SET name=?,legal_name=?,cnpj=?,segment=?,contact_name=?,contact_email=?,phone=?,address=?,representative=?,status=?,structure_json=? WHERE id=?`)
      .run(text(body.name||b.name),text(body.legal_name??b.legal_name),text(body.cnpj??b.cnpj),segment,text(body.contact_name??b.contact_name),text(body.contact_email??b.contact_email),text(body.phone??b.phone),text(body.address??b.address),text(body.representative??b.representative??b.contact_name),text(body.status||b.status),JSON.stringify(structure),id);
    if(body.login_email){
      try{db.prepare(`UPDATE users SET email=?,name=? WHERE brand_id=? AND role='brand'`).run(normalizeEmail(body.login_email),text(body.contact_name||body.name||b.name),id);}catch(e){if(String(e.message).includes('UNIQUE'))return json(res,409,{error:'E-mail de login já utilizado'});throw e;}
    }
    if(body.new_password){
      const temp=String(body.new_password);
      if(temp.length<8)return json(res,400,{error:'Nova senha deve ter pelo menos 8 caracteres'});
      db.prepare(`UPDATE users SET password_hash=?,must_change_password=1,initial_password_enc=? WHERE brand_id=? AND role='brand'`).run(passwordHash(temp),encryptInitialPassword(temp),id);
    }
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
    if(body.file) fileId=saveBase64File({brandId,kind:'contract_generated',label:'Contrato para assinatura',file:body.file});
    db.prepare(`UPDATE contracts SET status=?,file_id=?,signed_at=?,updated_at=? WHERE brand_id=?`).run(text(body.status)||c.status,fileId,text(body.signed_at)||c.signed_at||null,nowISO(),brandId);
    if(body.file) removeFileIfUnreferenced(c.file_id);
    return json(res,200,{ok:true});
  }

  const contractGenerateMatch=pathname.match(/^\/api\/admin\/brand\/([^/]+)\/contract\/generate$/);
  if(contractGenerateMatch && req.method==='POST'){
    const s=requireAuth(req,res,['admin']); if(!s)return;
    const brandId=contractGenerateMatch[1]; const body=await readJson(req); if(!verifyCsrf(req,res,s,body))return;
    const c=db.prepare('SELECT * FROM contracts WHERE brand_id=?').get(brandId); if(!c)return json(res,404,{error:'Contrato não encontrado'});
    const previous=safeJson(c.terms_json,defaultContractTerms());
    const terms=contractTermsFromBody(body,previous);
    const result=await generateContractForBrand(brandId,terms,{legal_name:body.legal_name,cnpj:body.cnpj,address:body.address,representative:body.representative});
    return json(res,200,{ok:true,...result});
  }

  const contractSignedMatch=pathname.match(/^\/api\/admin\/brand\/([^/]+)\/contract\/signed$/);
  if(contractSignedMatch && req.method==='POST'){
    const s=requireAuth(req,res,['admin']); if(!s)return;
    const brandId=contractSignedMatch[1]; const body=await readJson(req); if(!verifyCsrf(req,res,s,body))return;
    const c=db.prepare('SELECT * FROM contracts WHERE brand_id=?').get(brandId); if(!c)return json(res,404,{error:'Contrato não encontrado'});
    if(!body.file) return json(res,400,{error:'Selecione o PDF assinado.'});
    if(!String(body.file.data||'').startsWith('data:application/pdf;base64,')) return json(res,400,{error:'O contrato assinado deve ser enviado em PDF.'});
    const fileId=saveBase64File({brandId,kind:'contract_signed',label:'Contrato assinado',file:body.file});
    const signedAt=text(body.signed_at)||new Date().toISOString().slice(0,10);
    db.prepare(`UPDATE contracts SET status='signed',signed_file_id=?,signed_at=?,updated_at=? WHERE brand_id=?`).run(fileId,signedAt,nowISO(),brandId);
    removeFileIfUnreferenced(c.signed_file_id);
    return json(res,200,{ok:true,file:fileMeta(fileId),signed_at:signedAt});
  }

  const contractEmailMatch=pathname.match(/^\/api\/admin\/brand\/([^/]+)\/contract\/email$/);
  if(contractEmailMatch && req.method==='POST'){
    const s=requireAuth(req,res,['admin']); if(!s)return;
    const brandId=contractEmailMatch[1]; const body=await readJson(req); if(!verifyCsrf(req,res,s,body))return;
    const result=await sendContractEmail({brandId,to:body.to});
    return json(res,200,{ok:true,...result});
  }

  if(pathname==='/api/admin/email/test' && req.method==='POST'){
    const s=requireAuth(req,res,['admin']); if(!s)return;
    const body=await readJson(req); if(!verifyCsrf(req,res,s,body))return;
    const result=await sendEmailTest(body.to);
    return json(res,200,{ok:true,...result});
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
  res.writeHead(200,{'Content-Type':mimeByExt(filePath),'Content-Length':st.size,'Cache-Control':noCache?'no-cache':'public, max-age=3600'});
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
  console.log(`\nCarandaí 25 · Portal da Marca v4.7`);
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
