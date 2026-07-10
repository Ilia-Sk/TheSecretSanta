# The Secret Santa

Full-stack Secret Santa MVP: Spring Boot REST API, JWT auth, MySQL, Docker Compose and React frontend.

## Stack

- Java 21, Spring Boot, Spring MVC, Spring Security, Spring Data JPA/Hibernate
- AOP audit logging for service actions
- MySQL 8.4 via Docker Compose
- React + Vite + TypeScript

## Run MySQL With Docker

Docker is used here only to start MySQL without installing MySQL manually.

1. Install Docker Desktop.
2. Start Docker Desktop.
3. In the project root run:

```bash
docker compose up -d
```

Useful commands:

```bash
docker compose ps
docker compose logs mysql
docker compose down
```

`docker compose down` stops the database container. Data remains in the named volume. To delete the data too:

```bash
docker compose down -v
```

## Run Backend

```bash
mvn spring-boot:run
```

Backend starts on `http://localhost:8080`. MySQL from Docker is exposed on `localhost:23307`.

## Run Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend starts on `http://localhost:5173`.

## Production Deployment

For a real public website you need a VPS and a domain, for example `your-domain.by`, `.com`, `.app`, `.dev` or another domain you own.

1. Buy or create a VPS with Ubuntu.
2. Point the domain DNS `A` record to the VPS public IP.
3. Install Docker and Docker Compose on the VPS.
4. Copy this project to the VPS.
5. Create production environment file:

```bash
cp .env.production.example .env.production
```

6. Edit `.env.production` and replace:

```env
SITE_DOMAIN=your-domain.by
MYSQL_PASSWORD=...
MYSQL_ROOT_PASSWORD=...
JWT_SECRET=...
```

7. Start the public stack:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

8. Check containers:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

The production stack contains:

- `mysql` - database, available only inside Docker network.
- `backend` - Spring Boot API.
- `frontend` - React static build served by Nginx.
- `caddy` - public HTTP/HTTPS entry point with automatic TLS certificates.

After DNS is configured, the site opens at:

```text
https://your-domain.by
```

## MVP Flow

1. Register or log in.
2. Create a room.
3. Share the invite link.
4. Participants join after logging in.
5. Room owner adds directed restrictions.
6. Room owner starts the draw.
7. Every participant sees only their own gift receiver and that receiver's wishlist.
