# Café777 — Documento de Transferência de Contexto

> Última atualização: 2026-05-31  
> Gerado por Claude Code para continuidade de sessão.  
> **Para Claude:** leia este arquivo no início de cada sessão antes de qualquer alteração no projeto.

---

## 1. Visão Geral do Projeto

**Café777** é um app para motociclistas (comunidade, rotas, eventos, peças, passaporte de viagem). Possui app web (React SPA), backend Express e wrapper Android via Capacitor.

- **Repositório local:** `c:\Café777\Cafe777.new\`
- **Deploy:** [Render](https://render.com) (web service)
- **Banco de dados:** Turso (libsql REMOTE mode) + Firestore (mirror)
- **Idioma padrão do app:** Português (pt), com EN disponível

---

## 2. Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | React 19, React Router 7, Tailwind v4 |
| Build | Vite 6, esbuild (bundle server) |
| Backend | Express 4, TypeScript via tsx |
| Banco de dados | libsql/Turso (REMOTE mode), Firestore (mirror) |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| Maps | react-leaflet (OSM) + @vis.gl/react-google-maps |
| Uploads | Multer → Firebase Storage |
| Mobile | Capacitor (Android, `com.cafe777.app`) |
| Icons | lucide-react v0.546.0 |
| Charts | recharts + d3 |
| PDF | jspdf + jspdf-autotable |
| QR | html5-qrcode |
| Animações | framer-motion |
| Offline | Dexie (IndexedDB) — parcialmente implementado |
| AI | @google/genai (scaffolding, não usado ainda) |

---

## 3. Arquitetura

### Topologia: um servidor, uma porta

`server.ts` é um único arquivo Express de ~8200 linhas que serve tudo:
- Em **dev**: monta Vite middleware (`middlewareMode: true`) → um processo na porta 3000
- Em **prod**: serve `dist/` estaticamente com fallback `*` → `index.html`

```
npm run dev  →  tsx --env-file=.env.local server.ts  →  localhost:3000
npm run build  →  vite build + esbuild bundle
npm run start  →  node dist/server.js (produção)
```

**NÃO existe `vite dev` separado.** Tudo passa pelo Express.

### Dual data layer

- **SQLite/Turso** = fonte primária de leitura (mais rápida)
- **Firestore** = espelho durável de escrita
- A maioria dos endpoints escreve nos dois

### Modo REMOTE do libsql

Turso roda em `REMOTE` (não embedded-replica). Cada query é um round-trip de rede (~50ms). Embedded replica foi abandonado por inconsistências de FK. Sem `TURSO_DB_URL`, cai para `cafe777.db` local.

### Schema inline

48 `CREATE TABLE IF NOT EXISTS` + 53 `try { ALTER TABLE ... ADD COLUMN } catch {}` dentro do `server.ts` no startup. Sem framework de migrations — seguir esse padrão.

---

## 4. Frontend

### Rotas (App.tsx)

Todas as páginas são `lazy()` + `Suspense` (implementado nesta sessão):

| Rota | Página |
|---|---|
| `/` | Home |
| `/motorfeed` | MotorFeed |
| `/profile/:username` | Profile |
| `/edit-profile/:username` | EditProfile |
| `/onboarding` | Onboarding |
| `/login` | Login |
| `/invite/:code` | InviteLanding |
| `/forgot-password` | ForgotPasswordPage |
| `/reset-password/:token` | ResetPasswordPage |
| `/discover` | Discover |
| `/events` | Events |
| `/events/:id` | EventDetails |
| `/submit-photo` | SubmitPhoto |
| `/contest` | ContestPage |
| `/notifications` | NotificationsPage |
| `/scan` | ScannerPage |
| `/roads` | RoadsDiscovery |
| `/clubs` | MotoClubsHub |
| `/passport` | Passport |
| `/ambassador` | AmbassadorDashboard |
| `/admin` | Admin |
| `/admin/login` | AdminLogin |
| `/faq` | FAQ |
| `/about` | About |
| `/messages` | Messages |
| `/parts-and-service` | PartsAndService |
| `/privacy` | PrivacyPolicy |

### Providers (ordem obrigatória)

```
ThemeProvider → LanguageProvider → NotificationProvider → FeatureFlagProvider → Router
```

### Componentes principais

- `Header.tsx` — header fixo, autenticação, notificações, menu hambúrguer
- `BottomNavigation.tsx` — nav mobile
- `SideMenu.tsx` — menu lateral deslizável
- `UniversalSearch.tsx` — busca global
- `reviews/` — ReviewModal, ReviewForm, ReviewCard, RatingSummary, MapRating

### Contextos

- `ThemeContext` — `theme` (`light`/`dark`), `toggleTheme()`, persiste em `localStorage.theme`
- `LanguageContext` — `language` (`pt`/`en`), `t(key, params?)`, ~700 chaves inline
- `NotificationContext` — `showNotification(type, message)`, auto-dismiss 5s
- `FeatureFlagContext` — flags persistidas em `localStorage.featureFlags`

---

## 5. Sistema de Design (Tailwind v4 + CSS vars)

### Tokens de cor (usar SEMPRE, nunca hex raw)

| Token | Light | Dark | Uso |
|---|---|---|---|
| `primary` | `#680A08` (vinho) | `#FF5500` (laranja) | CTAs, destaques |
| `accent` | `#8B1410` | `#FF7733` | hover, secundário |
| `chrome` | `#E8DCC8` | `#E8DCC8` | texto principal |
| `steel` | `#9C8E7A` | `#9C8E7A` | texto secundário |
| `engine` | `#1A1209` | `#0D0A05` | fundo principal |
| `oil` | `#2C1F10` | `#1A1209` | fundo cards |
| `inverse` | `#1A1209` | `#E8DCC8` | contraste total |
| `asphalt` | `#6B5E4E` | `#4A3D2E` | bordas |
| `carbon` | `#3D3228` | `#2C2018` | separadores |

**Variável de sombra:** `--shadow-primary` = `rgba(104,10,8,0.3)` light / `rgba(255,85,0,0.3)` dark

**Dark mode:** classe `.dark` no `<html>`, gerenciada por `ThemeContext`.

### Classes de componentes reutilizáveis

`glass-card`, `btn-primary`, `btn-secondary`, `input-field`, `badge-primary`, `badge-chrome`, `no-scrollbar`, `grid-pattern`, `mask-linear-fade`

### Fontes

- `font-sans` → Inter (body)
- `font-display` → Space Grotesk (headings, logo)
- `font-mono` → JetBrains Mono (código, badges)

---

## 6. Autenticação e Permissões

- Auth state em `localStorage` (`user`, `token`)
- `fetchWithAuth` (`src/utils/api.ts`) — wrapper único para fetch autenticado
- Roles: `user` / `admin` / `moderator`
- Plans: `freemium` / `premium`
- Middleware: `authenticateToken` → `checkAdmin` → `checkAmbassador`
- Toda escrita admin deve chamar `logAdminAction(userId, 'ACTION', targetType, targetId, details?)`

---

## 7. Variáveis de Ambiente

Arquivo: `.env.local` (carregado via `--env-file=.env.local`)

| Variável | Descrição |
|---|---|
| `GEMINI_API_KEY` | Gemini AI (exposto ao client via Vite define) |
| `GOOGLE_MAPS_PLATFORM_KEY` | Maps JS API + Places API |
| `TURSO_DB_URL` | URL da instância Turso |
| `TURSO_DB_AUTH_TOKEN` | Token Turso (renovar no console se der 401) |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | JSON single-line (em prod, sem arquivo) |
| `JWT_SECRET` | Segredo JWT |
| `K_SERVICE` | Detectado automaticamente no Cloud Run/AI Studio |

**Sem `TURSO_DB_URL`:** cai para SQLite local `cafe777.db` (dev sem Turso).

---

## 8. Workflow de Desenvolvimento

### Rodar localmente

```powershell
cd c:\Café777\Cafe777.new
# Se houver erro de SSL no Windows:
$env:NODE_OPTIONS="--use-system-ca"
npm run dev
# Acessar: http://localhost:3000/
```

**ATENÇÃO:** Não acessar via VS Code Live Preview (porta 3001) — vai mostrar "Index of /". Usar sempre `http://localhost:3000/`.

### Se porta ocupada

```powershell
Stop-Process -Name "node" -Force
# ou
netstat -ano | findstr :3000
Stop-Process -Id <PID> -Force
```

### Lint / type check

```powershell
npm run lint   # tsc --noEmit — único "linter" configurado
```

### Build para deploy

```powershell
npm run build  # vite build + esbuild bundle
npm run start  # testar build de produção
```

---

## 9. Alterações Recentes (sessões anteriores)

### Otimização de bundle (Render warning >500kB)

**Problema:** Render alertava chunks maiores que 500kB após minificação.

**Solução implementada:**
1. **Code splitting via `lazy()` + `Suspense`** em `src/App.tsx` — todas as ~27 páginas são agora lazy-loaded
2. **`manualChunks` em `vite.config.ts`** — vendors divididos em: `react-vendor`, `maps-vendor`, `charts-vendor`, `motion-vendor`, `pdf-vendor`, `qr-vendor`, `firebase-vendor`
3. **Mapa curado de ícones em `Discover.tsx`** — removido `import * as LucideIcons` (quebrava tree-shaking); substituído por ~75 named imports + `ICON_MAP` lookup
4. **`chunkSizeWarningLimit: 800`** — react-vendor (~753kB) e pdf-vendor (~651kB) aceitos como estão

**Resultado:** Build limpo sem warnings. Discover.tsx: 856kB → 66kB (↓92%).

### Header — ícone 777.svg

`src/components/Header.tsx` linha 110: substituído `<Bike />` (lucide) por `<img src="/777.svg" ... />`. O usuário adiciona o arquivo SVG manualmente na pasta `public/`.

### Header — cores de tema

Linha 109 do Header: container do ícone agora usa tokens de tema em vez de hex fixo:
- `bg-[#680a08]` → `bg-primary`
- `border-[#680a08]/20` → `border-primary/20`
- `shadow-[0_0_15px_rgba(104,10,8,0.2)]` → `shadow-[0_0_15px_var(--shadow-primary)]`

---

## 10. Itens Pendentes / Dívidas Técnicas

### Pendentes imediatos

- [ ] **`server.ts` — remover `console.log` de debug** adicionados durante troubleshooting de dev server (NODE_ENV log, "Loading Vite middleware...", etc.) — localizar por `console.log.*NODE_ENV` e `Loading Vite middleware`
- [ ] **Limpeza de mock-users no Turso** via SQL manual (identificados em sessão anterior)
- [ ] **Verificar endpoints novos:** `/api/trending-routes` e `/api/nearby-pit-stops` — confirmar se estão funcionando em produção

### Deferred (threshold: ~500 MAU ou 300M reads/mês Turso)

Ver arquivo de memória `cafe777-deferred-optimizations.md` para lista completa. Resumo:
1. Auth read elision (`authenticateToken` SELECT em cada request)
2. Chat polling: 3s → 10s (`src/services/messagingService.ts`)
3. Adaptive polling (pausar quando tab escondida)
4. SSE/WebSocket para chat
5. Chat via Firestore `onSnapshot`

### Técnicas conhecidas / não fazer

- **`import * as LucideIcons`** — derrota tree-shaking, causa chunk enorme. Usar named imports + ICON_MAP.
- **`DynamicIcon` do lucide-react** — é assíncrono (useEffect); incompatível com `renderToString` no Discover.tsx (Leaflet markers). Manter named imports.
- **FK no SQLite** — `PRAGMA foreign_keys = OFF` intencional. Não ativar.
- **`db.transaction`** — usar versão monkey-patched (linha ~199 do server.ts), não `BEGIN`/`COMMIT` raw.
- **Firestore coexiste com SQLite** — não remover Firestore; é o mirror de durabilidade.

---

## 11. Observações de Infraestrutura

- **Render (deploy):** web service, `npm run build` + `npm run start`
- **Turso:** token pode expirar/ser invalidado → erro 401 "role was invalidated after token was issued" → regenerar no console Turso e atualizar `.env.local`
- **Turso DNS error (os error 11001):** problema de conectividade local. Comentar `TURSO_DB_URL` no `.env.local` para usar SQLite local em dev
- **Windows SSL:** `set NODE_OPTIONS=--use-system-ca` antes de `npx` se ocorrer erro de certificado
- **`cafe777.db-shm` / `-wal` / `-info`:** artefatos locais do libsql — não commitar

---

## 12. Guia de i18n

- Idioma padrão: **`pt`**
- Todas as chaves (~700) estão inline em `src/contexts/LanguageContext.tsx`
- Adicionar sempre nos dois idiomas (`en` e `pt`)
- `t('chave', { param: valor })` para interpolação
- Chave ausente: loga warning e exibe o nome da chave

---

## 13. Padrões de Feedback ao Usuário

- **Toast/snackbar:** `useNotification().showNotification('success' | 'error' | 'info' | 'warning', 'mensagem')`
- **NUNCA** usar `alert()`, `confirm()`, ou componentes toast ad-hoc

---

*Fim do documento de transferência. Verificar CLAUDE.md no repo para detalhes de arquitetura mais completos.*
