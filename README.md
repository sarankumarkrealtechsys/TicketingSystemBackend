# Backend Web Application Template

Production-ready, reusable backend application built with **Node.js + Express (Plain JavaScript) + PostgreSQL + Prisma 6.16.3**.

## Architecture & Tech Stack
- **Node.js & Express**: Pure JavaScript (CommonJS) layered architecture:
  - Controllers: Web-only controllers (`src/controllers/web/`)
  - Routes: Web-only routes (`src/routes/web/`)
  - Services: Business logic layer (`src/services/`)
  - Repositories: Data access layer (`src/repositories/`)
- **Prisma 6.16.3**: Exact CLI & Client version targeting PostgreSQL.
- **Local PostgreSQL**: Primary development database (`DATABASE_URL`).
- **Redis**: Caching, pub/sub, and session management (`src/lib/redis.js`).
- **Socket.IO**: Real-time event communication (`src/sockets/index.js`).
- **JWT & bcrypt**: Authentication and role/permission authorization.
- **Zod**: Runtime schema validation for requests and environment variables.
- **Helmet, CORS, express-rate-limit**: Core security middleware.
- **Pino & Pino-HTTP**: Fast structured JSON logging.
- **Swagger / OpenAPI**: Interactive documentation at `/api-docs`.
- **Multer**: Multi-folder local file storage (`uploads/images`, `uploads/documents`, `uploads/temporary`).
- **Nodemailer**: Reusable email notification infrastructure.
- **Jest & Supertest**: Automated testing framework in plain JavaScript.

## Development Commands

```bash
# Install dependencies
npm install

# Start development server (with nodemon)
npm run dev

# Run unit and integration tests
npm test

# Check linting
npm run lint

# Start production server
npm start
```

## Database Operations (Manual Control)

```bash
# Validate schema
npm run prisma:validate

# Generate Prisma Client
npm run prisma:generate

# Run development migration
npm run prisma:migrate

# Open Prisma Studio GUI
npm run prisma:studio

# Run database seed
npm run prisma:seed
```

## Supporting Infrastructure (Docker Compose)
To start Redis and an optional containerized PostgreSQL:
```bash
docker compose up -d
```
- Redis: `localhost:6379`
- Swagger UI: [http://localhost:5000/api-docs](http://localhost:5000/api-docs)
- Health Check: [http://localhost:5000/health](http://localhost:5000/health)
