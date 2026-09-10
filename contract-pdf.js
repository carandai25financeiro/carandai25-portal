'use strict';

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const TEMPLATE_PATH = path.join(__dirname, 'contract-template.txt');

function text(v){ return String(v ?? '').trim(); }
function display(v, blank='________________________________________'){ return text(v) || blank; }
function centsBRL(cents){
  const n = Number(cents || 0) / 100;
  if(!Number.isFinite(n) || n <= 0) return 'R$ __________________';
  return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n);
}
function dateBR(value){
  const s=text(value);
  if(!s) return '____/____/________';
  const m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}
function dateLongBR(value){
  const s=text(value);
  if(!s) return '____ de __________________ de ________';
  const m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(!m) return s;
  const months=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  return `${Number(m[3])} de ${months[Number(m[2])-1]} de ${m[1]}`;
}
function safeFileName(v){
  return text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,70) || 'Marca';
}

function parseClauses(template){
  const normalized=template.replace(/\r/g,'').replace(/\s+(CLÁUSULA\s+\d+\s+[–-]\s+)/g,'\n$1').trim();
  const out=[];
  for(const rawLine of normalized.split('\n')){
    const line=rawLine.trim();
    if(!line) continue;
    if(line==='[[CLAUSE12]]'){ out.push({type:'payment'}); continue; }
    const firstSub=line.search(/\s\d+\.\d+\.\s/);
    if(firstSub<0){ out.push({type:'text',heading:'',body:line}); continue; }
    const heading=line.slice(0,firstSub).trim();
    const body=line.slice(firstSub).trim();
    const paras=body
      .replace(/\s+(?=\d+\.\d+\.\s)/g,'\n')
      .replace(/\s+(?=[a-z]\)\s)/g,'\n')
      .split('\n').map(x=>x.trim()).filter(Boolean);
    out.push({type:'clause',heading,paras});
  }
  return out;
}

function normalizePdfText(v){
  return String(v ?? '')
    .replace(/•/g,'-')
    .replace(/[“”]/g,'"')
    .replace(/’/g,"'")
    .replace(/–/g,'-')
    .replace(/\u00a0/g,' ');
}

function buildContractPdfBuffer({brand, terms}){
  return new Promise((resolve,reject)=>{
    try{
      const doc=new PDFDocument({
        size:'A4',
        margins:{top:58,bottom:64,left:56,right:56},
        bufferPages:true,
        info:{
          Title:`Contrato de Participação - Carandaí 25 - ${text(brand.name)}`,
          Author:'Carandaí 25',
          Subject:'Contrato de Participação em Evento e Outras Avenças'
        }
      });
      const chunks=[];
      doc.on('data',c=>chunks.push(c));
      doc.on('error',reject);
      doc.on('end',()=>resolve(Buffer.concat(chunks)));

      const ink='#1d1714';
      const muted='#6f655f';
      const accent='#8a5a32';
      const pageWidth=doc.page.width-doc.page.margins.left-doc.page.margins.right;

      function ensureSpace(h=70){ if(doc.y+h > doc.page.height-doc.page.margins.bottom) doc.addPage(); }
      function h1(s){
        doc.fillColor(ink).font('Times-Bold').fontSize(15).text(normalizePdfText(s),{align:'center'});
        doc.moveDown(.35);
      }
      function sectionHeading(s){
        ensureSpace(50);
        doc.moveDown(.35);
        doc.fillColor(ink).font('Helvetica-Bold').fontSize(9.3).text(normalizePdfText(s),{lineGap:1.2});
        doc.moveDown(.24);
      }
      function para(s, opts={}){
        if(!s) return;
        ensureSpace(34);
        doc.fillColor(ink).font(opts.bold?'Helvetica-Bold':'Helvetica').fontSize(opts.size||8.65)
          .text(normalizePdfText(s),{align:'justify',lineGap:2.25});
        doc.moveDown(opts.after??.34);
      }
      function field(label,value){
        ensureSpace(22);
        doc.fillColor(muted).font('Helvetica-Bold').fontSize(7.7).text(normalizePdfText(label.toUpperCase()),{continued:true});
        doc.fillColor(ink).font('Helvetica').text(`  ${normalizePdfText(display(value))}`);
        doc.moveDown(.18);
      }
      function rule(){
        ensureSpace(16);
        const y=doc.y+2;
        doc.strokeColor('#d8d0c9').lineWidth(.6).moveTo(doc.page.margins.left,y).lineTo(doc.page.width-doc.page.margins.right,y).stroke();
        doc.y=y+9;
      }
      function paymentClause(){
        sectionHeading('CLÁUSULA 12 - DO VALOR E DAS CONDIÇÕES DE PAGAMENTO');
        para(`12.1. Pela participação no evento, a CONTRATANTE pagará à CONTRATADA o valor total do espaço locado de: ${centsBRL(terms.total_cents)}.`);
        para('12.2. O pagamento poderá ser realizado em até 3 (três) parcelas, por boleto bancário ou PIX. As linhas de parcelas não utilizadas poderão permanecer em branco:');
        ensureSpace(100);
        const x=doc.page.margins.left;
        const widths=[105,150,pageWidth-255];
        const rowH=22;
        const rows=[['Parcela','Vencimento','Valor']];
        const inst=Array.isArray(terms.installments)?terms.installments:[];
        for(let i=0;i<3;i++){
          const p=inst[i]||{};
          rows.push([`${i+1}ª parcela`,dateBR(p.due_date),centsBRL(p.amount_cents)]);
        }
        rows.forEach((row,ri)=>{
          const y=doc.y;
          let cx=x;
          row.forEach((cell,ci)=>{
            doc.rect(cx,y,widths[ci],rowH).strokeColor('#c7beb7').lineWidth(.5).stroke();
            if(ri===0) doc.font('Helvetica-Bold').fillColor(ink).fontSize(7.8); else doc.font('Helvetica').fillColor(ink).fontSize(8.1);
            doc.text(normalizePdfText(cell),cx+6,y+7,{width:widths[ci]-12,height:rowH-10,align:ci===0?'left':'center'});
            cx+=widths[ci];
          });
          doc.y=y+rowH;
        });
        doc.moveDown(.45);
        para('12.3. O não pagamento de qualquer parcela até a respectiva data de vencimento acarretará:');
        para('a) multa moratória de 2% sobre o valor em atraso; e');
        para('b) juros de mora de 1% ao mês, calculados proporcionalmente aos dias de atraso.');
        para('12.4. A falta de pagamento poderá, após comunicação à CONTRATANTE, resultar na suspensão ou cancelamento de sua participação caso a pendência não seja regularizada antes do início do evento.');
      }

      // Cabeçalho e identificação das partes
      h1('CONTRATO DE PARTICIPAÇÃO EM EVENTO E OUTRAS AVENÇAS');
      doc.moveDown(.25);
      sectionHeading('CONTRATANTE');
      field('Razão social / Nome empresarial', brand.legal_name || brand.name);
      field('CNPJ', brand.cnpj);
      field('Endereço / sede', brand.address);
      field('Representante', brand.representative || brand.contact_name);
      para('doravante denominada simplesmente CONTRATANTE.');
      rule();
      sectionHeading('CONTRATADA');
      para('TR ACCIOLI PONTES COMÉRCIO E EVENTOS LTDA., pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 13.624.171/0001-33, com endereço na Avenida Afrânio de Melo Franco, nº 290, Loja 302 BCD, 3º Piso, Leblon, Rio de Janeiro/RJ, neste ato representada na forma de seus atos constitutivos, doravante denominada simplesmente CONTRATADA.');
      para('CONTRATANTE e CONTRATADA, quando mencionadas conjuntamente, serão denominadas "Partes". As Partes resolvem celebrar o presente Contrato de Participação em Evento e Outras Avenças, mediante as cláusulas e condições seguintes.');

      const template=fs.readFileSync(TEMPLATE_PATH,'utf8');
      for(const block of parseClauses(template)){
        if(block.type==='payment'){ paymentClause(); continue; }
        if(block.type==='clause'){
          sectionHeading(block.heading);
          for(const p of block.paras) para(p);
        }else if(block.type==='text') para(block.body);
      }

      // Assinaturas
      ensureSpace(220);
      sectionHeading('ASSINATURAS');
      para(`Rio de Janeiro, ${dateLongBR(terms.contract_date)}.`,{after:.9});
      const left=doc.page.margins.left;
      const gap=26;
      const col=(pageWidth-gap)/2;
      const y=doc.y+36;
      doc.strokeColor(ink).lineWidth(.7).moveTo(left,y).lineTo(left+col,y).stroke();
      doc.moveTo(left+col+gap,y).lineTo(left+pageWidth,y).stroke();
      doc.font('Helvetica-Bold').fontSize(8.2).fillColor(ink).text('CONTRATANTE',left,y+8,{width:col,align:'center'});
      doc.font('Helvetica').fontSize(7.8).text(normalizePdfText(brand.legal_name||brand.name),left,y+20,{width:col,align:'center'});
      doc.font('Helvetica-Bold').fontSize(8.2).text('CONTRATADA',left+col+gap,y+8,{width:col,align:'center'});
      doc.font('Helvetica').fontSize(7.6).text('TR ACCIOLI PONTES COMÉRCIO E EVENTOS LTDA.',left+col+gap,y+20,{width:col,align:'center'});
      doc.y=y+68;
      const y2=doc.y+34;
      doc.moveTo(left,y2).lineTo(left+col,y2).stroke();
      doc.moveTo(left+col+gap,y2).lineTo(left+pageWidth,y2).stroke();
      doc.font('Helvetica-Bold').fontSize(8).text('TESTEMUNHA 1',left,y2+8,{width:col,align:'center'});
      doc.font('Helvetica').fontSize(7.6).text('Nome: __________________________\nCPF: ___________________________',left,y2+20,{width:col,align:'center'});
      doc.font('Helvetica-Bold').fontSize(8).text('TESTEMUNHA 2',left+col+gap,y2+8,{width:col,align:'center'});
      doc.font('Helvetica').fontSize(7.6).text('Nome: __________________________\nCPF: ___________________________',left+col+gap,y2+20,{width:col,align:'center'});

      // Rodapé em todas as páginas
      const range=doc.bufferedPageRange();
      for(let i=range.start;i<range.start+range.count;i++){
        doc.switchToPage(i);
        const footerY=doc.page.height-42;
        doc.strokeColor('#d8d0c9').lineWidth(.5).moveTo(doc.page.margins.left,footerY-8).lineTo(doc.page.width-doc.page.margins.right,footerY-8).stroke();
        doc.font('Helvetica').fontSize(7.2).fillColor(muted).text('CARANDAÍ 25 - CONTRATO DE PARTICIPAÇÃO EM EVENTO',doc.page.margins.left,footerY,{width:pageWidth-45,align:'left'});
        doc.text(`Página ${i-range.start+1}`,doc.page.width-doc.page.margins.right-45,footerY,{width:45,align:'right'});
      }

      doc.end();
    }catch(err){ reject(err); }
  });
}

module.exports={buildContractPdfBuffer,safeFileName};
