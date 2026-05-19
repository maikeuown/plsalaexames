# Reserva de Salas — Época de Exames

Aplicação web para a Escola Secundária José Falcão. Permite a professores reservar uma das 6 salas (28, 29, 30, 31, 32, 36) em blocos de 1 hora, em dias de exame, após o último exame do dia terminar. Por ordem de chegada, sem autenticação. **As reservas são permanentes.**

Pensada para correr no **Vercel** com **Vercel Postgres** durante a época de exames, e ser desativada quando terminar.

## Estrutura

- `public/` — frontend (HTML/CSS/JS estático)
- `api/schedule.js` — endpoint `GET /api/schedule` (lê `exam-schedule.json`)
- `api/reservations.js` — endpoint `GET` (lista) e `POST` (cria) `/api/reservations`
- `api/_lib.js` — lógica partilhada (geração de slots)
- `exam-schedule.json` — calendário de exames editável (salas, dias, horas)

## Deploy no Vercel — passo a passo

### 1. Pôr o código no GitHub

```bash
cd /home/mike/plsalaexames
git init
git add .
git commit -m "Sistema de reservas de salas — versão inicial"
# cria o repo (precisa do gh CLI autenticado)
gh repo create plsalaexames --public --source . --push
```

Alternativa sem `gh`: criar manualmente em github.com/new e seguir as instruções para "push existing repo".

### 2. Importar para o Vercel

1. Abrir https://vercel.com/new
2. Login (com a conta GitHub é o mais simples)
3. Clicar em **Import Project** e escolher o repositório `plsalaexames`
4. **Framework Preset**: `Other`
5. **Root Directory**: deixar como está
6. **Build / Output / Install commands**: deixar como estão (vazios — Vercel detecta tudo)
7. Clicar **Deploy**

Ao fim de ~30 segundos o site fica online em `https://plsalaexames.vercel.app` (ou um nome similar). Neste ponto **o frontend funciona mas qualquer reserva falha** porque ainda não há base de dados.

### 3. Criar a base de dados

1. No dashboard do projeto Vercel, ir ao separador **Storage**
2. Clicar **Create Database** → **Postgres** (powered by Neon, plano gratuito)
3. Nome sugerido: `reservas`. Região: escolher `Frankfurt (fra1)` (mais perto de Portugal)
4. Clicar **Create**
5. Quando aparecer o ecrã de associação, garantir que o projeto `plsalaexames` está selecionado e clicar **Connect**

Isto adiciona automaticamente as variáveis `POSTGRES_URL` (e relacionadas) ao projeto. Não é preciso editar nada à mão.

### 4. Redeploy

A primeira reserva criada vai automaticamente criar a tabela `reservations` (o código faz `CREATE TABLE IF NOT EXISTS` em cada pedido).

Forçar redeploy (apanha as novas variáveis de ambiente):
- No Vercel: separador **Deployments** → clicar nos `...` da última deployment → **Redeploy**

### 5. Testar

Abrir o URL público e fazer uma reserva. Verificar no Vercel:
- Separador **Storage** → base de dados → **Data** → tabela `reservations` deve mostrar a linha criada.

## Editar o calendário depois do deploy

```bash
# editar exam-schedule.json localmente
git add exam-schedule.json
git commit -m "Atualiza calendário de exames"
git push
```

O Vercel faz redeploy automático em cada push (~30 s).

## Desenvolvimento local

Requer Node 18+ e a CLI do Vercel:

```bash
npm install -g vercel
cd /home/mike/plsalaexames
vercel link              # associa esta pasta ao projeto Vercel (uma vez)
vercel env pull          # baixa POSTGRES_URL para .env.local
npm install
vercel dev               # arranca em http://localhost:3000
```

Sem o `vercel env pull` o `vercel dev` arranca mas o POST das reservas falha (não há DB).

## Desligar quando os exames acabarem

1. Dashboard Vercel → projeto `plsalaexames` → **Settings** → **General** → fundo da página → **Delete Project**
2. Dashboard Vercel → **Storage** → base de dados `reservas` → **Settings** → **Delete Database**

Custo final: **0 €**. (Ambos os recursos cabem no plano Hobby gratuito do Vercel desde que o tráfego seja moderado, que para ~30 professores é trivial.)

## Salas e calendário

`exam-schedule.json`:

```json
{
  "rooms": [28, 29, 30, 31, 32, 36],
  "dayEndsAt": "21:00",
  "examDays": {
    "2026-06-16": { "lastExamEnds": "17:30", "_exams": "..." },
    ...
  }
}
```

- `rooms`: lista das salas reserváveis.
- `dayEndsAt`: hora a partir da qual já não se aceitam reservas (HH:MM, 24h).
- `examDays`: dicionário de `YYYY-MM-DD` → `{ lastExamEnds, _exams }`. Só dias listados aqui aceitam reservas.
- `_exams`: descrição livre (separar com `·`) mostrada no painel "Exames neste dia".
