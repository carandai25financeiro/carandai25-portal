CARANDAI 25 - PORTAL OPERACIONAL DAS MARCAS
Versao 4.3.0 - Rio de Janeiro 2026
GitHub Ready + Railway Ready

ESTA VERSAO JA REUNE AS ALTERACOES PEDIDAS
- Login individual por marca.
- Cada marca ve somente os proprios dados.
- Painel ADMIN para cadastrar e editar marcas.
- Contrato individual com PDF e status.
- Boletos individuais com parcela, valor, vencimento, status e PDF.
- Envio de comprovante de pagamento pela marca.
- Estrutura contratada individual por segmento.
- FOTO/IMAGEM DA ESTRUTURA DO MANUAL para cada segmento:
  * Moda
  * Bem-Estar / Decoracao
  * Bolsas e Sapatos
  * Acessorios
- Checklist de documentos pendentes com upload e aprovacao.
- Mensagens internas por Financeiro, Comercial, Logistica e Marketing.
- Contatos de e-mail configurados.
- Informacoes do evento do Rio de Janeiro.
- Como chegar e acesso de carga.
- Manual do Expositor e Manual Fiscal dentro do portal.
- PWA: instalavel no celular quando publicada com HTTPS.
- Preparado para volume persistente unico /storage no Railway.

CONTATOS CONFIGURADOS
Financeiro: financeiro2@carandai25.com
Marketing: marketing@carandai25.com
Comercial: carandai25comercial@gmail.com
Logistica: carandai25financeiro@gmail.com

DADOS DO EVENTO INCLUIDOS
Carandai 25 - Jockey Club Brasileiro - Tribunas B & C
05 a 08 de novembro de 2026 - 13h as 21h
Montagem: 04/11/2026 - 13h as 19h
Desmontagem: 08/11 apos 21h ate 00h ou 09/11 - 10h as 16h
Carga: entrada exclusivamente pela Rua Jardim Botanico, 971
Carros: Praca Santos Dumont, 31 ou Rua Jardim Botanico, 971

IMAGENS DAS ESTRUTURAS
public/assets/estruturas/estrutura-moda.png
public/assets/estruturas/estrutura-bem-estar-decoracao.png
public/assets/estruturas/estrutura-bolsas-sapatos.png
public/assets/estruturas/estrutura-acessorios.png

IMPORTANTE SOBRE BEM-ESTAR / DECORACAO
A pagina 8 do manual apresenta uma divergencia: o texto informa aparador com 0,45 m de altura e o desenho indica 0,80 m. O portal mostra um aviso para confirmar a medida final com a Logistica.

MANUAIS
public/docs/Manual_do_Expositor_Carandai25.pdf
public/docs/Manual_Fiscal_Expositor_Carandai25.pdf

COMO TESTAR LOCALMENTE NO WINDOWS
1. Instale Node.js 22 ou superior.
2. De dois cliques em START_WINDOWS.bat.
3. Abra http://localhost:3000

ACESSOS LOCAIS DE DEMONSTRACAO
ADMIN
E-mail: admin@carandai25.com
Senha: Admin@2026

MARCA DEMO - MODA
E-mail: demo@marca.com
Senha: Marca@2026

MARCA DEMO - ACESSORIOS
E-mail: acessorios@demo.com
Senha: Marca@2026

NO RAILWAY
Use estas variables:
NODE_ENV=production
PORT=3000
STORAGE_ROOT=/storage
SEED_DEMO=0
ADMIN_PASSWORD=UMA_SENHA_FORTE_QUE_SO_VOCE_SABE

Crie UM Volume e monte exatamente em:
/storage

ATENCAO AO REIMPLANTAR
- Nao apague o Volume /storage do Railway. Ele guarda o banco, contratos, boletos, comprovantes e documentos das marcas.
- Trocar os arquivos do GitHub e fazer novo deploy NAO deve apagar os dados, desde que o mesmo Volume continue conectado ao servico.
- Nao coloque a senha real do ADMIN_PASSWORD dentro do GitHub.

ESTRUTURA TECNICA
- Node.js 22+ sem dependencias externas.
- API REST + servidor HTTP em server.js.
- SQLite via node:sqlite.
- Senhas com scrypt + salt.
- Cookie HttpOnly + SameSite=Lax.
- CSRF nas operacoes de escrita.
- Isolamento de dados por brand_id.
- Uploads privados acessados somente apos autenticacao.
- /api/health para verificacao do Railway.

PARA REIMPLANTAR NO GITHUB
Leia primeiro o arquivo REIMPLANTAR_GITHUB.txt.
