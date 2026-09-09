# 🧪 Checklist de Testes Carandaí 25 Portal v4.4.0

## 📱 Testes por Plataforma

### 1️⃣ Android (Chrome, Firefox, Samsung Internet)
**Dispositivo de Teste:** Samsung Galaxy / Pixel / Emulador
**Versão Mínima:** Android 8.0

#### Login & Autenticação
- [ ] Página de login carrega sem erros
- [ ] Login com email/senha funciona
- [ ] Após login, página transiciona para dashboard (sem travamento)
- [ ] Logout funciona corretamente
- [ ] Session persiste após refresh

#### PWA Installation
- [ ] Chrome: Menu → "Instalar app" funciona
- [ ] Firefox: Consegue adicionar à home screen
- [ ] Samsung Internet: Opção de instalação aparece
- [ ] Ícone aparece na home screen com nome correto
- [ ] App abre em modo fullscreen standalone

#### Performance
- [ ] Login page carrega em < 2 segundos
- [ ] Dashboard carrega em < 3 segundos
- [ ] Imagens de estrutura aparecem sem delay
- [ ] Scroll é suave (60fps)
- [ ] Não há memory leaks ao navegar

#### Offline Functionality
- [ ] App funciona com internet desligada (páginas já visitadas)
- [ ] Mensagem clara quando offline
- [ ] Sincroniza quando voltar online
- [ ] Cache de 24h para imagens está funcionando

---

### 2️⃣ iOS (Safari, Chrome)
**Dispositivo de Teste:** iPhone / iPad (iOS 12+)

#### Login & Autenticação
- [ ] Página de login carrega sem erros
- [ ] Login com email/senha funciona
- [ ] Após login, página transiciona para dashboard (sem travamento)
- [ ] Teclado não interfere com layout
- [ ] Logout funciona corretamente

#### PWA Installation
- [ ] Safari: Share → "Adicionar à Tela de Início" funciona
- [ ] Chrome para iOS: Menu → "Install app" funciona
- [ ] App abre com splash screen personalizado
- [ ] Ícone de 192x192px aparece correto
- [ ] Status bar é dark-translucent conforme esperado

#### Performance
- [ ] Login page carrega em < 2 segundos
- [ ] Dashboard carrega em < 3 segundos
- [ ] Imagens aparecem sem delay significativo
- [ ] Scroll é suave
- [ ] Battery drain normal (não excessivo)

#### Offline Functionality
- [ ] App funciona offline (cached)
- [ ] Service Worker instalado
- [ ] Sync automático quando voltar online
- [ ] Cache headers respeitados (24h para images)

---

### 3️⃣ Windows (Edge, Chrome, Firefox)
**Dispositivo de Teste:** Windows 10/11 Desktop/Laptop

#### Login & Autenticação
- [ ] Página de login carrega sem erros
- [ ] Login com email/senha funciona
- [ ] Após login, página transiciona para dashboard
- [ ] Keyboard shortcuts funcionam
- [ ] Session persiste após fechar abas

#### PWA Installation
- [ ] Edge: Menu → "Instalar este site como um app" funciona
- [ ] Chrome: Menu → "Install app" funciona
- [ ] Firefox: "Install as app" funciona
- [ ] App abre em janela separada
- [ ] Tile do Windows criado com cor correta (#111111)
- [ ] Start menu mostra ícone da app

#### Performance
- [ ] Login page carrega em < 1.5 segundos
- [ ] Dashboard carrega em < 2 segundos
- [ ] Estrutura images 650px renderizam suave
- [ ] Crisp-edges rendering visível e nítido
- [ ] CPU/RAM não espike (< 150MB)

#### Offline Functionality
- [ ] App funciona offline
- [ ] Cache de 24h respeitado
- [ ] Sync funciona quando voltar online
- [ ] Dados persistem entre sessões

---

### 4️⃣ macOS (Safari, Chrome, Firefox)
**Dispositivo de Teste:** MacBook / iMac (macOS 10.13+)

#### Login & Autenticação
- [ ] Página de login carrega sem erros
- [ ] Login com email/senha funciona
- [ ] Após login, página transiciona para dashboard
- [ ] Cmd+Q fecha app corretamente
- [ ] Session persiste

#### PWA Installation
- [ ] Safari: File → "Add to Dock" funciona
- [ ] Chrome: Menu → "Install app" funciona
- [ ] Firefox: "Install as app" funciona
- [ ] App abre com icon personalizado
- [ ] Aparece no Dock e Applications

#### Performance
- [ ] Login page carrega em < 1.5 segundos
- [ ] Dashboard carrega em < 2 segundos
- [ ] Retina display: imagens nítidas
- [ ] Crisp-edges rendering ótimo em alta resolução
- [ ] Fan/processador não aquece excessivamente

#### Offline Functionality
- [ ] App funciona offline
- [ ] Cache persiste entre sessões
- [ ] Sync automático online
- [ ] Dados seguros (HTTPS)

---

### 5️⃣ Linux (Chrome, Firefox, Edge)
**Dispositivo de Teste:** Ubuntu / Fedora / Debian

#### Login & Autenticação
- [ ] Página de login carrega sem erros
- [ ] Login com email/senha funciona
- [ ] Após login, página transiciona para dashboard
- [ ] Logout funciona
- [ ] Session persiste

#### PWA Installation
- [ ] Chrome: Menu → "Install app" funciona
- [ ] Firefox: "Install as app" funciona
- [ ] Edge: "Install app" funciona
- [ ] App abre em janela separada
- [ ] Ícone aparece em Application Menu

#### Performance
- [ ] Login page carrega em < 1.5 segundos
- [ ] Dashboard carrega em < 2 segundos
- [ ] Imagens renderizam sem delay
- [ ] CPU usage normal (< 20%)
- [ ] RAM não aumenta durante navegação

#### Offline Functionality
- [ ] App funciona offline
- [ ] Cache headers respeitados
- [ ] Sync funciona online
- [ ] Dados persistem

---

## 📊 Performance Monitoring

### Load Time Targets
| Página | Alvo | Crítico |
|--------|------|---------|
| Login | < 2s | < 3s |
| Dashboard | < 3s | < 4s |
| Estrutura | < 2s | < 3s |
| Documentos | < 2s | < 3s |
| Boletos | < 2s | < 3s |

### Cache Validation
- [ ] Images PNG/JPG: cache-control: public, max-age=86400
- [ ] HTML/CSS/JS: cache-control: public, max-age=3600
- [ ] API responses: cache-control: no-cache (ou apropriado)
- [ ] Browser DevTools: Network tab mostra status 304 (Not Modified)

### Network Performance
- [ ] Latency p95 < 200ms
- [ ] Throughput: > 1Mbps em 3G
- [ ] Packet loss: 0%
- [ ] First Contentful Paint (FCP): < 1.5s
- [ ] Largest Contentful Paint (LCP): < 2.5s

### Resource Usage
- [ ] Memory: < 150MB em desktop, < 100MB em mobile
- [ ] CPU: < 30% em idle, < 60% durante navegação
- [ ] Disk: < 50MB cache
- [ ] Battery (mobile): < 5% drain por hora de uso

---

## 🔌 PWA Offline Testing

### Service Worker
- [ ] Service Worker instala sem erros
- [ ] Service Worker ativa corretamente
- [ ] Versão do SW está atualizada
- [ ] Pode ser detectado em DevTools

### Offline Pages
- [ ] Home page disponível offline
- [ ] Dashboard dados cached
- [ ] Estrutura images aparecem offline
- [ ] Documentos carregam offline
- [ ] Mensagem "Offline" clara quando sem internet

### Online Sync
- [ ] Dados sync quando volta online
- [ ] Notificação de sync bem-sucedido
- [ ] Conflitos de dados resolvidos
- [ ] Nenhum dado perdido

### Cache Strategy
- [ ] Network-first para API
- [ ] Cache-first para images/assets
- [ ] Stale-while-revalidate para conteúdo
- [ ] TTL de 24h para images PNG/JPG

---

## 👥 User Feedback Collection

### Feedback Form Checklist
- [ ] Feedback button localizado em navegação
- [ ] Modal abre sem erros
- [ ] Campos: email, nome, segmento, mensagem
- [ ] Validação de campos funciona
- [ ] Envio de feedback funciona
- [ ] Confirmação de envio aparece
- [ ] Feedback salvo em banco de dados

### Feedback Analytics
- [ ] Rastrear cliques em "Feedback"
- [ ] Contar total de feedbacks por dia/semana
- [ ] Categorizar por tipo (bug, feature, etc)
- [ ] Email notifications para tim ao receber feedback
- [ ] Dashboard admin para visualizar feedbacks

### Rating System
- [ ] Teste a estrela de rating (1-5)
- [ ] Rating salva com feedback
- [ ] Média de ratings calculada
- [ ] Distribuição de ratings visível

---

## 🐛 Bug Report Integration

### Bug Report Form
- [ ] Campo para descrever bug
- [ ] Screenshot attachment funciona
- [ ] Browser/OS auto-detectado
- [ ] Version app incluída
- [ ] Timestamp incluído
- [ ] Status: "Novo" by default

### Bug Tracking
- [ ] Bugs salvos no banco de dados
- [ ] Email notification para tim dev
- [ ] Admin dashboard mostra bugs abertos
- [ ] Priorização possível (P0-P4)
- [ ] Histórico de resolução

---

## 📈 Metrics to Track

### User Engagement
- [ ] Daily Active Users (DAU)
- [ ] Monthly Active Users (MAU)
- [ ] Session duration (média)
- [ ] Pages per session
- [ ] Return user rate

### Performance Metrics
- [ ] Page load time (média)
- [ ] Time to interactive (TTI)
- [ ] First Input Delay (FID)
- [ ] Cumulative Layout Shift (CLS)
- [ ] Core Web Vitals score

### Error Tracking
- [ ] JavaScript errors (quantidade)
- [ ] 404 errors
- [ ] 5xx server errors
- [ ] Network timeouts
- [ ] Failed API calls

### Conversion Metrics
- [ ] Login success rate
- [ ] Feature adoption (documentos upload, etc)
- [ ] Churn rate
- [ ] Feedback submission rate

---

## 🎯 Sign-Off Checklist

- [ ] Todos os testes de plataforma passaram
- [ ] Performance targets atingidos
- [ ] PWA funciona offline
- [ ] Feedback collection funcionando
- [ ] Bugs críticos zerados
- [ ] Documentation completa
- [ ] Deploy para produção OK
- [ ] Monitoramento ativo

---

**Última Atualização:** 09 de setembro de 2026
**Versão:** 4.4.0
**Status:** Ready for Testing
