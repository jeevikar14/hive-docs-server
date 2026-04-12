const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");

const config = require("./config");
const {
    ensureDirectory,
    normalizeSlug,
    publishDocs,
    listServices,
    listServiceVersions,
    getLatestVersion
} = require("./storage/docsStore");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

ensureDirectory(config.dataRoot);

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

function renderVersionsPage(result)
{
    const serviceName = result.service || "Unknown";
    const latestVersion = result.latestVersion || "N/A";
    const versions = Array.isArray(result.versions) ? result.versions : [];
    const timestamps = result.versionTimestamps || {};

    const versionRows = versions
        .map((version) => {
            const timestamp = timestamps[version] ? new Date(timestamps[version]).toLocaleString() : "N/A";
            return `
                <tr>
                    <td><strong>${version}</strong></td>
                    <td><a href="/docs/${serviceName}/${version}" target="_blank">📖 View Docs</a></td>
                    <td><code>${timestamp}</code></td>
                </tr>
            `;
        })
        .join("");

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${serviceName} - Versions</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f6f8fb;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        h1 {
            color: #1f2937;
            margin: 0 0 10px 0;
        }
        .subtitle {
            color: #6b7280;
            margin-bottom: 20px;
        }
        .info-box {
            background: #eff6ff;
            border-left: 4px solid #3b82f6;
            padding: 15px;
            margin-bottom: 30px;
            border-radius: 4px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th {
            background: #f3f4f6;
            padding: 12px;
            text-align: left;
            border-bottom: 2px solid #e5e7eb;
            font-weight: 600;
            color: #374151;
        }
        td {
            padding: 12px;
            border-bottom: 1px solid #e5e7eb;
        }
        tr:hover {
            background: #f9fafb;
        }
        a {
            color: #3b82f6;
            text-decoration: none;
            font-weight: 500;
        }
        a:hover {
            text-decoration: underline;
        }
        code {
            background: #f3f4f6;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: "Monaco", "Courier New", monospace;
            font-size: 12px;
        }
        .status {
            display: inline-block;
            padding: 4px 12px;
            background: #d1fae5;
            color: #065f46;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>${serviceName}</h1>
        <p class="subtitle">Available Versions</p>
        
        <div class="info-box">
            <strong>Latest Version:</strong> <span class="status">${latestVersion}</span>
        </div>
        
        <table>
            <thead>
                <tr>
                    <th>Version</th>
                    <th>Documentation</th>
                    <th>Published</th>
                </tr>
            </thead>
            <tbody>
                ${versionRows}
            </tbody>
        </table>
    </div>
</body>
</html>`;
}

function renderSwaggerPage(specUrl, title)
{
    const safeTitle = String(title || "API Documentation").replace(/</g, "&lt;");

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${safeTitle}</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
    <style>
        html, body { margin: 0; padding: 0; height: 100%; }
        #swagger-ui { height: 100%; }
        
        /* Hide schemas section completely */
        .models {
            display: none !important;
        }
        
        /* Hide try-out buttons */
        .opblock .try-out,
        .opblock .opblock-execute,
        .execute-wrapper {
            display: none !important;
        }
        
        /* Hide info section (shows spec URL) */
        .info {
            display: none !important;
        }
    </style>
</head>
<body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
        window.ui = SwaggerUIBundle({
            url: "${specUrl}",
            dom_id: "#swagger-ui",
            deepLinking: true,
            defaultModelsExpandDepth: 0,
            showModels: false,
            supportedSubmitMethods: [],
            docExpansion: "list",
            onComplete: function()
            {
                // Hide schemas section
                const modelsSection = document.querySelector(".models");
                if (modelsSection) modelsSection.style.display = "none";
                
                // Hide info section
                const infoSection = document.querySelector(".info");
                if (infoSection) infoSection.style.display = "none";
            }
        });
    </script>
</body>
</html>`;
}

app.get("/health", (request, response) =>
{
    response.json({
        status: "ok",
        service: "hive-global-doc-server",
        timestamp: new Date().toISOString()
    });
});

app.get("/api/services", (request, response) =>
{
    const services = listServices(config.dataRoot);
    response.json({ services });
});

app.get("/api/services/:service/versions", (request, response) =>
{
    try
    {
        const result = listServiceVersions(config.dataRoot, request.params.service);

        if (!result)
        {
            response.status(404).json({ message: "Service not found." });
            return;
        }

        // Return HTML for browser, JSON for API clients
        const acceptHeader = request.get("Accept") || "";
        if (acceptHeader.includes("text/html"))
        {
            response.type("html").send(renderVersionsPage(result));
        }
        else
        {
            response.json(result);
        }
    }
    catch (error)
    {
        response.status(400).json({ message: error.message });
    }
});

app.get("/docs/:service", (request, response) =>
{
    try
    {
        const latest = getLatestVersion(config.dataRoot, request.params.service);

        if (!latest)
        {
            response.status(404).send("No latest version available for this service.");
            return;
        }

        response.redirect(`/docs/${latest.service}/${latest.latestVersion}`);
    }
    catch (error)
    {
        response.status(400).send(error.message);
    }
});

app.get("/docs/:service/latest", (request, response) =>
{
    try
    {
        const latest = getLatestVersion(config.dataRoot, request.params.service);

        if (!latest)
        {
            response.status(404).send("No latest version available for this service.");
            return;
        }

        response.redirect(`/docs/${latest.service}/${latest.latestVersion}`);
    }
    catch (error)
    {
        response.status(400).send(error.message);
    }
});

app.get("/docs/:service/:version", (request, response) =>
{
    try
    {
        const service = normalizeSlug(request.params.service, "service");
        const version = request.params.version;
        const specFilePath = path.join(config.dataRoot, service, version, "openapi-spec.json");

        if (!path.isAbsolute(specFilePath))
        {
            response.status(400).send("Invalid path.");
            return;
        }

        if (!fs.existsSync(specFilePath))
        {
            response.status(404).send("Documentation version not found.");
            return;
        }

        const specUrl = `/docs/${service}/${version}/openapi-spec.json`;
        response.type("html").send(renderSwaggerPage(specUrl, `${service} ${version} API Docs`));
    }
    catch (error)
    {
        response.status(400).send(error.message);
    }
});

app.use("/docs", express.static(config.dataRoot, { redirect: false }));

app.post(
    "/api/publish",
    upload.fields([
        { name: "documentationHtml", maxCount: 1 },
        { name: "openApiSpec", maxCount: 1 }
    ]),
    (request, response) =>
    {
        try
        {
            const documentationFile = request.files && request.files.documentationHtml
                ? request.files.documentationHtml[0]
                : null;
            const specFile = request.files && request.files.openApiSpec
                ? request.files.openApiSpec[0]
                : null;

            if (!specFile)
            {
                response.status(400).json({
                    message: "openApiSpec file is required."
                });
                return;
            }

            const result = publishDocs(config.dataRoot, {
                service: request.body.service,
                version: request.body.version,
                documentationHtmlBuffer: documentationFile ? documentationFile.buffer : null,
                openApiSpecBuffer: specFile.buffer
            });

            response.status(201).json({
                message: "Documentation published successfully.",
                ...result
            });
        }
        catch (error)
        {
            response.status(400).json({ message: error.message });
        }
    }
);

app.use((request, response) =>
{
    response.status(404).json({ message: "Route not found." });
});

app.listen(config.port, () =>
{
    console.log(`Global docs server running at http://localhost:${config.port}`);
    console.log(`Docs root: ${config.dataRoot}`);
});
