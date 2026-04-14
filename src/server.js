const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const express = require("express");
const multer = require("multer");
const cookieParser = require("cookie-parser");
const {
    initServer,
    loadConfiguration,
    saveConfiguration,
    handleHiveRequests,
    isLoggedIn,
    isLoggedInWithPermission,
    registerService
} = require("@hivedev/hivesdk/server");

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
const permissionRequestsFile = path.join(config.dataRoot, "permission-requests.json");
const hiveRegistration = {
    state: "not-started",
    lastSuccessAt: null,
    lastError: null,
    attempts: 0
};

ensureDirectory(config.dataRoot);

app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use((request, response, next) =>
{
    if (!request.headers["x-device-id"] && request.cookies?.hiveDeviceId)
    {
        request.headers["x-device-id"] = request.cookies.hiveDeviceId;
    }

    if (!request.headers["x-session-token"] && request.cookies?.sessionToken)
    {
        request.headers["x-session-token"] = request.cookies.sessionToken;
    }

    next();
});

app.use(handleHiveRequests);
app.use(express.static(path.join(__dirname, "..", "public")));

function getHiveBaseUrl(request)
{
    if (config.hive.remoteUrl)
    {
        return config.hive.remoteUrl.replace(/\/$/, "");
    }

    const host = request && request.hostname ? request.hostname : "127.0.0.1";
    return `http://${host}:49152`;
}

function getDocsBaseUrl(request)
{
    if (config.docsBaseUrl)
    {
        return config.docsBaseUrl.replace(/\/$/, "");
    }

    const protocol = request?.protocol || "http";
    const host = request?.get ? request.get("host") : `localhost:${config.port}`;
    return `${protocol}://${host}`;
}

function buildHiveLoginUrl(request)
{
    const returnTo = `${getDocsBaseUrl(request)}${request.originalUrl}`;
    return `${getHiveBaseUrl(request)}/Client/Pages/HivePortalLoginPage.html?redirectUrl=${encodeURIComponent(returnTo)}`;
}

function isApiRequest(request)
{
    return String(request.path || "").startsWith("/api/");
}

function renderLoginPopupPage()
{
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Login Required</title>
</head>
<body style="font-family: Segoe UI, Tahoma, sans-serif; padding: 24px;">
    <h2>Login Required</h2>
    <p>Click the button below to open Hive login popup.</p>
    <button id="openLogin" style="padding: 10px 14px; border-radius: 8px; border: 0; background: #0ea5e9; color: white; font-weight: 600; cursor: pointer;">Login to Hive</button>
    <p id="loginStatus" style="margin-top: 12px; color: #475569;"></p>
    <script type="module">
        import { initClient, login } from "/hive-client.js";

        const button = document.getElementById("openLogin");
        const status = document.getElementById("loginStatus");

        button.addEventListener("click", async () => {
            try
            {
                button.disabled = true;
                status.textContent = "Waiting for login popup...";
                await initClient({});
                await login();
                status.textContent = "If popup opened, complete login and return here.";
            }
            catch (error)
            {
                status.textContent = "Popup blocked. Allow popups for this site and click again.";
                console.error("Hive login popup failed", error);
            }
            finally
            {
                button.disabled = false;
            }
        });

        window.addEventListener("focus", () => {
            window.location.reload();
        });
    </script>
</body>
</html>`;
}

function readPermissionRequests()
{
    if (!fs.existsSync(permissionRequestsFile))
    {
        return [];
    }

    try
    {
        const raw = fs.readFileSync(permissionRequestsFile, "utf8");
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch (error)
    {
        return [];
    }
}

function writePermissionRequests(requests)
{
    fs.writeFileSync(permissionRequestsFile, JSON.stringify(requests, null, 2));
}

async function forwardPermissionRequestToHive(request, permissionName, reason)
{
    const configured = String(process.env.HIVE_PERMISSION_REQUEST_ENDPOINTS || process.env.HIVE_PERMISSION_REQUEST_ENDPOINT || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    const candidateEndpoints = configured.length > 0
        ? configured
        : ["/RequestPermission", "/CreatePermissionRequest", "/RequestApproval"];

    if (candidateEndpoints.length === 0)
    {
        return {
            forwarded: false,
            reason: "No Hive permission request endpoint is configured."
        };
    }

    const headers = {
        "Content-Type": "application/json",
        "x-device-id": request.headers["x-device-id"] || "",
        "x-session-token": request.headers["x-session-token"] || ""
    };

    if (request.headers.cookie)
    {
        headers.Cookie = request.headers.cookie;
    }

    for (const endpoint of candidateEndpoints)
    {
        const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
        const url = `${getHiveBaseUrl(request)}${normalizedEndpoint}`;

        try
        {
            const hiveResponse = await fetch(url, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    permissionName,
                    reason,
                    serviceName: config.hive.serviceName
                })
            });

            let payload = null;
            try
            {
                payload = await hiveResponse.json();
            }
            catch (error)
            {
                payload = null;
            }

            if (hiveResponse.ok)
            {
                return {
                    forwarded: true,
                    endpoint: normalizedEndpoint,
                    status: hiveResponse.status,
                    payload
                };
            }
        }
        catch (error)
        {
        }
    }

    return {
        forwarded: false,
        reason: "No Hive permission request endpoint accepted the request."
    };
}

function getRequesterKey(request)
{
    return String(
        request.headers["x-user-id"]
        || request.headers["x-device-id"]
        || request.headers["x-session-token"]
        || request.cookies?.sessionToken
        || request.ip
        || "anonymous"
    );
}

function getActorLabel(request)
{
    return String(
        request.headers["x-user-name"]
        || request.headers["x-user-id"]
        || request.headers["x-device-id"]
        || request.cookies?.sessionToken
        || request.ip
        || "unknown"
    );
}

async function hasHivePermission(request, response, permissionName)
{
    const originalBody = request.body;
    request.body = { ...(originalBody || {}), permissionName };

    try
    {
        return await isLoggedInWithPermission(request, response, false);
    }
    finally
    {
        request.body = originalBody;
    }
}

async function requireHiveLogin(request, response, next)
{
    try
    {
        const loggedIn = await isLoggedIn(request, response, false);

        if (!loggedIn)
        {
            if (isApiRequest(request))
            {
                response.status(401).json({
                    message: "Unauthorized.",
                    loginUrl: buildHiveLoginUrl(request)
                });
                return;
            }

            response.status(401).type("html").send(renderLoginPopupPage());
            return;
        }

        next();
    }
    catch (error)
    {
        if (isApiRequest(request))
        {
            response.status(401).json({
                message: "Unauthorized.",
                loginUrl: buildHiveLoginUrl(request)
            });
            return;
        }

        response.status(401).type("html").send(renderLoginPopupPage());
    }
}

function requireHivePermission(permissionName)
{
    return async (request, response, next) =>
    {
        try
        {
            const loggedIn = await isLoggedIn(request, response, false);

            if (!loggedIn)
            {
                if (isApiRequest(request))
                {
                    response.status(401).json({
                        message: "Unauthorized.",
                        loginUrl: buildHiveLoginUrl(request)
                    });
                    return;
                }

                response.status(401).type("html").send(renderLoginPopupPage());
                return;
            }

            request.body = request.body || {};
            request.body.permissionName = permissionName;

            const permitted = await isLoggedInWithPermission(request, response, false);

            if (!permitted)
            {
                if (isApiRequest(request))
                {
                    response.status(403).json({
                        message: "Forbidden.",
                        requiredPermission: permissionName,
                        requestPermissionEndpoint: "/api/permissions/request"
                    });
                    return;
                }

                response.status(403).type("html").send(
                    `<h2>Forbidden</h2><p>Missing permission: <strong>${permissionName}</strong></p>`
                );
                return;
            }

            next();
        }
        catch (error)
        {
            if (isApiRequest(request))
            {
                response.status(403).json({
                    message: "Forbidden.",
                    requiredPermission: permissionName,
                    requestPermissionEndpoint: "/api/permissions/request"
                });
                return;
            }

            response.status(403).type("html").send(
                `<h2>Forbidden</h2><p>Missing permission: <strong>${permissionName}</strong></p>`
            );
        }
    };
}

function requireAnyHivePermission(permissionNames)
{
    const names = Array.isArray(permissionNames) ? permissionNames.filter(Boolean) : [];

    return async (request, response, next) =>
    {
        try
        {
            const loggedIn = await isLoggedIn(request, response, false);

            if (!loggedIn)
            {
                if (isApiRequest(request))
                {
                    response.status(401).json({
                        message: "Unauthorized.",
                        loginUrl: buildHiveLoginUrl(request)
                    });
                    return;
                }

                response.status(401).type("html").send(renderLoginPopupPage());
                return;
            }

            const originalBody = request.body;

            for (const permissionName of names)
            {
                request.body = { ...(originalBody || {}), permissionName };
                const permitted = await isLoggedInWithPermission(request, response, false);

                if (permitted)
                {
                    request.body = originalBody;
                    next();
                    return;
                }
            }

            request.body = originalBody;

            response.status(403).json({
                message: "Forbidden.",
                requiredPermissions: names,
                requestPermissionEndpoint: "/api/permissions/request"
            });
        }
        catch (error)
        {
            response.status(403).json({
                message: "Forbidden.",
                requiredPermissions: names,
                requestPermissionEndpoint: "/api/permissions/request"
            });
        }
    };
}

const requireDocsViewPermission = requireAnyHivePermission([
    config.hive.docsViewPermission,
    config.hive.docsPublishPermission
]);

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

        .models {
            display: none !important;
        }

        .opblock .try-out,
        .opblock .opblock-execute,
        .execute-wrapper {
            display: none !important;
        }

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
                const modelsSection = document.querySelector(".models");
                if (modelsSection) modelsSection.style.display = "none";

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
        timestamp: new Date().toISOString(),
        hiveRegistration
    });
});

app.get("/api/public-config", (request, response) =>
{
    response.json({
        docsViewPermission: config.hive.docsViewPermission,
        docsPublishPermission: config.hive.docsPublishPermission,
        hiveLoginUrl: `${getHiveBaseUrl(request)}/Client/Pages/HivePortalLoginPage.html`
    });
});

app.get("/api/auth/status", async (request, response) =>
{
    try
    {
        const loggedIn = await isLoggedIn(request, response, false);

        if (!loggedIn)
        {
            response.json({
                loggedIn: false,
                canViewDocs: false,
                loginUrl: buildHiveLoginUrl(request)
            });
            return;
        }

        const originalBody = request.body;

        request.body = { ...(originalBody || {}), permissionName: config.hive.docsViewPermission };
        const hasDocsViewPermission = await isLoggedInWithPermission(request, response, false);

        request.body = { ...(originalBody || {}), permissionName: config.hive.docsPublishPermission };
        const hasDocsPublishPermission = await isLoggedInWithPermission(request, response, false);

        request.body = originalBody;

        response.json({
            loggedIn: true,
            hasDocsViewPermission,
            hasDocsPublishPermission,
            canViewDocs: Boolean(hasDocsViewPermission || hasDocsPublishPermission)
        });
    }
    catch (error)
    {
        response.status(500).json({ message: "Unable to determine auth status." });
    }
});

app.post("/api/permissions/request", requireHiveLogin, (request, response) =>
{
    (async () =>
    {
        const permissionName = String(request.body?.permissionName || config.hive.docsViewPermission).trim();
        const reason = String(request.body?.reason || "").trim();

        if (!permissionName)
        {
            response.status(400).json({ message: "permissionName is required." });
            return;
        }

        const alreadyPermitted = await hasHivePermission(request, response, permissionName);
        if (alreadyPermitted)
        {
            response.status(200).json({
                message: "You already have this permission.",
                permissionName
            });
            return;
        }

        const requests = readPermissionRequests();
        const requesterKey = getRequesterKey(request);
        const now = new Date().toISOString();

        const existingPending = requests.find((item) =>
            item.requesterKey === requesterKey
            && item.permissionName === permissionName
            && item.status === "pending"
        );

        if (existingPending)
        {
            response.status(200).json({
                message: "A pending request already exists.",
                request: existingPending
            });
            return;
        }

        const hiveForwardResult = await forwardPermissionRequestToHive(request, permissionName, reason);

        const permissionRequest = {
            id: `req_${Date.now()}`,
            requesterKey,
            permissionName,
            reason,
            status: "pending",
            createdAt: now,
            hiveForwarded: hiveForwardResult.forwarded,
            hiveEndpoint: hiveForwardResult.endpoint || null,
            hiveStatusCode: hiveForwardResult.status || null,
            hiveForwardReason: hiveForwardResult.reason || null
        };

        requests.push(permissionRequest);
        writePermissionRequests(requests);

        response.status(202).json({
            message: hiveForwardResult.forwarded
                ? "Permission request sent to Hive server. Access will be granted after Hive approval and role assignment."
                : "Permission request recorded. Ask Hive admin to approve by assigning the required role in Hive.",
            request: permissionRequest,
            hiveForwarded: hiveForwardResult.forwarded
        });
    })().catch((error) =>
    {
        response.status(400).json({ message: error.message });
    });
});

app.get("/api/permissions/request/mine", requireHiveLogin, (request, response) =>
{
    const requesterKey = getRequesterKey(request);
    const requests = readPermissionRequests().filter((item) => item.requesterKey === requesterKey);
    response.json({ requests });
});

app.get("/api/services", requireDocsViewPermission, (request, response) =>
{
    const services = listServices(config.dataRoot);
    response.json({ services });
});

app.get("/api/services/:service/versions", requireDocsViewPermission, (request, response) =>
{
    try
    {
        const result = listServiceVersions(config.dataRoot, request.params.service);

        if (!result)
        {
            response.status(404).json({ message: "Service not found." });
            return;
        }

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

app.get("/docs/:service", requireDocsViewPermission, (request, response) =>
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

app.get("/docs/:service/latest", requireDocsViewPermission, (request, response) =>
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

app.get("/docs/:service/:version", requireDocsViewPermission, (request, response) =>
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

app.use("/docs", requireDocsViewPermission, express.static(config.dataRoot, { redirect: false }));

app.post(
    "/api/publish",
    requireHivePermission(config.hive.docsPublishPermission),
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

function getHostIp()
{
    const interfaces = os.networkInterfaces();

    for (const name of Object.keys(interfaces))
    {
        for (const detail of interfaces[name] || [])
        {
            if (detail && detail.family === "IPv4" && !detail.internal)
            {
                return detail.address;
            }
        }
    }

    return "127.0.0.1";
}

function getRegistrationLocalUrl()
{
    if (config.docsBaseUrl)
    {
        return config.docsBaseUrl.replace(/\/$/, "");
    }

    return `http://localhost:${config.port}`;
}

function decryptConfigurationPayload(encryptedBase64, password)
{
    const payload = Buffer.from(encryptedBase64, "base64");
    const iv = payload.subarray(0, 16);
    const encrypted = payload.subarray(16);
    const key = crypto.scryptSync(password, "salt", 32);
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

    return JSON.parse(decrypted.toString("utf8"));
}

async function registerServiceWithHive()
{
    hiveRegistration.state = "registering";
    hiveRegistration.attempts += 1;
    hiveRegistration.lastError = null;

    const hiveBase = config.hive.remoteUrl || "http://127.0.0.1:49152";
    const serviceName = config.hive.serviceName;
    const urls = {
        local: getRegistrationLocalUrl(),
        remote: config.hive.remoteUrl || ""
    };

    console.log("Registering service...");

    const registerResponse = await fetch(`${hiveBase}/RegisterService`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceName, urls })
    });

    if (!registerResponse.ok)
    {
        throw new Error(`RegisterService failed with status ${registerResponse.status}`);
    }

    const maxAttempts = 30;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1)
    {
        const configurationResponse = await fetch(`${hiveBase}/Configuration`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ serviceName })
        });

        if (configurationResponse.ok)
        {
            const encryptedConfiguration = await configurationResponse.text();
            const configurationObject = decryptConfigurationPayload(encryptedConfiguration, config.hive.serverPassword);

            console.log("Configuration received.");
            console.log("Saving configuration...");
            await saveConfiguration(configurationObject);
            console.log("Service registered.");
            hiveRegistration.state = "registered";
            hiveRegistration.lastSuccessAt = new Date().toISOString();
            return;
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    throw new Error("Timed out waiting for service approval/configuration.");
}

async function startServer()
{
    process.env.SERVER_PASSWORD = config.hive.serverPassword;
    process.env.WORD = config.hive.serverPassword;

    await initServer({
        serviceName: config.hive.serviceName,
        servicePort: config.port,
        remoteUrl: config.hive.remoteUrl,
        serverPassword: config.hive.serverPassword
    });

    await loadConfiguration();

    await new Promise((resolve) =>
    {
        app.listen(config.port, () =>
        {
            console.log(`Global docs server running at http://localhost:${config.port}`);
            console.log(`Docs root: ${config.dataRoot}`);
            console.log(`Hive service: ${config.hive.serviceName}`);
            resolve();
        });
    });

    try
    {
        await registerService();
    }
    catch (error)
    {
        hiveRegistration.state = "failed";
        hiveRegistration.lastError = error.message;
        console.error("Hive registration failed. Docs server will keep running:", error.message);

        setInterval(async () =>
        {
            if (hiveRegistration.state === "registered")
            {
                return;
            }

            try
            {
                console.log("Retrying Hive registration...");
                await registerServiceWithHive();
            }
            catch (retryError)
            {
                hiveRegistration.state = "failed";
                hiveRegistration.lastError = retryError.message;
                console.error("Hive registration retry failed:", retryError.message);
            }
        }, 30000);
    }
}

startServer().catch((error) =>
{
    console.error("Failed to start global docs server:", error.message);
    process.exit(1);
});
