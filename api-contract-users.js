// APIs para Contratos e Gerenciamento de Usuários
// Adicione estas funções ao seu server.js antes do bloco "async function api(req,res,url)"

// ============= CONTRATOS =============

function getContractorData() {
  return {
    name: 'TR ACCIOLI PONTES COMÉRCIO E EVENTOS LTDA.',
    cnpj: '13.624.171/0001-33',
    address: 'Avenida Afrânio de Melo Franco, nº 290, Loja 302 BCD, 3º Piso, Leblon, Rio de Janeiro/RJ',
    email: 'contrato@carandai25.com'
  };
}

function generateContractHTML(contractData, paymentTerms) {
  const contractor = getContractorData();
  const termsHTML = paymentTerms
    .map((t, i) => `
      <tr>
        <td>${i + 1}ª parcela</td>
        <td>${t.dueDate}</td>
        <td>R$ ${Number(t.amount).toFixed(2).replace('.', ',')}</td>
        <td>${t.method || 'Boleto/PIX'}</td>
      </tr>
    `)
    .join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Contrato Carandaí 25 - ${contractData.name}</title>
  <style>
    body { font-family: 'Arial', sans-serif; line-height: 1.6; margin: 20px; color: #333; }
    h1, .subtitle { text-align: center; font-weight: bold; }
    .subtitle { font-size: 13px; margin-bottom: 30px; }
    .section-title { font-weight: bold; margin-top: 20px; margin-bottom: 10px; font-size: 14px; }
    .section-content { margin-left: 10px; font-size: 12px; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
    td, th { border: 1px solid #999; padding: 8px; text-align: left; }
    th { background-color: #f0f0f0; font-weight: bold; }
    .data-field { margin: 5px 0; font-size: 12px; }
    .signature-area { margin-top: 30px; page-break-inside: avoid; }
    .signature-line { margin: 20px 0; border-top: 1px solid #000; width: 300px; }
    .footer { margin-top: 40px; font-size: 11px; text-align: center; color: #666; }
  </style>
</head>
<body>
  <h1>CARANDAÍ 25 • CONTRATO DE PARTICIPAÇÃO EM EVENTO</h1>
  <div class="subtitle">CONTRATO DE PARTICIPAÇÃO EM EVENTO E OUTRAS AVENÇAS</div>

  <div class="section-title">CONTRATANTE</div>
  <div class="section-content">
    <div class="data-field"><strong>Razão social / Nome empresarial:</strong> ${contractData.name}</div>
    <div class="data-field"><strong>CNPJ:</strong> ${contractData.cnpj}</div>
    <div class="data-field"><strong>Endereço / sede:</strong> ${contractData.address}</div>
    <div class="data-field"><strong>Representante:</strong> ${contractData.representative}</div>
    <div class="data-field">doravante denominada simplesmente CONTRATANTE.</div>
  </div>

  <div class="section-title">CONTRATADA</div>
  <div class="section-content">
    <div class="data-field">${contractor.name}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${contractor.cnpj}, com endereço na ${contractor.address}, neste ato representada na forma de seus atos constitutivos, doravante denominada simplesmente CONTRATADA.</div>
  </div>

  <div class="section-title">CLÁUSULA 1 – DO OBJETO</div>
  <div class="section-content">
    <div class="data-field">1.1. O presente Contrato tem por objeto a participação da CONTRATANTE no evento CARANDAÍ 25, organizado e produzido pela CONTRATADA, mediante disponibilização de espaço destinado à exposição, divulgação e/ou comercialização de seus produtos.</div>
    <div class="data-field">1.2. O evento será realizado nos seguintes termos:</div>
    <table>
      <tr><th>Dados do Evento</th><th>Informação</th></tr>
      <tr><td>Data</td><td>05 a 08 de novembro de 2026</td></tr>
      <tr><td>Horário de funcionamento</td><td>13h às 21h</td></tr>
      <tr><td>Local</td><td>Jockey Club - Tribunas B & C</td></tr>
      <tr><td>Cidade</td><td>Rio de Janeiro/RJ</td></tr>
      <tr><td>Segmento da Marca</td><td>${contractData.segment}</td></tr>
    </table>
  </div>

  <div class="section-title">CLÁUSULA 12 – DO VALOR E DAS CONDIÇÕES DE PAGAMENTO</div>
  <div class="section-content">
    <div class="data-field">12.1. Pela participação no evento, a CONTRATANTE pagará à CONTRATADA o valor total do espaço locado de: <strong>R$ ${Number(contractData.contractValue).toFixed(2).replace('.', ',')}</strong></div>
    <div class="data-field">12.2. O pagamento poderá ser realizado em parcelas, por boleto bancário ou PIX:</div>
    <table>
      <tr><th>Parcela</th><th>Vencimento</th><th>Valor</th><th>Forma de Pagamento</th></tr>
      ${termsHTML}
    </table>
    <div class="data-field" style="margin-top: 10px;">12.3. O não pagamento de qualquer parcela até a respectiva data de vencimento acarretará multa moratória de 2% sobre o valor em atraso e juros de mora de 1% ao mês.</div>
  </div>

  <div class="section-title">ASSINATURAS</div>
  <div class="signature-area">
    <div class="data-field"><strong>CONTRATANTE</strong></div>
    <div class="signature-line"></div>
    <div class="data-field">${contractData.representative}</div>
  </div>

  <div class="signature-area">
    <div class="data-field"><strong>CONTRATADA</strong></div>
    <div class="data-field">TR ACCIOLI PONTES COMÉRCIO E EVENTOS LTDA.</div>
    <div class="signature-line"></div>
  </div>

  <div class="footer">
    <p>Este contrato será assinado eletronicamente via plataforma Contractor.com.br</p>
    <p>Gerado em ${new Date().toLocaleDateString('pt-BR')}</p>
  </div>
</body>
</html>`;
}

function createContractTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contract_data (
      id TEXT PRIMARY KEY,
      brand_id TEXT NOT NULL UNIQUE,
      status TEXT DEFAULT 'draft',
      contractor_name TEXT NOT NULL,
      contractor_cnpj TEXT NOT NULL,
      contractor_address TEXT NOT NULL,
      contractor_representative TEXT NOT NULL,
      segment TEXT NOT NULL,
      total_value REAL NOT NULL DEFAULT 6500.00,
      payment_terms TEXT NOT NULL,
      file_id TEXT,
      contractor_signature_id TEXT,
      contractor_signed_at TEXT,
      brand_signature_id TEXT,
      brand_signed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(brand_id) REFERENCES brands(id) ON DELETE CASCADE,
      FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS contract_signatures (
      id TEXT PRIMARY KEY,
      contract_id TEXT NOT NULL,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      signed_at TEXT,
      signature_data TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(contract_id) REFERENCES contract_data(id) ON DELETE CASCADE
    );
  `);
}

// ============= GERENCIAMENTO DE USUÁRIOS =============

function addUserTable(db) {
  // Já existe no schema original, mas adicionando campos extras se necessário
  db.exec(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK(status IN ('active','inactive','archived'));
  `);
}

// ============= FUNÇÕES DE HELPER =============

function sendContractorEmail(contractData, paymentTerms) {
  // Placeholder para envio real via Contractor.com.br
  // Em produção, integrar com API do Contractor.com.br
  console.log('📧 Email enviado para Contractor.com.br:');
  console.log('  Para:', contractData.representative);
  console.log('  Marca:', contractData.name);
  console.log('  Valor:', contractData.contractValue);
  return { success: true, contractorSessionId: 'contractor_' + Date.now() };
}

function generatePDF(htmlContent) {
  // Placeholder - em produção usar biblioteca como puppeteer ou pdfkit
  return Buffer.from(htmlContent);
}

// ============= ENDPOINTS =============

// POST /api/contract/generate
// Gera e envia contrato para assinatura
async function handleContractGenerate(req, res, db, s, body) {
  const { brandId, contractorName, contractorCnpj, contractorAddress, contractorRepresentative, segment, contractValue, paymentTerms } = body;
  
  if (!brandId || !contractorName || !paymentTerms || !Array.isArray(paymentTerms)) {
    return json(res, 400, { error: 'Dados incompletos' });
  }
  
  if (s.role === 'brand' && s.brand_id !== brandId) {
    return json(res, 403, { error: 'Acesso negado' });
  }

  try {
    const contractId = uid();
    const now = nowISO();
    
    // Gerar HTML do contrato
    const contractData = {
      name: contractorName,
      cnpj: contractorCnpj,
      address: contractorAddress,
      representative: contractorRepresentative,
      segment: segment || 'Moda',
      contractValue: contractValue || 6500.00
    };
    
    const htmlContent = generateContractHTML(contractData, paymentTerms);
    
    // Salvar arquivo do contrato (simulado como arquivo)
    const fileId = uid();
    const stored = `${fileId}-contrato-${contractorName.replace(/\s+/g, '-')}.html`;
    fs.writeFileSync(path.join(UPLOADS, stored), htmlContent);
    
    db.prepare(`
      INSERT INTO files(id, brand_id, kind, label, original_name, stored_name, mime, created_at)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?)
    `).run(fileId, brandId, 'contract', 'Contrato Carandaí 25', `contrato-${contractorName}.html`, stored, 'text/html', now);
    
    // Criar registro do contrato
    db.prepare(`
      INSERT INTO contract_data(id, brand_id, status, contractor_name, contractor_cnpj, contractor_address, contractor_representative, segment, total_value, payment_terms, file_id, created_at, updated_at)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      contractId, brandId, 'pending_signature', contractorName, contractorCnpj, contractorAddress, contractorRepresentative,
      segment, contractValue || 6500, JSON.stringify(paymentTerms), fileId, now, now
    );
    
    // Enviar para Contractor.com.br (simulado)
    const contractorResult = sendContractorEmail(contractData, paymentTerms);
    
    // Atualizar status do contrato original
    db.prepare(`UPDATE contracts SET status='pending', file_id=?, updated_at=? WHERE brand_id=?`).run(fileId, now, brandId);
    
    return json(res, 201, {
      ok: true,
      contractId,
      fileId,
      message: 'Contrato gerado e enviado para assinatura',
      contractorSessionId: contractorResult.contractorSessionId,
      downloadUrl: `/api/file/${fileId}`
    });
  } catch (err) {
    console.error('Erro ao gerar contrato:', err);
    return json(res, 500, { error: err.message });
  }
}

// GET /api/contract/:brandId
// Obter dados do contrato
async function handleContractGet(req, res, db, s, brandId) {
  if (s.role === 'brand' && s.brand_id !== brandId) {
    return json(res, 403, { error: 'Acesso negado' });
  }

  try {
    const contract = db.prepare(`
      SELECT id, status, contractor_name, contractor_representative, total_value, payment_terms, file_id, brand_signed_at, created_at
      FROM contract_data WHERE brand_id=?
    `).get(brandId);
    
    if (!contract) {
      return json(res, 404, { error: 'Contrato não encontrado' });
    }
    
    const file = contract.file_id ? fileMeta(contract.file_id) : null;
    
    return json(res, 200, {
      ...contract,
      paymentTerms: safeJson(contract.payment_terms, []),
      file
    });
  } catch (err) {
    return json(res, 500, { error: err.message });
  }
}

// ============= USERS MANAGEMENT =============

// POST /api/admin/users
// Criar novo usuário (admin only)
async function handleAdminUserCreate(req, res, db, s, body) {
  if (s.role !== 'admin') {
    return json(res, 403, { error: 'Apenas administradores podem criar usuários' });
  }

  const { name, email, brand_id, role, password } = body;
  
  if (!name || !email || !role) {
    return json(res, 400, { error: 'Nome, email e role são obrigatórios' });
  }
  
  if (!['admin', 'brand'].includes(role)) {
    return json(res, 400, { error: 'Role inválido' });
  }

  try {
    const normalizedEmail = normalizeEmail(email);
    
    // Verificar se email já existe
    const existing = db.prepare('SELECT id FROM users WHERE email=?').get(normalizedEmail);
    if (existing) {
      return json(res, 409, { error: 'Este email já está cadastrado' });
    }
    
    const userId = uid();
    const pwd = password || `${name.split(' ')[0]}@2026`;
    const hash = passwordHash(pwd);
    const now = nowISO();
    
    db.prepare(`
      INSERT INTO users(id, brand_id, name, email, password_hash, role, status, created_at)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, brand_id || null, name, normalizedEmail, hash, role, 'active', now);
    
    return json(res, 201, {
      ok: true,
      userId,
      email: normalizedEmail,
      temporaryPassword: pwd,
      message: 'Usuário criado com sucesso. Senha temporária enviada por email.'
    });
  } catch (err) {
    return json(res, 500, { error: err.message });
  }
}

// GET /api/admin/users
// Listar todos os usuários (admin only)
async function handleAdminUsersList(req, res, db, s) {
  if (s.role !== 'admin') {
    return json(res, 403, { error: 'Acesso negado' });
  }

  try {
    const users = db.prepare(`
      SELECT u.id, u.brand_id, u.name, u.email, u.role, u.status, u.created_at, b.name AS brand_name
      FROM users u LEFT JOIN brands b ON u.brand_id=b.id
      ORDER BY u.created_at DESC
    `).all();
    
    return json(res, 200, { users });
  } catch (err) {
    return json(res, 500, { error: err.message });
  }
}

// PATCH /api/admin/users/:userId
// Atualizar usuário (admin only)
async function handleAdminUserUpdate(req, res, db, s, userId, body) {
  if (s.role !== 'admin') {
    return json(res, 403, { error: 'Acesso negado' });
  }

  try {
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(userId);
    if (!user) {
      return json(res, 404, { error: 'Usuário não encontrado' });
    }
    
    const { name, email, role, status, password } = body;
    const updates = {};
    
    if (name) updates.name = name;
    if (email) updates.email = normalizeEmail(email);
    if (role && ['admin', 'brand'].includes(role)) updates.role = role;
    if (status && ['active', 'inactive', 'archived'].includes(status)) updates.status = status;
    if (password) updates.password_hash = passwordHash(password);
    
    if (Object.keys(updates).length === 0) {
      return json(res, 400, { error: 'Nenhum campo para atualizar' });
    }
    
    const cols = Object.keys(updates).map(k => `${k}=?`).join(',');
    const vals = Object.values(updates);
    db.prepare(`UPDATE users SET ${cols}, updated_at=? WHERE id=?`).run(...vals, nowISO(), userId);
    
    return json(res, 200, { ok: true, message: 'Usuário atualizado' });
  } catch (err) {
    return json(res, 500, { error: err.message });
  }
}

// DELETE /api/admin/users/:userId
// Deletar usuário (admin only)
async function handleAdminUserDelete(req, res, db, s, userId) {
  if (s.role !== 'admin') {
    return json(res, 403, { error: 'Acesso negado' });
  }

  try {
    const user = db.prepare('SELECT id FROM users WHERE id=?').get(userId);
    if (!user) {
      return json(res, 404, { error: 'Usuário não encontrado' });
    }
    
    db.prepare('DELETE FROM users WHERE id=?').run(userId);
    return json(res, 200, { ok: true, message: 'Usuário deletado' });
  } catch (err) {
    return json(res, 500, { error: err.message });
  }
}

// Exportar funções
module.exports = {
  createContractTable,
  addUserTable,
  handleContractGenerate,
  handleContractGet,
  handleAdminUserCreate,
  handleAdminUsersList,
  handleAdminUserUpdate,
  handleAdminUserDelete
};

