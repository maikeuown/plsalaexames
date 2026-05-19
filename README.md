# Reserva de Salas — Época de Exames

Aplicação web para a Escola Secundária José Falcão. Permite a professores reservar uma das 6 salas (28, 29, 30, 31, 32, 36) em blocos de 1 hora, em dias de exame, após o último exame do dia terminar. Por ordem de chegada, sem autenticação. **As reservas são permanentes.**

Stack:
- **Cloudflare Pages** (frontend estático + Pages Functions)
- **Cloudflare D1** (base de dados SQLite serverless)
- Sem servidor a manter, sem cartão de crédito, plano gratuito.

## Estrutura

- `public/` — frontend (HTML, CSS, JS)
- `functions/api/schedule.js` — `GET /api/schedule`
- `functions/api/reservations.js` — `GET` (listar) e `POST` (criar) `/api/reservations`
- `functions/api/_lib.js` — partilhado (slots, validação)
- `exam-schedule.json` — calendário editável

## Deploy no Cloudflare Pages

### 1. Criar o projeto Pages

1. Abrir https://dash.cloudflare.com → **Workers & Pages** → **Create application** → separador **Pages** → **Connect to Git**.
2. Autorizar o GitHub e escolher o repositório `plsalaexames`.
3. Configurar:
   - **Project name**: `plsalaexames` (vai dar o URL `plsalaexames.pages.dev`)
   - **Production branch**: `main`
   - **Framework preset**: `None`
   - **Build command**: (deixar vazio)
   - **Build output directory**: `public`
4. Clicar **Save and Deploy**. Em ~30 s o site fica online. O frontend funciona; as APIs ainda falham (não há base de dados).

### 2. Criar a base de dados D1

1. Dashboard → **Workers & Pages** → **D1**.
2. **Create database** → nome: `reservas` → **Create**.
3. Separador **Console** da base de dados → colar e executar:

```sql
CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_name TEXT NOT NULL,
  room INTEGER NOT NULL,
  date TEXT NOT NULL,
  hour INTEGER NOT NULL CHECK (hour BETWEEN 0 AND 23),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (room, date, hour)
);
```

(O código também cria a tabela automaticamente na primeira chamada, mas correr o SQL adianta o trabalho.)

### 3. Ligar a D1 ao projeto Pages

1. Voltar ao projeto Pages → separador **Settings** → **Functions** → secção **D1 database bindings**.
2. **Add binding**:
   - **Variable name**: `DB` (em maiúsculas, exatamente assim — o código procura `env.DB`)
   - **D1 database**: `reservas`
3. **Save**.

### 4. Redeploy

Pages → separador **Deployments** → no último deploy clicar **Retry deployment** (ou fazer um `git push` qualquer). O novo deploy passa a ter acesso à D1.

### 5. Testar

Abrir `https://plsalaexames.pages.dev`, fazer uma reserva. Confirmar no Dashboard → D1 → `reservas` → **Console**:

```sql
SELECT * FROM reservations;
```

## Editar o calendário

```bash
# editar exam-schedule.json
git add exam-schedule.json
git commit -m "Atualiza calendário"
git push
```

Cloudflare faz redeploy automático em cada push (~30 s).

## Desenvolvimento local (opcional)

Requer Node 18+ e a CLI **Wrangler**:

```bash
npm install -g wrangler
wrangler login
wrangler d1 create reservas-local         # cria DB local em .wrangler/state
wrangler pages dev public --d1=DB         # abre http://localhost:8788
```

## Desligar quando os exames acabarem

1. Dashboard → projeto `plsalaexames` → **Settings** → fundo da página → **Delete project**.
2. Dashboard → **D1** → `reservas` → **Settings** → **Delete database**.

Custo final: **0 €**.

## Formato do `exam-schedule.json`

```json
{
  "rooms": [28, 29, 30, 31, 32, 36],
  "dayEndsAt": "21:00",
  "examDays": {
    "2026-06-16": { "lastExamEnds": "17:30", "_exams": "..." }
  }
}
```

- `rooms`: lista das salas reserváveis.
- `dayEndsAt`: hora limite das reservas (HH:MM, 24h).
- `examDays`: dicionário `YYYY-MM-DD` → `{ lastExamEnds, _exams }`. Apenas estas datas são reserváveis.
- `_exams`: descrição livre dos exames do dia (separados por `·`), mostrada no painel.
