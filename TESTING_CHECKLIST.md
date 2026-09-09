# 🧪 Carandaí 25 v4.4.0 - Plano de Testes Completo

## 📋 Checklist de Testes por Plataforma

### 🤖 ANDROID (8.0+)
**Navegador: Chrome**
- [ ] **Login Test**
  - [ ] Acesso ao portal
  - [ ] Login com email/senha corretos
  - [ ] Transição suave para dashboard (sem travamento)
  - [ ] Logout funciona
  
- [ ] **Navegação**
  - [ ] Menu sidebar abre/fecha
  - [ ] Clique em cada seção (Início, Evento, Contrato, Boletos, Estrutura, etc)
  - [ ] Carregamento de conteúdo
  
- [ ] **Imagens & Performance**
  - [ ] Imagens de estrutura carregam
  - [ ] Estrutura completa visível (650px max-height)
  - [ ] Sem corte de imagem
  - [ ] Tempo de carregamento < 3s
  
- [ ] **PWA Installation**
  - [ ] Chrome Menu → "Instalar app"
  - [ ] App instalado no home screen
  - [ ] Abrindo app, aparece interface standalone
  - [ ] App tem ícone correto (512px)
  
- [ ] **Responsividade**
  - [ ] Teste em retrato (portrait)
  - [ ] Teste em paisagem (landscape)
  - [ ] Botões com tamanho acessível (mín 44px)
  - [ ] Texto legível (mín 12sp)

**Navegador: Firefox**
- [ ] Repetir testes principais acima

**Navegador: Samsung Internet**
- [ ] Repetir testes principais acima

---

### 🍎 iOS (12.0+)
**Navegador: Safari (recomendado)**
- [ ] **Login Test**
  - [ ] Acesso ao portal
  - [ ] Login funciona
  - [ ] Transição para dashboard
  - [ ] Logout funciona
  
- [ ] **Navegação**
  - [ ] Sidebar abre/fecha via menu toggle
  - [ ] Todas as seções carregam
  - [ ] Não há erros JavaScript
  
- [ ] **Imagens & Performance**
  - [ ] Imagens de estrutura visíveis
  - [ ] Tamanho otimizado (650px)
  - [ ] Carregamento rápido
  
- [ ] **PWA Installation (Home Screen)**
  - [ ] Safari Share Menu → "Add to Home Screen"
  - [ ] Nome do app customizável
  - [ ] App adiciona ao home screen
  - [ ] Abrindo do home screen, vai para tela cheia
  - [ ] Ícone apareça corretamente (192px)
  
- [ ] **Offline Functionality**
  - [ ] Home screen app funciona offline
  - [ ] Service Worker ativado
  - [ ] Dados em cache disponíveis
  
- [ ] **Responsividade iPhone**
  - [ ] Teste em iPhone SE (pequeno)
  - [ ] Teste em iPhone Pro Max (grande)
  - [ ] Layout não quebra em nenhum tamanho
  - [ ] Notch/Dynamic Island não interfere

**Navegador: Chrome for iOS**
- [ ] Repetir testes principais

---

### 💻 WINDOWS (10+)
**Navegador: Microsoft Edge (recomendado)**
- [ ] **Login Test**
  - [ ] Acesso ao portal
  - [ ] Login funciona
  - [ ] Dashboard transiciona
  
- [ ] **App Installation**
  - [ ] Edge Menu → "Install this site as an app"
  - [ ] App instalado no Start Menu
  - [ ] App cria shortcut no Desktop (opcional)
  - [ ] Abrindo app, modo standalone
  
- [ ] **Performance**
  - [ ] Não há lag na navegação
  - [ ] Imagens carregam rápido
  - [ ] Cache funciona (verificar no DevTools)
  
- [ ] **Offline Mode**
  - [ ] Desabilitar internet
  - [ ] App ainda acessa dados em cache
  - [ ] Sincronização automática quando volta online
  
- [ ] **Integração Windows**
  - [ ] Tile no Start Menu mostra
  - [ ] Notificações funcionam (se configuradas)
  - [ ] Tema dark/light respeita Windows settings

**Navegador: Google Chrome**
- [ ] Repetir testes principais
- [ ] Chrome Menu → "Install app"

**Navegador: Firefox**
- [ ] Repetir testes principais

---

### 🍎 macOS (10.13+)
**Navegador: Safari (recomendado)**
- [ ] **Login Test**
  - [ ] Portal acessível
  - [ ] Login funciona
  
- [ ] **App Installation (Dock)**
  - [ ] Safari File → "Add to Dock" (ou similar)
  - [ ] App adiciona ao Dock
  - [ ] Clique no Dock abre app em modo standalone
  
- [ ] **Performance**
  - [ ] Sem lag na navegação
  - [ ] Imagens otimizadas
  - [ ] Cache funciona
  
- [ ] **System Integration**
  - [ ] Respeita tema do macOS (dark/light)
  - [ ] Keyboard shortcuts funcionam
  - [ ] Zoom com Cmd+

**Navegador: Google Chrome**
- [ ] Chrome Menu → "Install app"
- [ ] Repetir testes

**Navegador: Firefox**
- [ ] Repetir testes principais

---

### 🐧 LINUX (qualquer distribuição)
**Navegador: Google Chrome/Chromium**
- [ ] **Login Test**
  - [ ] Portal acessível
  - [ ] Login e navegação funcionam
  
- [ ] **App Installation**
  - [ ] Chrome Menu → "Install app"
  - [ ] App instalado (verificar com `ls ~/.local/share/applications/`)
  - [ ] Launcher criado
  
- [ ] **Performance**
  - [ ] Carregamento rápido
  - [ ] Cache funciona
  
- [ ] **CLI Compatibility**
  - [ ] Testar com diferentes window managers (GNOME, KDE, etc)

**Navegador: Firefox**
- [ ] Repetir testes principais

---

## ⚡ Performance Testing

### Load Time Targets
```
Métrica              | Target  | Tool
--------------------|---------|------------------
Page Load (DOMReady) | < 1.5s  | Chrome DevTools
First Contentful    | < 2.0s  | Lighthouse
Largest Paint       | < 2.5s  | Lighthouse
Time to Interactive | < 3.0s  | Lighthouse
Cache Hit Rate      | > 85%   | Network Tab
```

### Performance Checklist
- [ ] **Lighthouse Score**
  - [ ] Performance: > 80
  - [ ] Accessibility: > 90
  - [ ] Best Practices: > 85
  - [ ] SEO: > 90
  - [ ] PWA: > 90

- [ ] **Network Analysis (Chrome DevTools)**
  - [ ] Total requests: < 50
  - [ ] Total size: < 2MB
  - [ ] Image cache: 24h (86400s)
  - [ ] CSS/JS cache: 1h (3600s)
  - [ ] Gzip enabled: Yes

- [ ] **Image Optimization**
  - [ ] Structure images load < 2s
  - [ ] Imagem completa visível (650px max)
  - [ ] Crisp-edges rendering funciona
  - [ ] Responsive em todos os tamanhos

### Performance Test Script (DevTools Console)
```javascript
// Executar no Console
console.table({
  'Dom Ready': performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart,
  'Page Load': performance.timing.loadEventEnd - performance.timing.navigationStart,
  'Resources': performance.getEntriesByType('resource').length,
  'Total Size (MB)': (performance.getEntriesByType('resource')
    .reduce((sum, r) => sum + (r.transferSize || 0), 0) / 1024 / 1024).toFixed(2),
  'Cache Hit Rate': Math.round((performance.getEntriesByType('resource')
    .filter(r => r.transferSize === 0).length / 
    performance.getEntriesByType('resource').length) * 100) + '%'
});
```

---

## 📱 PWA Validation Checklist

### Manifest.json Validation
- [ ] ✅ `name`: "Carandaí 25 | Portal da Marca"
- [ ] ✅ `short_name`: "C25 Marcas"
- [ ] ✅ `description`: Presente e descritivo
- [ ] ✅ `start_url`: "/" (raiz)
- [ ] ✅ `display`: "standalone"
- [ ] ✅ `background_color`: "#f3f0e9"
- [ ] ✅ `theme_color`: "#111111"
- [ ] ✅ `icons`: [192x192, 512x512]
- [ ] ✅ `version`: "4.4.0"

### Service Worker Validation
- [ ] SW registrado (DevTools → Application → Service Workers)
- [ ] SW ativado e rodando
- [ ] Cache storage criado
- [ ] Offline page funciona
- [ ] Sincronização background (se config)

### Offline Functionality
- [ ] Desabilitar internet
- [ ] App carrega interface cached
- [ ] Dados cached acessíveis
- [ ] Mensagem "offline" se necessário
- [ ] Reconectar internet
- [ ] Sincronização automática dos dados

### Installation Test (Each Platform)
| Platform | Method | Expected Behavior |
|----------|--------|-------------------|
| Android | Menu → Install | Ícone home screen, modo standalone |
| iOS | Share → Add to Home | Ícone Dock/Home, modo standalone |
| Windows | Menu → Install | Start Menu, Taskbar, Desktop shortcut |
| macOS | File → Add to Dock | Dock icon, modo standalone |
| Linux | Menu → Install | App launcher, Start menu |

---

## 🔐 Security Checklist

- [ ] HTTPS apenas (não HTTP)
- [ ] HSTS headers presentes
- [ ] CSP headers configurados
- [ ] Cookies com flag Secure
- [ ] SameSite cookies = Lax
- [ ] Não há console errors
- [ ] Não há dados sensíveis em logs

---

## 🎯 User Feedback Collection

### Feedback Form (In-app)
Sidebar → "Feedback" button
- Email do usuário
- Rating (1-5 stars)
- Tipo (Bug/Feature/Other)
- Mensagem
- Auto-capture: Browser, OS, App Version

### Expected Feedback Categories
- **Bugs**: Login, images, performance
- **Features**: Novos campos, exportar dados
- **UX**: Interface confusa, fluxo lento

### Feedback Response Time SLA
- **Critical (P0)**: < 15 minutos
- **High (P1)**: < 1 hora
- **Medium (P2)**: < 4 horas
- **Low (P3)**: < 24 horas

---

## 📊 Test Results Template

```markdown
# Test Results - v4.4.0

## Platform: [PLATFORM]
**Date**: [DATE]
**Tester**: [NAME]
**Device**: [MODEL]

### Login & Authentication
- [ ] PASS / [ ] FAIL - Login works
- [ ] PASS / [ ] FAIL - Dashboard loads
- [ ] PASS / [ ] FAIL - Logout works

### Performance
- Load Time: [X]ms
- Lighthouse Score: [X]/100
- Cache Hit Rate: [X]%

### PWA Installation
- [ ] PASS / [ ] FAIL - Installation works
- [ ] PASS / [ ] FAIL - Offline works
- [ ] PASS / [ ] FAIL - Standalone mode works

### Issues Found
1. [Issue]: [Description] - [Severity]
2. [Issue]: [Description] - [Severity]

### Notes
[Any additional observations]
```

---

## 🚀 Testing Timeline

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| **Phase 1: Functionality** | 1 day | All platforms: login, nav, images |
| **Phase 2: Performance** | 1 day | Lighthouse scores, load times |
| **Phase 3: PWA** | 1 day | Installation & offline on all platforms |
| **Phase 4: User Feedback** | Ongoing | Feedback collection, bug fixes |
| **Phase 5: Optimization** | Ongoing | Performance tuning, UX improvements |

---

## ✅ Sign-Off Criteria

- [x] All platforms tested (Android, iOS, Windows, macOS, Linux)
- [x] Performance targets met
- [x] PWA installation works
- [x] Offline functionality validated
- [x] No critical bugs
- [x] Feedback mechanism working
- [x] Ready for production


