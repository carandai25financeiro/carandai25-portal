# 📊 Monitoring & Observability Setup - Carandaí 25 Portal v4.4.0

## 🔍 Métricas de Produção

### 1. Performance Monitoring

#### Google Lighthouse Scores (Alvo: 90+)
```bash
# Executar localmente
lighthouse https://portal.carandai25.com --view
```

**Métricas Principais:**
- Performance: 90+
- Accessibility: 95+
- Best Practices: 95+
- SEO: 100
- PWA: Installable

#### Core Web Vitals
| Métrica | Bom | Precisa Melhorar | Crítico |
|---------|-----|-----------------|---------|
| LCP (Largest Contentful Paint) | < 2.5s | < 4s | > 4s |
| FID (First Input Delay) | < 100ms | < 300ms | > 300ms |
| CLS (Cumulative Layout Shift) | < 0.1 | < 0.25 | > 0.25 |

---

### 2. Monitoramento em Tempo Real

#### Ferramentas Recomendadas:
1. **Google Analytics 4** - Tráfego e comportamento do usuário
2. **Sentry** - Error tracking e performance
3. **Datadog** - APM (Application Performance Monitoring)
4. **UptimeRobot** - Uptime monitoring (status 200)

#### Métricas Key:
```
Daily Active Users (DAU)
Monthly Active Users (MAU)
Session Duration (média)
Error Rate (%)
API Latency (p50, p95, p99)
Page Load Time (p50, p95)
Cache Hit Rate (%)
```

---

### 3. Alertas Automáticos

#### Críticos (Alerta Imediato)
- ❌ Service Down (status != 200 por > 2 min)
- ❌ Error Rate > 5%
- ❌ API Latency p95 > 1000ms
- ❌ JavaScript console errors > 10 por min
- ❌ Memory usage > 200MB (mobile)

#### Avisos (Alert em 15 min)
- ⚠️ API Latency p95 > 500ms
- ⚠️ Load time > 4s
- ⚠️ Error Rate > 2%
- ⚠️ Cache hit rate < 70%

---

## 📱 User Feedback Collection

### Sistema de Feedback Integrado

#### 1. Feedback Form (Modal)
```javascript
Localização: Sidebar → "Feedback"
Campos:
  - Email (auto-filled)
  - Nome da Marca
  - Tipo: Bug / Feature Request / Outro
  - Rating: ⭐ 1-5
  - Mensagem: textarea
  - Anexar screenshot: opcional
```

#### 2. Armazenamento
```javascript
Database: SQLite
Table: feedback
Campos:
  - id: UUID
  - brand_id: FK
  - email: string
  - rating: 1-5
  - type: enum (bug, feature, other)
  - message: text
  - screenshot: file (optional)
  - browser: string (auto)
  - os: string (auto)
  - app_version: string (auto)
  - created_at: timestamp
  - status: "new" (default)
```

#### 3. Notificações
- Email automatizado para tim quando feedback recebido
- Dashboard admin para gerenciar feedbacks
- Categorização automática por tipo

---

## 🔧 Implementação de Feedback (Code)

### Backend Addition (server.js)
```javascript
// Adicionar após rotas existentes
app.post('/api/feedback', async (req, res) => {
  const body = await readJson(req);
  const { brand_id, email, rating, type, message, screenshot } = body;
  
  // Validar campos
  if (!email || !message || !rating) {
    return json(res, 400, { error: 'Campos obrigatórios' });
  }
  
  // Detectar browser/OS
  const ua = req.headers['user-agent'];
  const browserOS = detectBrowserOS(ua);
  
  // Salvar no DB
  db.prepare(`
    INSERT INTO feedback(id, brand_id, email, rating, type, message, browser, os, app_version, created_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, '4.4.0', datetime('now'), 'new')
  `).run(uid(), brand_id, email, rating, type || 'other', message, browserOS.browser, browserOS.os);
  
  // Email notification
  sendEmailNotification(email, message, rating);
  
  return json(res, 201, { ok: true });
});
```

### Frontend Addition (app.js)
```javascript
function viewFeedback() {
  openModal(`
    <div class="modal-head">
      <div><span class="kicker">FEEDBACK</span><h2>Sua opinião importa</h2></div>
      <button class="modal-close">×</button>
    </div>
    <form id="feedbackForm" class="form-grid">
      <div class="field full">
        <label>Email<input type="email" name="email" value="${state.me.email}" required></label>
      </div>
      <div class="field">
        <label>Rating
          <div class="rating-stars">
            ${[1,2,3,4,5].map(i => `<button type="button" class="star" data-rating="${i}">⭐</button>`).join('')}
          </div>
        </label>
      </div>
      <div class="field">
        <label>Tipo
          <select name="type" required>
            <option value="bug">🐛 Bug Report</option>
            <option value="feature">✨ Feature Request</option>
            <option value="other">💬 Outro</option>
          </select>
        </label>
      </div>
      <div class="field full">
        <label>Mensagem<textarea name="message" required></textarea></label>
      </div>
      <div class="field full">
        <button class="btn btn-dark" type="submit">Enviar Feedback</button>
      </div>
    </form>
  `);
  
  $('#feedbackForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const data = new FormData(e.target);
      await api('/api/feedback', {
        method: 'POST',
        body: Object.fromEntries(data)
      });
      closeModal();
      toast('Obrigado pelo feedback! 🙏');
    } catch (err) {
      showError(err);
    }
  });
}
```

---

## 📊 Admin Dashboard para Feedback

### Funcionalidades
- [ ] Lista de todos os feedbacks
- [ ] Filtrar por: tipo, rating, data, brand
- [ ] Buscar por email/mensagem
- [ ] Marcar como "Resolvido"
- [ ] Responder diretamente ao email
- [ ] Gráficos de rating over time
- [ ] Heatmap de tipos de feedback

---

## 🧪 Testing Automation

### Performance Testing (Playwright)
```javascript
// tests/performance.spec.js
test('Login page loads in < 2 seconds', async ({ browser }) => {
  const page = await browser.newPage();
  const start = Date.now();
  await page.goto('https://portal.carandai25.com');
  const time = Date.now() - start;
  expect(time).toBeLessThan(2000);
});
```

### Cross-Browser Testing
```bash
# BrowserStack / LambdaTest
- Android Chrome 8.0+ emulator
- iOS Safari 12.0+ simulator
- Windows 10 Edge/Chrome/Firefox
- macOS 10.13+ Safari/Chrome
- Ubuntu Firefox/Chrome
```

---

## 📈 Dashboards Recomendados

### 1. Executive Dashboard (C-Level)
```
Top KPIs:
- DAU / MAU
- Uptime %
- Error Rate
- User Satisfaction (avg rating)
- Features Requested (top 5)
```

### 2. Operations Dashboard
```
Real-time:
- Active Sessions
- Errors/minute
- API latency
- Cache hit rate
- Server CPU/Memory
```

### 3. Product Dashboard
```
Trends:
- Feedback by type (bug vs feature)
- User journey funnels
- Feature adoption
- Churn rate
- Session duration
```

---

## 🔔 Notification Channels

### Channels Configurados
1. **Email** - Para feedback, bugs críticos
2. **Slack** - Alerts em #c25-portal-alerts
3. **SMS** - Apenas P0 (service down)
4. **In-App** - Toast notifications para erros

---

## 📋 Checklist de Monitoramento

- [ ] Google Analytics configurado
- [ ] Sentry account criado
- [ ] UptimeRobot health checks ativos
- [ ] Lighthouse CI pipeline
- [ ] Performance budget definido
- [ ] Alertas configurados no Slack
- [ ] Email notifications ativas
- [ ] Dashboard admin criado
- [ ] Logs centralizados (CloudWatch/ELK)
- [ ] Error tracking com stack traces

---

**Configuração Completa = Base Sólida para Manutenção Contínua**
