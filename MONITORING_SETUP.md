# 📊 Carandaí 25 - Plano de Monitoramento & Performance

## 🎯 Objetivos de Monitoramento

```
┌─────────────────────────────────────────────────────────┐
│  Performance Monitoring Strategy - v4.4.0               │
├─────────────────────────────────────────────────────────┤
│  ✓ Uptime/Availability (99.9% SLA)                      │
│  ✓ Response Time (p50, p95, p99)                        │
│  ✓ Error Rate (< 0.1%)                                  │
│  ✓ Cache Hit Rate (> 85%)                               │
│  ✓ Resource Usage (CPU, Memory)                         │
│  ✓ User Experience (Lighthouse Scores)                  │
└─────────────────────────────────────────────────────────┘
```

## 📈 Métricas Principais

### 1. Disponibilidade & Uptime

**Target**: 99.9% (43.2 minutos/mês downtime máximo)

**Onde Monitorar:**
- Railway Dashboard (deployment health)
- HTTP status codes (via logs)
- Service health endpoint: `/api/health`

**Check Script:**
```bash
# Executar a cada 5 minutos
curl -s https://portal.carandai25.com/api/health | jq '.ok'
```

**Expected Response:**
```json
{
  "ok": true,
  "service": "carandai25-portal",
  "version": "4.4.0",
  "storage": "/storage"
}
```

---

### 2. Tempo de Resposta (Latência)

**Targets:**
```
Métrica           | p50   | p75   | p95   | p99
-----------------|-------|-------|-------|-------
Login Page        | 0.8s  | 1.2s  | 1.8s  | 2.2s
Dashboard         | 1.5s  | 2.1s  | 2.9s  | 3.5s
Estrutura (img)   | 0.7s  | 1.1s  | 1.6s  | 2.0s
Documentos        | 1.3s  | 1.8s  | 2.5s  | 3.0s
Boletos           | 1.2s  | 1.7s  | 2.4s  | 2.8s
```

**Como Medir (Chrome DevTools):**
1. Abrir DevTools (F12)
2. Ir para Network tab
3. Fazer ação no site
4. Ver coluna "Time" para cada requisição
5. Calcular p95: 95% das requisições devem estar < X tempo

**Script de Teste Automatizado:**
```javascript
// Rodar no Console
async function testLatency() {
  const results = [];
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    await fetch('/api/dashboard');
    results.push(performance.now() - start);
  }
  console.log('Latencies (ms):', results);
  console.log('Avg:', (results.reduce((a,b)=>a+b)/results.length).toFixed(0) + 'ms');
}
testLatency();
```

---

### 3. Taxa de Cache

**Target**: > 85% hit rate

**Onde Verificar (Chrome DevTools Network Tab):**
1. Abrir DevTools → Network
2. Recarregar página (Ctrl+R ou Cmd+R)
3. Procurar por Status "304 Not Modified" ou "(from cache)"
4. Calcular: (cached requests / total requests) × 100

**Expected Cache Headers:**
```
Resource Type | Cache-Control | Expected
--------------|---------------|----------------------
Images (PNG)  | max-age=86400 | 24 horas
CSS/JS        | max-age=3600  | 1 hora
HTML          | no-cache      | Always fresh
API           | no-store      | Nunca cache
```

**Script para Verificar Headers:**
```javascript
// No Console
fetch('/public/assets/estruturas/estrutura-moda.png')
  .then(r => {
    console.log('Cache-Control:', r.headers.get('Cache-Control'));
    console.log('Expires:', r.headers.get('Expires'));
    console.log('Age:', r.headers.get('Age'));
  });
```

---

### 4. Pontuação Lighthouse

**Targets:**
```
Métrica         | Target | Status
----------------|--------|--------
Performance     | > 80   | 🟢 GOOD
Accessibility   | > 90   | 🟢 GOOD
Best Practices  | > 85   | 🟢 GOOD
SEO            | > 90   | 🟢 GOOD
PWA            | > 90   | 🟢 GOOD
```

**Como Executar Lighthouse:**

1. **Chrome DevTools (Built-in):**
   - DevTools → Lighthouse tab
   - Selecionar mobile ou desktop
   - Clicar "Analyze page load"
   - Aguardar resultado

2. **PageSpeed Insights (Online):**
   - Ir para https://pagespeed.web.dev
   - Inserir URL: https://portal.carandai25.com
   - Analisar scores

3. **Command Line (npm):**
   ```bash
   npm install -g lighthouse
   lighthouse https://portal.carandai25.com --view
   ```

---

### 5. Taxa de Erro HTTP

**Target**: < 0.1% (máx 1 erro por 1000 requisições)

**Status Codes a Monitorar:**
```
Status | Significado | Action
-------|-------------|-------
200    | OK         | Normal
301    | Redirect   | Normal
304    | Cached     | Normal
400    | Bad Request| Verificar logs
401    | Unauthorized| Login issue
404    | Not Found  | Missing resource
500    | Server Error| Critical
503    | Unavailable| Critical
```

**Como Monitorar (Railway Dashboard):**
1. Ir para Logs → HTTP Logs
2. Filtrar por: `@httpStatus:500` ou `@httpStatus:400`
3. Análise: % de erro = (erros / total) × 100

---

### 6. Uso de Recursos (CPU, Memória)

**Targets (por replica):**
```
Recurso      | Média | Pico  | Alerta
-------------|-------|-------|-------
CPU (%)      | 20-30 | < 70  | > 80%
Memória (MB) | 150   | < 400 | > 500MB
Disco (MB)   | 200   | < 500 | > 600MB
```

**Onde Ver (Railway Dashboard):**
1. Projeto → Environment
2. Selecionar serviço "carandai25-portal"
3. Ir para "Metrics"
4. Ver CPU Usage e Memory Usage

---

## 🔍 Ferramentas de Monitoramento Recomendadas

### Free Tier Options

#### 1. **Google Analytics 4**
```javascript
// Adicionar ao HEAD do index.html
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID');
</script>
```

**Métricas Rastreadas:**
- Page views
- User sessions
- Device types
- Browser versions
- Performance metrics

#### 2. **Sentry (Free Tier)**
```javascript
// Adicionar ao public/app.js
import * as Sentry from "@sentry/browser";

Sentry.init({
  dsn: "https://YOUR_DSN@sentry.io/PROJECT_ID",
  environment: "production",
  tracesSampleRate: 0.1,
});

// Capture errors
window.addEventListener('error', (e) => {
  Sentry.captureException(e);
});
```

**Benefícios:**
- Real-time error tracking
- Stack traces
- User context
- Performance monitoring

#### 3. **Uptime Monitor (Uptime Robot - Free)**
- Monitorar `/api/health` a cada 5 minutos
- Alertas via email se inativo
- Dashboard de histórico
- Relatório mensal

---

## 📊 Dashboard de Monitoramento (Recomendado)

Criar página interna em `/admin/monitoring`:

```html
<!-- Exemplo de Dashboard -->
<div class="monitoring-board">
  
  <div class="kpi">
    <h3>Uptime (30 dias)</h3>
    <span class="value">99.98%</span>
    <span class="status">✅ GOOD</span>
  </div>

  <div class="kpi">
    <h3>Avg Response Time</h3>
    <span class="value">1.2s</span>
    <span class="status">✅ GOOD</span>
  </div>

  <div class="kpi">
    <h3>Cache Hit Rate</h3>
    <span class="value">87.3%</span>
    <span class="status">✅ GOOD</span>
  </div>

  <div class="kpi">
    <h3>Error Rate</h3>
    <span class="value">0.05%</span>
    <span class="status">✅ GOOD</span>
  </div>

  <div class="chart">
    <h4>Response Time (24h)</h4>
    [Gráfico de linha mostrando p50, p95, p99]
  </div>

  <div class="chart">
    <h4>HTTP Status Distribution</h4>
    [Gráfico de pizza: 2xx, 3xx, 4xx, 5xx]
  </div>

</div>
```

---

## 🚨 Alertas & Escalação

### Regras de Alerta

```
Condição                  | Severidade | Action
--------------------------|-----------|------------------
Uptime < 99.9%           | CRITICAL   | Page on-call 24/7
Avg Response > 3s        | HIGH       | Investigate immediately
Error Rate > 0.5%        | HIGH       | Check logs
Cache Hit < 70%          | MEDIUM     | Review cache config
Memory > 500MB           | MEDIUM     | Check for leaks
CPU > 80%                | MEDIUM     | Scale up replicas
```

### Contatos & SLAs

```
Severidade | Response | Resolution | Contact
-----------|----------|------------|------------------
CRITICAL   | 15 min   | 1 hour     | On-call dev + PM
HIGH       | 1 hour   | 4 hours    | Dev team lead
MEDIUM     | 4 hours  | 24 hours   | Dev team
LOW        | 24 hours | 72 hours   | Backlog
```

---

## 📝 Checklist de Monitoramento

### Setup Inicial
- [ ] Health endpoint configurado (`/api/health`)
- [ ] Google Analytics implementado
- [ ] Sentry configurado (error tracking)
- [ ] Uptime Robot monitorando
- [ ] Railway Metrics habilitadas
- [ ] Logs HTTP habilitados
- [ ] Cache headers corretos

### Monitoramento Diário
- [ ] Verificar uptime (99.9%+)
- [ ] Verificar erros no Sentry
- [ ] Revisar response times (< 3s)
- [ ] Checar cache hit rate (> 85%)

### Monitoramento Semanal
- [ ] Rodas Lighthouse (todos os scores > 80)
- [ ] Análise de performance trends
- [ ] Revisar feedback de usuários
- [ ] Check resource usage peaks

### Monitoramento Mensal
- [ ] Gerar relatório de SLOs
- [ ] Otimizações baseadas em dados
- [ ] Planejar melhorias
- [ ] Reunião de retrospectiva

---

## 📊 Relatório de Performance (Template)

```markdown
# Performance Report - Setembro 2026

## KPIs

| Métrica | Target | Atual | Status |
|---------|--------|-------|--------|
| Uptime | 99.9% | 99.98% | ✅ |
| Avg Response | 1.5s | 1.2s | ✅ |
| Cache Hit | > 85% | 87.3% | ✅ |
| Error Rate | < 0.1% | 0.05% | ✅ |
| Lighthouse | > 80 | 92 | ✅ |

## Top 3 Achievements
1. Cache optimization → 87.3% hit rate
2. Image compression → 40% faster loads
3. Zero critical errors this month

## Top 3 Issues
1. Occasional 500 errors on /api/dashboard (0.02%)
2. Slow image loads on poor connection
3. PWA offline sync delay

## Recommendations
1. Add database query optimization
2. Implement CDN for images
3. Monitor on slower connections
```

---

## 🎯 Next Steps

1. **Week 1**: Configurar ferramentas básicas (GA4, Sentry)
2. **Week 2**: Setup dashboards e alertas
3. **Week 3**: Baseline de performance
4. **Week 4**: Otimizações baseadas em dados


