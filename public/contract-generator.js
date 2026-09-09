// Gerador de Contrato Carandaí 25
// Usa a API do Contractor.com.br para assinatura eletrônica

const ContractGenerator = {
  // Dados da contratada (TR ACCIOLI PONTES)
  CONTRACTOR: {
    name: 'TR ACCIOLI PONTES COMÉRCIO E EVENTOS LTDA.',
    cnpj: '13.624.171/0001-33',
    address: 'Avenida Afrânio de Melo Franco, nº 290, Loja 302 BCD, 3º Piso, Leblon, Rio de Janeiro/RJ',
    email: 'contrato@carandai25.com' // Email para receber assinatura
  },

  EVENT: {
    name: 'CARANDAÍ 25',
    startDate: '05/11/2026',
    endDate: '08/11/2026',
    hours: '13h às 21h',
    location: 'Jockey Club - Tribunas B & C',
    city: 'Rio de Janeiro/RJ',
    value: 6500.00
  },

  // Gera objeto de contrato com dados da marca
  generate(brandData, paymentTerms) {
    return {
      contractorName: brandData.name,
      contractorCnpj: brandData.cnpj,
      contractorAddress: brandData.address,
      contractorRepresentative: brandData.representative || '',
      segment: brandData.segment || '',
      totalValue: brandData.contractValue || this.EVENT.value,
      paymentTerms: paymentTerms || [], // Array com { dueDate, amount, method }
      generatedAt: new Date().toISOString(),
      eventDate: this.EVENT.startDate
    };
  },

  // Formata contrato para texto HTML que será convertido em PDF
  formatAsHTML(contractData) {
    const terms = contractData.paymentTerms
      .map((t, i) => `
        <tr>
          <td>${i + 1}ª parcela</td>
          <td>${t.dueDate}</td>
          <td>R$ ${t.amount.toFixed(2).replace('.', ',')}</td>
          <td>${t.method || 'Boleto/PIX'}</td>
        </tr>
      `)
      .join('');

    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Contrato Carandaí 25</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.5; margin: 20px; color: #333; }
    h1 { text-align: center; font-size: 14px; font-weight: bold; }
    .subtitle { text-align: center; font-size: 13px; margin-bottom: 30px; }
    .section-title { font-weight: bold; margin-top: 20px; margin-bottom: 10px; }
    .section-content { margin-left: 10px; font-size: 12px; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    td, th { border: 1px solid #999; padding: 8px; font-size: 12px; text-align: left; }
    th { background-color: #f0f0f0; font-weight: bold; }
    .signature-area { margin-top: 40px; }
    .signature-line { margin-top: 20px; border-top: 1px solid #000; width: 300px; }
    .data-field { margin: 5px 0; font-size: 12px; }
  </style>
</head>
<body>
  <h1>CARANDAÍ 25 • CONTRATO DE PARTICIPAÇÃO EM EVENTO</h1>
  <div class="subtitle">CONTRATO DE PARTICIPAÇÃO EM EVENTO E OUTRAS AVENÇAS</div>

  <div class="section-title">CONTRATANTE</div>
  <div class="section-content">
    <div class="data-field"><strong>Razão social / Nome empresarial:</strong> ${contractData.contractorName}</div>
    <div class="data-field"><strong>CNPJ:</strong> ${contractData.contractorCnpj}</div>
    <div class="data-field"><strong>Endereço / sede:</strong> ${contractData.contractorAddress}</div>
    <div class="data-field"><strong>Representante:</strong> ${contractData.contractorRepresentative}</div>
    <div class="data-field">doravante denominada simplesmente CONTRATANTE.</div>
  </div>

  <div class="section-title">CONTRATADA</div>
  <div class="section-content">
    <div class="data-field">${this.CONTRACTOR.name}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${this.CONTRACTOR.cnpj}, com endereço na ${this.CONTRACTOR.address}, neste ato representada na forma de seus atos constitutivos, doravante denominada simplesmente CONTRATADA.</div>
  </div>

  <div class="section-title">CLÁUSULA 1 – DO OBJETO</div>
  <div class="section-content">
    <div class="data-field">1.1. O presente Contrato tem por objeto a participação da CONTRATANTE no evento ${this.EVENT.name}, organizado e produzido pela CONTRATADA, mediante disponibilização de espaço destinado à exposição, divulgação e/ou comercialização de seus produtos.</div>
    <div class="data-field">1.2. O evento será realizado nos seguintes termos:</div>
    <table>
      <tr><th>Dados do Evento</th><th>Informação</th></tr>
      <tr><td>Data</td><td>${this.EVENT.startDate} a ${this.EVENT.endDate}</td></tr>
      <tr><td>Horário de funcionamento</td><td>${this.EVENT.hours}</td></tr>
      <tr><td>Local</td><td>${this.EVENT.location}</td></tr>
      <tr><td>Cidade</td><td>${this.EVENT.city}</td></tr>
      <tr><td>Segmento da Marca</td><td>${contractData.segment}</td></tr>
    </table>
  </div>

  <div class="section-title">CLÁUSULA 12 – DO VALOR E DAS CONDIÇÕES DE PAGAMENTO</div>
  <div class="section-content">
    <div class="data-field">12.1. Pela participação no evento, a CONTRATANTE pagará à CONTRATADA o valor total do espaço locado de: <strong>R$ ${contractData.totalValue.toFixed(2).replace('.', ',')}</strong></div>
    <div class="data-field">12.2. O pagamento poderá ser realizado em parcelas, por boleto bancário ou PIX:</div>
    <table>
      <tr><th>Parcela</th><th>Vencimento</th><th>Valor</th><th>Forma de Pagamento</th></tr>
      ${terms}
    </table>
    <div class="data-field" style="margin-top: 10px;">12.3. O não pagamento de qualquer parcela até a respectiva data de vencimento acarretará multa moratória de 2% sobre o valor em atraso e juros de mora de 1% ao mês.</div>
  </div>

  <div class="section-title">ASSINATURAS</div>
  <div class="section-content">
    <div class="data-field">Rio de Janeiro, ${new Date().toLocaleDateString('pt-BR')}.</div>
    
    <div class="signature-area">
      <div class="data-field"><strong>CONTRATANTE</strong></div>
      <div class="signature-line"></div>
      <div class="data-field">${contractData.contractorRepresentative}</div>
    </div>

    <div class="signature-area">
      <div class="data-field"><strong>CONTRATADA</strong></div>
      <div class="data-field">TR ACCIOLI PONTES COMÉRCIO E EVENTOS LTDA.</div>
      <div class="signature-line"></div>
    </div>
  </div>

  <p style="margin-top: 40px; font-size: 11px; text-align: center; color: #666;">
    Este contrato será assinado eletronicamente via plataforma Contractor.com.br
  </p>
</body>
</html>
    `;
  },

  // Envia para plataforma de assinatura
  async sendToContractor(contractData, brandEmail) {
    try {
      // Simula chamada à API do Contractor.com.br
      // Em produção, integrar com API real da plataforma
      const payload = {
        signers: [
          {
            email: brandEmail,
            name: contractData.contractorRepresentative,
            role: 'CONTRATANTE'
          },
          {
            email: this.CONTRACTOR.email,
            name: 'Carandaí 25 - Assinador',
            role: 'CONTRATADA'
          }
        ],
        document: this.formatAsHTML(contractData),
        subject: `Contrato Carandaí 25 - ${contractData.contractorName}`,
        message: `Prezado(a) ${contractData.contractorRepresentative},\n\nSegue em anexo o contrato de participação no evento Carandaí 25 para sua assinatura eletrônica.\n\nPor favor, acesse o link e assine digitalmente.\n\nAtenciosamente,\nEquipe Carandaí 25`
      };

      // Placeholder para integração real
      console.log('Enviando para Contractor.com.br:', payload);
      
      return {
        success: true,
        message: 'Contrato enviado para assinatura eletrônica',
        contractId: 'contract_' + Date.now()
      };
    } catch (error) {
      console.error('Erro ao enviar contrato:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
};

