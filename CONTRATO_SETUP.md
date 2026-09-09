# 📋 Carandaí 25 - Sistema de Envio de Contrato Digital

## 🎯 Funcionalidade

Permitir que o Comercial envie o Contrato de Participação para as marcas assinarem digitalmente via **www.contractktor.com.br**.

---

## 📊 Fluxo Completo

```
┌─────────────────┐
│  Comercial      │
│  Envia          │
│  Contrato       │
└────────┬────────┘
         │
         ↓
┌──────────────────────────────┐
│ Marca Recebe Email            │
│ com Link Contractktor         │
└────────┬─────────────────────┘
         │
         ↓
┌──────────────────────────────┐
│ Marca Acessa www.contractktor │
│ Revisa & Assina Digitalmente  │
└────────┬─────────────────────┘
         │
         ↓
┌──────────────────────────────┐
│ Webhook Notifica Portal       │
│ Status atualizado             │
└────────┬─────────────────────┘
         │
         ↓
┌──────────────────────────────┐
│ Email Confirmação Enviado     │
│ (para marca + comercial)      │
└──────────────────────────────┘
```

---

## 🔧 Implementação (Backend)

### 1. Handler do Contrato
Arquivo: `server.js.contract-handler`

**Funções principais:**
```javascript
POST /api/contract/send
  → Envia contrato para marca assinar

GET /api/contract/:brandId/status
  → Verifica status da assinatura

POST /api/contract/webhook/contractktor
  → Recebe notificação de assinatura (webhook)
```

### 2. Template de Email
Arquivo: `email-templates/contract-send.html`

**Componentes:**
- ✅ Header com branding Carandaí 25
- ✅ Informações do evento
- ✅ Timeline das próximas etapas
- ✅ Botão CTA "Assinar Contrato"
- ✅ Detalhes do contrato
- ✅ Informações de contato

### 3. Banco de Dados (SQLite)
Tabela: `contracts`

```sql
CREATE TABLE contracts (
  id INTEGER PRIMARY KEY,
  brand_id TEXT UNIQUE,
  email TEXT,
  brand_name TEXT,
  cnpj TEXT,
  segment TEXT,
  value TEXT,
  furniture TEXT,
  contractktor_link TEXT,
  status TEXT (pending_signature|signed|rejected|expired),
  signatures JSON,
  document_url TEXT,
  sent_at DATETIME,
  signed_at DATETIME,
  created_at DATETIME,
  updated_at DATETIME
);
```

---

## 🌐 Integração Frontend (Portal)

### Admin View: Envio de Contrato
Novo botão no painel de marcas:

```javascript
// Na página /admin/brands/<brand_id>
function viewAdminBrand() {
  // ... código existente ...
  
  // Novo botão de ação
  const sendContractBtn = `
    <button class="btn btn-dark" id="sendContractBtn">
      📋 Enviar Contrato para Assinatura
    </button>
  `;
  
  $('#sendContractBtn')?.addEventListener('click', () => {
    openSendContractModal(state.brandDetail);
  });
}

function openSendContractModal(brand) {
  openModal(`
    ${modalHead('Enviar Contrato para Assinatura', 'COMERCIAL')}
    <form id="sendContractForm" class="form-grid">
      
      <div class="field full">
        <label>Email da Marca</label>
        <input type="email" id="contractEmail" value="${brand.contact_email}" required>
      </div>
      
      <div class="field full">
        <label>Segmento</label>
        <input type="text" id="contractSegment" value="${brand.segment}" readonly>
      </div>
      
      <div class="field full">
        <label>Valor Total (R$)</label>
        <input type="number" id="contractValue" value="6500.00" required>
      </div>
      
      <div class="field full">
        <label>Verificação</label>
        <label style="display: flex; gap: 8px; font-weight: 400;">
          <input type="checkbox" id="confirmContractDetails" required>
          Confirmo que os dados acima estão corretos
        </label>
      </div>
      
      <div class="field full">
        <button type="submit" class="btn btn-dark">
          📤 Enviar Contrato via Email
        </button>
      </div>
    </form>
  `);

  $('#sendContractForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await sendContractAPI(brand.id);
  });
}

async function sendContractAPI(brandId) {
  try {
    const r = await api('/api/contract/send', {
      method: 'POST',
      body: {
        brandId,
        email: $('#contractEmail').value,
        brandName: state.brandDetail.brand.name,
        cnpj: state.brandDetail.brand.cnpj,
        segment: $('#contractSegment').value,
        contractValue: parseFloat($('#contractValue').value),
        furniture: getFurnitureForSegment($('#contractSegment').value)
      }
    });
    
    closeModal();
    toast(`✅ Contrato enviado para ${r.email}`);
    
    // Atualizar status na página
    await navigate('admin-brand', state.brandDetail.brand.id);
    
  } catch (err) {
    showError(err);
  }
}
```

### Brand View: Status do Contrato
Novo card na página inicial da marca:

```javascript
function viewHome() {
  // ... código existente ...
  
  // Verificar se há contrato pendente
  const contractStatus = d.contract?.status; // pending_signature, signed, rejected
  
  if (contractStatus === 'pending_signature') {
    contractCard = `
      <div class="card" style="border-left: 4px solid #f0642d;">
        <span class="label">⏳ AÇÃO NECESSÁRIA</span>
        <h3>Contrato Aguardando Assinatura</h3>
        <p>Você recebeu um contrato para revisar e assinar digitalmente via Contractktor.</p>
        <div class="inline-actions">
          <a href="${d.contract.contractktor_link}" class="btn btn-dark" target="_blank">
            🔐 Assinar Contrato
          </a>
        </div>
      </div>
    `;
  } else if (contractStatus === 'signed') {
    contractCard = `
      <div class="card" style="border-left: 4px solid #16704e;">
        <span class="label">✅ CONCLUÍDO</span>
        <h3>Contrato Assinado</h3>
        <p>Seu contrato foi assinado em ${fmtDateTime(d.contract.signed_at)}.</p>
        <div class="inline-actions">
          <a href="${d.contract.document_url}" class="btn btn-small" target="_blank">
            📄 Baixar Contrato
          </a>
        </div>
      </div>
    `;
  }
}
```

---

## 🚀 Configuração (Environment Variables)

Adicionar ao `.env`:

```env
# Contractktor Integration
CONTRACTKTOR_API_KEY=seu_chave_api_aqui
CONTRACTKTOR_ACCOUNT_ID=seu_account_id_aqui
CONTRACTKTOR_WEBHOOK_SECRET=seu_webhook_secret_aqui

# Email Configuration
SMTP_HOST=smtp.seuservidor.com
SMTP_PORT=587
SMTP_USER=seu_email@carandai25.com
SMTP_PASS=sua_senha_aqui

# Verification
CONTRACTKTOR_VERIFY_WEBHOOK=true
```

---

## 📧 Emails Automáticos

### 1. Email de Envio (para Marca)
**Subject:** 🎉 Carandaí 25 - Contrato de Participação para Assinatura Digital

**Conteúdo:**
- ✅ Dados do evento (data, local, horário)
- ✅ Valor total
- ✅ Próximas etapas
- ✅ Botão "Assinar Contrato" (link Contractktor)
- ✅ Informações de contato

**Arquivo:** `email-templates/contract-send.html`

### 2. Email de Confirmação (para Marca)
**Subject:** ✅ Contrato Assinado - Carandaí 25

Enviado automaticamente após assinatura via webhook.

### 3. Email de Notificação (para Comercial + Financeiro)
**Subject:** 📋 Contrato Assinado: [Nome da Marca]

Enviado para:
- carandai25comercial@gmail.com
- financeiro2@carandai25.com
- cc: ops@carandai25.com

---

## 🔌 Webhook do Contractktor

### Setup
1. Acessar www.contractktor.com.br
2. Settings → Webhooks
3. Adicionar novo webhook:
   - **URL:** `https://portal.carandai25.com/api/contract/webhook/contractktor`
   - **Events:** contract.signed, contract.rejected
   - **Secret:** `CONTRACTKTOR_WEBHOOK_SECRET`

### Payload Esperado
```json
{
  "contractId": "brand-uuid",
  "status": "signed",
  "signatures": [
    {
      "email": "marca@email.com",
      "signedAt": "2026-10-20T15:30:00Z",
      "signatureUrl": "..."
    }
  ],
  "documentUrl": "https://contractktor.com.br/doc/...",
  "signedAt": "2026-10-20T15:30:00Z"
}
```

---

## 🧪 Testes

### Teste Manual
1. **Admin → Marcas**
2. **Selecionar marca**
3. **Clique no botão "Enviar Contrato"**
4. **Preencher email e valor**
5. **Confirmar**
6. **Verificar email da marca**
7. **Clicar no link Contractktor**
8. **Revisar e assinar contrato**
9. **Verificar notificação no portal**

### Teste de Webhook
```bash
# Mock webhook para testes
curl -X POST https://portal.carandai25.com/api/contract/webhook/contractktor \
  -H "Content-Type: application/json" \
  -d '{
    "contractId": "test-brand-id",
    "status": "signed",
    "signatures": [{"email": "test@email.com"}],
    "documentUrl": "https://example.com/doc.pdf",
    "signedAt": "2026-10-20T15:30:00Z"
  }'
```

---

## 📊 Monitoramento

### Métricas a Rastrear
- Contratos enviados por dia
- Taxa de assinatura (% de marcas que assinam)
- Tempo médio para assinatura
- Contratos rejeitados

### Queries SQL

```sql
-- Contratos pendentes
SELECT * FROM contracts 
WHERE status = 'pending_signature' 
AND created_at > date('now', '-7 days')
ORDER BY created_at DESC;

-- Taxa de assinatura
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN status='signed' THEN 1 ELSE 0 END) as signed,
  ROUND(SUM(CASE WHEN status='signed' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as percentage
FROM contracts
WHERE created_at > date('now', '-30 days');

-- Tempo médio para assinatura
SELECT 
  AVG(CAST((julianday(signed_at) - julianday(sent_at)) * 24 AS INTEGER)) as avg_hours
FROM contracts
WHERE status='signed'
AND signed_at IS NOT NULL;
```

---

## ✅ Checklist de Implementação

- [ ] Backend: Handler de contrato implementado
- [ ] Backend: Templates de email criados
- [ ] Backend: Banco de dados configurado
- [ ] Frontend: Botão de envio no admin
- [ ] Frontend: Modal de envio implementado
- [ ] Frontend: Card de status no portal da marca
- [ ] Contractktor: Integração de API configurada
- [ ] Contractktor: Webhook configurado
- [ ] Email: SMTP configurado e testado
- [ ] Testes: Manual em todas as plataformas
- [ ] Documentação: Users guide criado
- [ ] Monitoring: Dashboards configuradas

---

## 📞 Support

**Dúvidas sobre Contractktor?**
- Site: www.contractktor.com.br
- Email: suporte@contractktor.com.br
- Docs: https://docs.contractktor.com.br

**Dúvidas sobre implementação?**
- Tech Lead: tech@carandai25.com
- Comercial: carandai25comercial@gmail.com

---

**Versão:** 1.0  
**Data:** 09 de setembro de 2026  
**Status:** 🚀 Pronto para Implementação


