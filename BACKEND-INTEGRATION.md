# Integração Backend - Contratos e Usuários

## 📋 Sumário

Este documento descreve como integrar as novas APIs de contratos e gerenciamento de usuários ao seu servidor `server.js`.

## 🚀 Instalação

### 1. Copiar o arquivo de APIs

O arquivo `api-contract-users.js` contém todas as funções necessárias. Copie para a raiz do projeto.

### 2. Integrar no server.js

No topo do arquivo `server.js`, adicione:

```javascript
// Importar funções de contrato e usuários
const { 
  createContractTable, 
  addUserTable,
  handleContractGenerate,
  handleContractGet,
  handleAdminUserCreate,
  handleAdminUsersList,
  handleAdminUserUpdate,
  handleAdminUserDelete
} = require('./api-contract-users.js');
```

### 3. Inicializar tabelas

Após `initSchema()` e `seed()`, adicione:

```javascript
initSchema();
createContractTable(db);     // Criar tabela de contratos
addUserTable(db);            // Adicionar campos de usuários
seed();
```

### 4. Adicionar rotas à função `api()`

Dentro da função `api(req,res,url)`, após o bloco de `/api/me`, adicione:

```javascript
  // ===== CONTRATOS =====
  
  if(pathname==='/api/contract/generate' && req.method==='POST'){
    const s=requireAuth(req,res,['brand','admin']); if(!s)return;
    try{
      const body=await readJson(req); if(!verifyCsrf(req,res,s,body))return;
      return handleContractGenerate(req,res,db,s,body);
    }catch(err){return json(res,500,{error:err.message});}
  }

  if(pathname.startsWith('/api/contract/') && req.method==='GET'){
    const s=requireAuth(req,res); if(!s)return;
    const brandId=pathname.split('/')[3];
    return handleContractGet(req,res,db,s,brandId);
  }

  // ===== GERENCIAMENTO DE USUÁRIOS (ADMIN) =====

  if(pathname==='/api/admin/users' && req.method==='POST'){
    const s=requireAuth(req,res,['admin']); if(!s)return;
    try{
      const body=await readJson(req); if(!verifyCsrf(req,res,s,body))return;
      return handleAdminUserCreate(req,res,db,s,body);
    }catch(err){return json(res,500,{error:err.message});}
  }

  if(pathname==='/api/admin/users' && req.method==='GET'){
    const s=requireAuth(req,res,['admin']); if(!s)return;
    return handleAdminUsersList(req,res,db,s);
  }

  if(pathname.startsWith('/api/admin/users/') && req.method==='PATCH'){
    const s=requireAuth(req,res,['admin']); if(!s)return;
    const userId=pathname.split('/')[4];
    try{
      const body=await readJson(req); if(!verifyCsrf(req,res,s,body))return;
      return handleAdminUserUpdate(req,res,db,s,userId,body);
    }catch(err){return json(res,500,{error:err.message});}
  }

  if(pathname.startsWith('/api/admin/users/') && req.method==='DELETE'){
    const s=requireAuth(req,res,['admin']); if(!s)return;
    const userId=pathname.split('/')[4];
    return handleAdminUserDelete(req,res,db,s,userId);
  }
```

## 📡 Endpoints

### Contratos

#### `POST /api/contract/generate`
Gera e envia contrato para assinatura.

**Headers:**
- `X-CSRF-Token`: Token CSRF da sessão
- `Content-Type: application/json`

**Body:**
```json
{
  "brandId": "uuid-da-marca",
  "contractorName": "RAZÃO SOCIAL DA MARCA",
  "contractorCnpj": "00.000.000/0001-00",
  "contractorAddress": "Endereço completo",
  "contractorRepresentative": "Nome do Representante",
  "segment": "Moda",
  "contractValue": 6500.00,
  "paymentTerms": [
    {
      "dueDate": "30/08/2026",
      "amount": 3250.00,
      "method": "Boleto/PIX"
    },
    {
      "dueDate": "15/10/2026",
      "amount": 3250.00,
      "method": "Boleto/PIX"
    }
  ]
}
```

**Response (201):**
```json
{
  "ok": true,
  "contractId": "uuid",
  "fileId": "uuid",
  "message": "Contrato gerado e enviado para assinatura",
  "downloadUrl": "/api/file/uuid"
}
```

#### `GET /api/contract/:brandId`
Obter dados do contrato de uma marca.

**Response (200):**
```json
{
  "id": "uuid",
  "status": "pending_signature",
  "contractor_name": "MARCA",
  "contractor_representative": "Nome",
  "total_value": 6500.00,
  "payment_terms": [...],
  "file": { "id": "uuid", "original_name": "..." },
  "brand_signed_at": null
}
```

### Gerenciamento de Usuários (Admin Only)

#### `POST /api/admin/users`
Criar novo usuário.

**Body:**
```json
{
  "name": "Nome do Usuário",
  "email": "usuario@example.com",
  "role": "brand",
  "brand_id": "uuid-opcional",
  "password": "senha-opcional"
}
```

**Response (201):**
```json
{
  "ok": true,
  "userId": "uuid",
  "email": "usuario@example.com",
  "temporaryPassword": "SenhaTemporaria@2026"
}
```

#### `GET /api/admin/users`
Listar todos os usuários.

**Response (200):**
```json
{
  "users": [
    {
      "id": "uuid",
      "name": "Nome",
      "email": "email@example.com",
      "role": "admin",
      "status": "active",
      "brand_name": null,
      "created_at": "2026-09-09T..."
    }
  ]
}
```

#### `PATCH /api/admin/users/:userId`
Atualizar usuário.

**Body:**
```json
{
  "name": "Novo Nome",
  "email": "novoemail@example.com",
  "role": "admin",
  "status": "active",
  "password": "novaSenha@2026"
}
```

#### `DELETE /api/admin/users/:userId`
Deletar usuário.

## 🔗 Integração Frontend

No `app.js`, a função `generateContractModal()` já faz a requisição para `POST /api/contract/generate`.

Para o gerenciador de usuários no admin, adicione um novo menu e página:

```javascript
// No setShell() para admin:
['admin-users','Usuários','04']

// Na função navigate():
else if(view==='admin-users') viewAdminUsers();

// Criar função:
function viewAdminUsers(){
  // Listar usuários e permitir criar/editar/deletar
}
```

## 📝 Notas Importantes

1. **Contractor.com.br**: Atualmente a integração está simulada (`sendContractorEmail`). Para integração real:
   - Obter credenciais API do Contractor.com.br
   - Implementar chamada real na função `sendContractorEmail()`
   - Configurar webhooks para sincronizar assinaturas

2. **Email de Notificação**: Adicionar envio de email quando contrato é gerado:
   - Usar serviço como Nodemailer, SendGrid ou AWS SES
   - Notificar marca sobre contrato pendente de assinatura

3. **Segurança**:
   - CSRF token obrigatório em todas as mutações
   - Validações de permissão já implementadas
   - Hash de senha com scrypt

4. **Storage**: Contratos são salvos em `/uploads` como arquivos HTML. Para produção, considere:
   - Converter para PDF (usar puppeteer ou pdfkit)
   - Armazenar em S3/Cloud Storage ao invés de filesystem

## ✅ Checklist de Implementação

- [ ] Copiar `api-contract-users.js`
- [ ] Importar funções no `server.js`
- [ ] Inicializar tabelas (`createContractTable`, `addUserTable`)
- [ ] Adicionar rotas na função `api()`
- [ ] Testar endpoints com Postman ou curl
- [ ] Implementar UI de gerenciador de usuários
- [ ] Integrar Contractor.com.br real
- [ ] Configurar envio de emails
- [ ] Deploy em produção

