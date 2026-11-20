# IronLog

Registro de treinos de musculação **100% offline**. Sem backend, sem contas, sem telemetria: os dados de treinos e definições ficam no dispositivo (IndexedDB) e podem ser exportados em qualquer momento.

O projeto é uma **PWA instalável** (funciona no browser, offline, via Service Worker) **e um app Android nativo** empacotado com Capacitor.

> ## ⚠️ Só no app APK (Android) o utilizador tem todas as funcionalidades
>
> A versão web (PWA) é uma versão **reduzida** do IronLog. Ela cobre o essencial — registar séries, histórico, rotinas, progresso e cópias de segurança — mas **não tem acesso às capacidades que só existem no sistema operativo Android**:
>
> | Funcionalidade | PWA (browser) | App APK (Android) |
> | --- | --- | --- |
> | Alarme de fim de descanso | Notificação do browser, se o utilizador autorizar (sem som próprio e dependente do browser estar vivo) | Notificação nativa de **alta importance** via `AlarmManager`, com vibração, que acorda o telemóvel mesmo com o ecrã bloqueado |
> | Vibração | `navigator.vibrate` (limitada, só em foreground) | Plugin **Haptics** nativo |
> | Ecrã sempre ligado no treino | Wake Lock API do browser (pode ser suspenso pelo browser) | Plugin **Keep Awake** nativo |
> | Alarme exato | Não existe | Permissão **Android 12+** (`SCHEDULE_EXACT_ALARM`) para o alarme não atrasar |
> | Exportar backup | Download do `.json`/`.csv` (pode ser bloqueado em alguns browsers) | Grava na cache e abre o **menu de partilha** nativo do Android |
> | Armazenamento | IndexedDB do browser | IndexedDB do **WebView**, completamente isolado do browser |
> | Sistema (splash, barras, insets) | Comportamento do browser | Splash nativo, barras de sistema escuras e `env(safe-area-inset-*)` tratados pelo Capacitor |
>
> **Os dados não migram sozinhos entre a PWA e o APK.** Exporte o backup na PWA (Configurações → Dados → Exportar) e importe-o no app (Configurações → Dados → Importar).
>
> Para a experiência completa, instale o **APK**. O guia completo está em [`ANDROID.md`](./ANDROID.md).

---

## Funcionalidades

### Primeiro arranque (consentimento)
- No primeiro uso aparece um ecrã de consentimento (privacidade, dados locais e ausência de telemetria). Só depois de o aceitar é que a app entra no ecrã principal — a versão do consentimento está versionada e é revalidada quando muda.

### Início
- Saudação, estado *offline* e atalho para retomar o treino em andamento.
- Estatísticas da semana: **número de treinos**, **volume total** (calculado em kg; ver *Limitações conhecidas*) e **sequência de dias** (streak).
- Acesso rápido às rotinas (as duas primeiras) e ao histórico recente.
- "Início rápido": cria um treino livre com um toque.

### Treinos e rotinas
- Rotinas com **splits pré-definidos**: ABC, ABCD, Upper/Lower, Full Body e PPL.
- Editor de rotina: nome, split, dias e exercícios por dia (com picker de exercícios).
- Histórico de treinos com duração; é possível **reabrir** um treino antigo ou eliminá-lo.
- Recuperação de sessão: a sessão ativa (exercícios, séries, valores escritos, timer) fica persistida, portanto uma falha ou fecho inesperado não perde o treino.

### Sessão ativa
- Adicionar/remover exercícios durante o treino, com ordem persistida.
- Séries com **peso, repetições, tipo de série e RPE** (opções de 6 a 10, passo 0,5).
- Steppers com incremento por exercício (por exemplo 2,5 kg) e conversão automática kg ↔ lb.
- Botão grande de **conclusão da série** (✓), com destaque visual e vibração no erro.
- **"Última vez"**: ao criar uma série, o peso e as reps são pré-preenchidos com o desempenho anterior do mesmo exercício.
- **Calculadora de discos**: distribuição de discos por lado da barra a partir do stock configurado, com indicação do eventual resto quando o alvo não é fechado.
- Wake lock durante a sessão e cronómetro de descanso integrado.

### Descanso
- Cronómetro de descanso com **Web Worker** (reduz o atraso causado por tabs em background; o timer da página continua a ser o fallback) e persistido como timestamp absoluto, para não derivar com o CPU ocupado.
- Botões **−15 s / +15 s / saltitar**.
- Tempo de descanso por grupo muscular (configurável), com valor por exercício e global como fallback.
- No APK: alarme nativo com `allowWhileIdle`, canal de notificação dedicado (`rest-v2`) e pedido de alarme exato.

### Biblioteca de exercícios
- **55 exercícios** de seed, com grupos musculares, equipamentos, padrões de movimento, descanso por omissão e incremento de carga.
- Pesquisa por nome e filtro por grupo muscular.
- Criar, editar e arquivar exercícios próprios (exercícios customizados são arquivados, nunca apagados, para as séries antigas manterem o rótulo).
- Detalhe de um exercício com melhor e1RM registada e arranque imediato de um treino com esse exercício.

### Progresso
- **e1RM por exercício** com gráfico de linha (fórmulas **Epley** e **Brzycki**, configuráveis).
- **Volume semanal** por grupo muscular e total.
- **Heatmap anual** de sessões concluídas.
- **Recordes pessoais** calculados por duas regras — **e1RM** e **peso levantado** — ordenados por desempenho.
- Avisos honestos quando há dados insuficientes para um gráfico fiável (em vez de desenhar uma curva enganosa).

### Biometria
- Registo de métricas corporais (peso, massa gorda, perímetros, etc. — 8 tipos de métrica de seed).
- Histórico e gráfico de evolução do peso.
- Notas privadas guardadas no **cofre cifrado** (só disponíveis com a segurança ativa e desbloqueada).

### Definições
- Unidades **kg / lb**, com conversão nas séries e nos gráficos.
- Idioma **pt-BR / English**.
- Início da semana (segunda ou domingo).
- Fórmula de 1RM.
- Tempo de descanso: global (15–900 s) e por grupo muscular.
- Inventário de discos (pares disponíveis por peso) e peso da barra.
- Vibração do timer, notificações do browser (PWA) e permissão de alarme exato (APK).
- Diagnóstico de **capacidades** do dispositivo (wake lock, vibração, notificações, WebAuthn, Service Worker, núcleos de CPU, movimento reduzido).
- Pedido de **armazenamento persistente** e leitura do espaço usado/quota.

### Segurança
- **PIN de 6 a 12 dígitos** que protege um cofre local.
- Derivação da chave com **PBKDF2-SHA-256**, com contagem de iterações **calibrada no dispositivo** (micro-benchmark de ~50 ms, limitada à janela 100 000–310 000).
- Chave de conteúdo (DEK) gerada aleatoriamente e envolvida com a chave derivada do PIN; o PIN nunca é guardado.
- Cifra **AES-GCM 256** dos dados sensíveis (notas do cofre e backups cifrados).
- **Bloqueio automático do cofre** quando a app volta ao ecrã depois de 60 s ou mais em background.
- **Registo de uma passkey local** (WebAuthn) a partir das Definições. É deliberadamente local e sem servidor: serve como marcador de presença/dispositivo, e **não** é o que desbloqueia o cofre — isso é feito pelo PIN.
- **Alterar o PIN** re-encapsula a mesma chave de conteúdo (o cofre é preservado). **Remover o PIN** apaga o conteúdo do cofre.

### Dados e cópias de segurança
- **Exportar JSON** (todos os dados), **JSON cifrado com password** (mínimo 8 caracteres) e **CSV** (séries em formato legível por folha de cálculo).
- **Importar** um backup `.json` com validação rigorosa de cada linha/tabela (linhas hostis ou malformadas são rejeitadas, não importadas).
- **Apagar tudo** com confirmação explícita por token escrito.

### Offline, idioma e privacidade
- Service Worker com precache e atualização automática: a app abre e funciona sem rede.
- Duas línguas completas (pt-BR e en, 366 chaves em cada).
- **Sem chamadas de rede da aplicação**: não há API, analytics, crash reporting, contas nem sincronização na cloud. O Service Worker apenas descarrega recursos da própria origem para o cache offline.

---

## Stack técnica

| Camada | Tecnologia |
| --- | --- |
| UI | Preact 11 + TypeScript 6 (JSX com alias `@/`) |
| Build | Vite 8 + `@preact/preset-vite` |
| Estilos | Tailwind CSS 3 (tema escuro, alvos de toque ≥ 44 px, `safe-area-inset`) |
| Gráficos | uPlot |
| Estado/dados | Dexie 4 (IndexedDB) com `useLiveQuery` para reatividade |
| PWA | `vite-plugin-pwa` + Workbox |
| Android | Capacitor 8 (`android/`) |
| Plugins nativos | LocalNotifications, Haptics, Keep Awake, Filesystem, Share, SplashScreen |
| Criptografia | Web Crypto (PBKDF2 + AES-GCM), num **Web Worker** (`crypto.worker.ts`) com fallback para a thread principal |
| Testes | Vitest 5 (unit), Testing Library, Playwright 1.65 (e2e), fake-indexeddb, jsdom |
| Qualidade | ESLint 10 + typescript-eslint, gate de performance do bundle |

---

## Arquitetura

```
src/
  app/          Composição da aplicação: router por hash, contexto, serviços e Shell
  core/         Infraestrutura: base de dados, cripto, i18n, plataforma (notificações, storage, wake lock)
  domain/       Entidades, portas e serviços de negócio (volume, e1RM, heatmap, PRs, discos, descanso)
  features/     Telas por área (home, workouts, library, analytics, biometrics, settings, security, onboarding)
  shared/       Componentes, hooks e utilitários partilhados
  seed/         Catálogos estáticos (exercícios, splits, discos, tipos de série…)
android/        Projeto Android nativo gerado pelo Capacitor (gerado a partir de dist/)
e2e/            Testes end-to-end (Playwright)
tests/          Utilitários e testes de infraestrutura (headers de segurança)
scripts/        Gerador de ícones e gate de performance do bundle
```

Regras de desenho respeitadas pelo código:

- **O domínio não conhece a framework.** `src/domain/entities` não importa Preact, Dexie nem nada de UI.
- **As features acedem aos dados através dos repositórios** (`src/domain/ports/repositories.ts`). A única exceção é o fluxo de dados (exportar, importar, apagar tudo), que precisa de aceder à base de dados completa para serializar e restaurar todas as tabelas.
- **O router é por hash** (`#/workouts`, `#/session`, …), o que funciona igual em `file://` (WebView do Capacitor) e no browser.
- **O arranque é boot-time**: seed, repositórios e cripto são inicializados antes do primeiro render.

### Modelo de dados (IndexedDB / Dexie)

15 tabelas: `meta`, `settings`, `exercises`, `muscleGroups`, `equipment`, `movementPatterns`, `setTypes`, `splits`, `metricTypes`, `routines`, `sessions`, `sets`, `bodyMetrics`, `vault` e `security`.

Índices compostos existem exatamente onde há consultas quentes: `[exerciseId+completedAt]` (última performance por exercício), `[sessionId+order]` (séries de uma sessão), `[status+startedAt]` (sessões por estado e data) e `[typeId+recordedAt]` (métricas corporais por tipo). As séries pendentes também são persistidas, para que uma falha nunca perca valores já escritos.

### Catálogos de seed

55 exercícios · 9 equipamentos · 10 padrões de movimento · 10 grupos musculares · 8 tipos de métrica · 6 tipos de série (aquecimento, feeder, trabalho, drop, rest-pause, falha) · 5 splits.

---

## Requisitos

- **Node.js 22.23.4** (ver `.node-version`; a CI usa Node 22)
- npm (o lockfile é `package-lock.json`)
- Para compilar o APK: JDK 21, Android SDK (`platforms;android-36`, `build-tools;36.0.0`) — ver [`ANDROID.md`](./ANDROID.md)

## Desenvolvimento local

```bash
npm install
npm run dev        # http://localhost:5173
```

### Scripts

| Script | O que faz |
| --- | --- |
| `npm run dev` | Servidor Vite em `:5173` (`--strictPort`) |
| `npm run build` | `tsc` (app + config) e depois `vite build` → `dist/` |
| `npm run preview` | Serve o build de produção localmente |
| `npm run test` | Testes unitários (Vitest, modo run) |
| `npm run test:watch` | Testes unitários em watch |
| `npm run test:coverage` | Testes com cobertura (v8) |
| `npm run test:e2e` | Testes end-to-end (Playwright) |
| `npm run lint` | ESLint em todo o projeto |
| `npm run check:bundle` | Gate de performance: payload inicial (JS+CSS) gzip ≤ **120 KB** |
| `npm run verify` | `lint` + `test` + `build` + `check:bundle` — o comando a correr antes de publicar |
| `npm run icons` | Regenera o set de ícones PNG da PWA (sem dependências externas) |
| `npm run android:sync` | `icons` + `build` + `cap sync android` (copia `dist/` para o projeto nativo) |

### Testes

- **Unitários (Vitest)**: regras de domínio (volume, e1RM, PRs, heatmap, discos, descanso), repositórios com `fake-indexeddb`, cripto, transferência de dados (inclui um *fuzz* de import de backups), UI com Testing Library.
- **E2E (Playwright)**: fluxo de consentimento até ao início, e o ciclo completo de criar PIN → bloquear → desbloquear.
- **Infraestrutura**: `tests/security-headers.test.ts` valida os headers de segurança publicados.

---

## Android / APK

Guia completo: [`ANDROID.md`](./ANDROID.md) (ambiente, Gradle, keystore, permissões, publicação).

Resumo:

```bash
npm run android:sync
cd android && ./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

Permissões pedidas: notificações (Android 13+), alarmes exatos (Android 12+), vibração e wake lock. Sem alarmes exatos o alarme de descanso funciona, mas pode atrasar alguns minutos.

O CI compila o APK e publica-o na Release do GitHub quando é criada uma tag `v*.*.*`, ou quando o workflow `Build Android APK` é executado manualmente (*workflow_dispatch*, com tag opcional). **Um push normal para `main` não publica APK nem release.**

---

## Publicação

O `main` é publicado automaticamente em dois sítios:

| Destino | Como funciona | URL |
| --- | --- | --- |
| **GitHub Pages** | Workflow `deploy.yml` (no repositório): `npm ci` → `npm run build` → artifact `dist` → GitHub Pages | <https://kaiolopes02.github.io/IronLog/> |
| **Cloudflare Pages** | Projeto `ironlog` ligado ao repositório GitHub, configurado no dashboard da Cloudflare (build `npm run build`, output `dist`) | <https://ironlog-25p.pages.dev/> |

Basta fazer `git push origin main`: os dois pipelines correm sozinhos. Para confirmar, veja o run em **Actions** no GitHub e o deployment em **Cloudflare → Pages → ironlog**.

Para atualizar releases/APKs é preciso criar uma tag (`v1.2.3`) ou correr o workflow manualmente — **não acontece automaticamente**.

---

## Segurança e privacidade

- **CSP restritiva** injetada no build (`index.html`): `default-src 'self'`, `script-src 'self'`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data: blob:`, `media-src 'self' blob:`, `font-src 'self'`, `worker-src 'self'`, `manifest-src 'self'`, `object-src 'none'`, `frame-src 'none'`, `base-uri 'self'`, `form-action 'none'` e `connect-src 'none'`.
- **Headers de hosting** (`public/_headers`, aplicados pela Cloudflare Pages): HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` (câmara, micrófone, geolocalização, pagamento, USB e sensores bloqueados), `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy` e `frame-ancestors 'none'`. Aqui o `connect-src` é `'self'` (e não `'none'`) porque o Service Worker precisa de descarregar o precache. O GitHub Pages não permite headers customizados, por isso aí a proteção depende apenas da CSP entregue no `<meta>` do próprio HTML.
- **Criptografia do cofre**: PBKDF2-SHA-256 calibrado → AES-GCM 256, DEK mantida em memória, PIN nunca persistido.
- **Importações validadas**: cada linha de cada tabela do backup é validada antes de entrar na base de dados.
- **Sem rede da aplicação**: não há telemetria, analytics, contas, sincronização na cloud ou servidor. Os dados saem do dispositivo apenas quando o utilizador exporta um ficheiro.
- **LocalStorage**: usado apenas para guardar o ID da credencial da passkey (não há dados de treinos nem definições fora do IndexedDB).

## Limitações conhecidas

- Os dados da PWA e os do APK **não são partilhados** — é preciso exportar/importar manualmente.
- O alarme do browser depende de a notificação estar autorizada e do browser estar vivo; o APK usa o alarme do sistema operativo.
- O canal de notificação `rest-v2` fica com o **som por omissão do sistema** (o plugin só define um som quando lhe é dado um); a vibração está ativa.
- O **volume do ecrã Início é calculado em kg** e apresentado com a unidade configurada — em modo `lb` o valor não é convertido.
- A **calculadora de discos** assume que o stock configurado (pares por peso) está disponível para montar **cada lado** da barra; ajuste o stock em Definições se tiver menos discos.
- A **passkey** é local e serve de marcador de presença; não autentica em nenhum serviço remoto e não substitui o PIN no bloqueio do cofre.
- O repositório ainda não tem ficheiro `LICENSE` — até existir, não há licença declarada para reutilização do código.
