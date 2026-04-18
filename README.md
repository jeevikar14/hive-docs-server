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


```bash
npm run dev
```

```bash
npm start
```


## API Endpoints

### Browse Documentation

- `GET /Services` - List all services with versions
- `GET /ServiceVersions/:service` - Get all versions for a service (returns HTML or JSON based on Accept header)
- `GET /Docs/:service` - View latest version docs
- `GET /Docs/:service/latest` - Redirect to latest version docs
- `GET /Docs/:service/:version` - View specific version docs with Swagger UI

### Publish Documentation

- `POST /Publish` - Publish new documentation


### Health Check

- `GET /Health` - Server health status

## Configuration

Set environment variables:

- `PORT` - Server port (default: 49167)
- `DOCS_DATA_ROOT` - Path to store documentation (default: `./data`)



