# Hive Global Doc Server

Standalone global documentation server that hosts generated static Swagger files for multiple services and versions.

## Features

- Publish OpenAPI specs per service and version
- List all services and available versions
- View latest published docs per service
- Render Swagger UI dynamically from OpenAPI JSON specs
- Store service metadata with latest version info and publish timestamps

## Installation

```bash
npm install
```

## Running

### Development Mode (with auto-reload)
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

Server runs on `http://localhost:4500` (configurable via `PORT` environment variable)

## API Endpoints

### Browse Documentation

- `GET /api/services` - List all services with versions
- `GET /api/services/:service/versions` - Get all versions for a service (returns HTML or JSON based on Accept header)
- `GET /docs/:service` - View latest version docs
- `GET /docs/:service/latest` - Redirect to latest version docs
- `GET /docs/:service/:version` - View specific version docs with Swagger UI

### Publish Documentation

- `POST /api/publish` - Publish new documentation


### Health Check

- `GET /health` - Server health status

## Configuration

Set environment variables:

- `PORT` - Server port (default: 4500)
- `DOCS_DATA_ROOT` - Path to store documentation (default: `./data`)



