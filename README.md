# The Secret Santa

Full-stack Secret Santa application: Spring Boot REST API, JWT auth, MySQL, React frontend and optional Docker production deployment.

The project is currently intended to run locally. There is no always-on VPS/server required for development.

## Stack

- Java 21, Spring Boot 3, Spring MVC, Spring Security
- Spring Data JPA / Hibernate
- AOP audit logging for service actions
- MySQL 8.4 for local development through Docker Compose
- H2 for automated tests
- React, Vite, TypeScript
- Optional production stack: Docker, Nginx frontend, Caddy HTTPS reverse proxy

## Main Features

- Registration with name, email and password
- Login with name and password
- JWT-based stateless authentication
- Room creation with owner as a participant
- Invite links for participants
- Wishlists and gift links
- Directed draw restrictions
- Secret draw: every participant sees only their own receiver
- Profile avatar upload
- Email notifications after draw
- Password reset by email

## Local Run

Start MySQL:

```bash
docker compose up -d
```

Run backend from IntelliJ IDEA or with Maven:

```bash
./mvnw spring-boot:run
```

On Windows PowerShell:

```powershell
.\mvnw.cmd spring-boot:run
```

Backend URL:

```text
http://localhost:8080
```

Run frontend:

```bash
cd frontend
npm install
npm run dev
```

Frontend URL:

```text
http://localhost:5173
```

## Local Database

The default local database settings are in `src/main/resources/application.yml`.

Docker exposes MySQL on:

```text
localhost:23307
```

Default local credentials:

```text
database: secret_santa
user: santa
password: santa_password
```

Useful commands:

```bash
docker compose ps
docker compose logs mysql
docker compose down
```

To delete local database data too:

```bash
docker compose down -v
```

## Tests

Backend tests use the `test` Spring profile and an in-memory H2 database.

```bash
./mvnw test
```

On Windows PowerShell:

```powershell
.\mvnw.cmd test
```

Frontend production build:

```bash
cd frontend
npm run build
```

## Email Setup

Email is optional locally. If SMTP settings are empty, the application starts and logs skipped email sends.

For Gmail, create an app password and set these environment variables:

```env
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=your-gmail@gmail.com
MAIL_PASSWORD=your-google-app-password
```

Do not use your normal Gmail account password.

## Optional Production Deployment

Production files are kept in the repository as a deployment example:

- `Dockerfile`
- `frontend/Dockerfile`
- `docker-compose.prod.yml`
- `Caddyfile`
- `.env.production.example`

To deploy publicly again, you need a VPS, a domain, DNS `A` records pointing to the VPS IP, Docker and Docker Compose.

Production start command:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

If there is no active VPS, this section is only documentation and does not affect local development.
