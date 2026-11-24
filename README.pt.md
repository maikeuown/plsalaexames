# Reserva de Salas — Época de Exames

Aplicação web para a Escola Secundária José Falcão. Permite a professores reservar uma das 6 salas (28, 29, 30, 31, 32, 36) em blocos de 1 hora, em dias de exame, após o último exame do dia terminar. Por ordem de chegada, sem autenticação. **As reservas são permanentes** para os utilizadores; um administrador pode apagá-las pelo painel `/admin`.

Stack: Node.js (Express) + SQLite. Sem dependências externas, sem cloud — corre num único processo num VPS.

## Estrutura

- `server.js` — servidor Express + endpoints REST
- `public/` — frontend (booking + admin)
- `exam-schedule.json` — calendário editável (salas, dias, horas)
- `data.db` — SQLite (criado automaticamente; **não comitar**)

## Endpoints

**Públicos**
- `GET /` — página de reservas
- `GET /api/schedule` — calendário
- `GET /api/reservations` — listar reservas
- `POST /api/reservations` — criar reserva

**Admin** (header `x-admin-password` obrigatório)
- `GET /admin` — painel HTML
- `POST /api/admin/login` — validar password
- `GET /api/admin/reservations` — todas as reservas
- `DELETE /api/admin/reservations/:id` — apagar uma
- `DELETE /api/admin/reservations` — apagar todas
- `GET /api/admin/stats` — total, por dia, por sala

## Variáveis de ambiente

| Variável | Default | Descrição |
|---|---|---|
| `PORT` | `3000` | Porto HTTP |
| `DB_PATH` | `./data.db` | Caminho do ficheiro SQLite |
| `ADMIN_PASSWORD` | (vazia) | Password do `/admin`. **Sem esta, /admin está desativado.** |

## Correr localmente

```bash
npm install
ADMIN_PASSWORD=algumacoisa npm start
# abrir http://localhost:3000
# admin em http://localhost:3000/admin
```

## Deploy em cPanel / WHM (AlmaLinux)

cPanel tem suporte nativo para apps Node.js. Não é preciso configurar Apache à mão.

### 1. Pôr o código no VPS

Por SSH (recomendado):

```bash
# como o user da conta cPanel (não root)
cd ~
git clone https://github.com/maikeuown/plsalaexames.git
cd plsalaexames
```

Ou via File Manager: criar pasta `plsalaexames` em `~/` e fazer upload do conteúdo do repo (sem `node_modules`).

### 2. Criar a app Node.js no cPanel

Login no **cPanel** (não WHM) → secção **Software** → **Setup Node.js App** → **Create Application**:

| Campo | Valor |
|---|---|
| Node.js version | `20.x` (ou superior) |
| Application mode | `Production` |
| Application root | `plsalaexames` (caminho relativo a `~`) |
| Application URL | escolher domínio/subdomínio (ex.: `reservas.escolajosefalcao.pt`) |
| Application startup file | `server.js` |

Carregar em **Create**.

### 3. Definir variáveis de ambiente

Ainda na página da app, secção **Environment variables**:
- `ADMIN_PASSWORD` = `<uma palavra-passe forte que só tu saibas>`
- `PORT` deixar como o cPanel definiu (gere automaticamente)

Carregar em **Save**.

### 4. Instalar dependências

Na mesma página, carregar em **Run NPM Install**. Espera até terminar (60–90 s — `better-sqlite3` compila em C).

> Se aparecer erro a compilar `better-sqlite3` (falta gcc/g++/python3): pede no WHM para instalar `gcc-c++ make python3` via **EasyApache 4** ou por SSH como root: `dnf install -y gcc-c++ make python3`.

### 5. Arrancar

Carregar em **Start App**. Estado deve ficar **Running**.

### 6. Subdomínio + SSL

Em **Domains** → **Subdomains** criar um subdomínio que aponte para a app (a app URL definida em cima já faz isto).

Em **Security** → **SSL/TLS Status** → **Run AutoSSL** para obter HTTPS automático (Let's Encrypt).

### 7. Testar

- `https://teu-dominio/` — booking
- `https://teu-dominio/admin` — entra com a `ADMIN_PASSWORD`

### Atualizar depois

Edita o ficheiro (ex. `exam-schedule.json`) e:

```bash
cd ~/plsalaexames
git pull
```

No cPanel → Setup Node.js App → **Restart** na linha da app.

## Editar o calendário

`exam-schedule.json`:

```json
{
  "rooms": [28, 29, 30, 31, 32, 36],
  "dayEndsAt": "21:00",
  "examDays": {
    "2026-06-16": { "lastExamEnds": "17:30", "_exams": "9h30 12º Português..." }
  }
}
```

O calendário é relido a cada pedido. Editar o JSON e refrescar a página é suficiente — não precisa reiniciar.

## Backup

A base de dados é o ficheiro `data.db` na pasta da app. Para backup:

```bash
cp ~/plsalaexames/data.db ~/backups/data-$(date +%F).db
```

(O cPanel também faz backup automático da home se isso estiver ativado.)
