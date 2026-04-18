    const fs = require("fs");
    const pathModule = require("path");
    const DocumentationStore = require("../Storage/DocumentationStore");

function registerPublishRoutes(application, options)
{
    const routePaths = options.routePaths;
    const documentationConfig = options.documentationConfig;
    const httpStatusCodes = options.httpStatusCodes;
    const uploadMiddleware = options.uploadMiddleware;
    const texts = options.texts;
    const { StorageTexts } = require("../Constants/StorageConstants");
    const { findService } = require("@hivedev/hivesdk/server");
    const ConfigDefaults = require("../Constants/ConfigDefaults");

    async function verifyRequestFromPortal(request, response, next)
    {
        console.log("Publish verify: incoming request from", request.ip, request.get && request.get('host'));
        try
        {
            const attemptsDir = documentationConfig.dataRoot;
            fs.mkdirSync(attemptsDir, { recursive: true });
            const attemptsFile = pathModule.join(attemptsDir, "publish_attempts.json");
            let attempts = [];
            try
            {
                const raw = fs.readFileSync(attemptsFile, "utf8");
                attempts = JSON.parse(raw || "[]");
            }
            catch (e)
            {
                attempts = [];
            }
            attempts.push({
                timestamp: new Date().toISOString(),
                ip: String(request.ip || request.connection?.remoteAddress || request.socket?.remoteAddress || ""),
                host: (request.get && request.get('host')) || "",
                headers: Object.assign({}, request.headers)
            });
            try
            {
                fs.writeFileSync(attemptsFile, JSON.stringify(attempts, null, 2), "utf8");
            }
            catch (e)
            {
            }
        }
        catch (e)
        {
            console.log("Publish verify: failed to record attempt:", e && e.message);
        }
        try
        {
            const portalName = documentationConfig.hive.portalServiceName || ConfigDefaults.DefaultPortalServiceName;
            const service = await findService(portalName);
            console.log("Publish verify: findService returned for", portalName, service && typeof service === 'object' ? { urls: service.urls, raw: service } : service);

            if (!service || !service.urls)
            {
                response.status(httpStatusCodes.Forbidden).json({ message: texts.Forbidden });
                return;
            }

            const candidates = [];

            if (service.urls.local)
            {
                candidates.push(service.urls.local);
            }

            if (service.urls.remote)
            {
                candidates.push(service.urls.remote);
            }

            const reqIp = String(request.ip || request.connection?.remoteAddress || request.socket?.remoteAddress || "");
            const hostHeader = (request.get && request.get("host")) || "";
            const xForwardedFor = String(request.get && request.get('x-forwarded-for') || "");
            const referer = String(request.get && request.get('referer') || request.get && request.get('referrer') || "");
            const originHeader = String(request.get && request.get('origin') || "");

            function isLoopbackAddress(ip)
            {
                if (!ip) return false;
                return ip === "127.0.0.1" || ip === "::1" || ip.startsWith("::ffff:127.") || ip.startsWith("127.") || ip.includes("localhost");
            }

            let matched = false;

            for (const candidateUrl of candidates)
            {
                try
                {
                    let candidateHost = "";

                    try
                    {
                        const parsed = new URL(candidateUrl);
                        candidateHost = parsed.hostname || "";
                    }
                    catch (e)
                    {
                        let tmp = String(candidateUrl || "");
                        tmp = tmp.replace(/^https?:\/\//i, "");
                        tmp = tmp.split('/')[0];
                        if (tmp.includes('@')) tmp = tmp.split('@').pop();
                        candidateHost = tmp.split(':')[0] || "";
                        console.log("Publish verify: parsed candidateUrl fallback", candidateUrl, "->", candidateHost);
                    }

                    candidateHost = String(candidateHost || "");

                    if (["localhost", "127.0.0.1", "::1"].includes(candidateHost) || candidateHost.startsWith("::ffff:127."))
                    {
                        if (isLoopbackAddress(reqIp) || hostHeader.includes("localhost") || hostHeader.includes("127.0.0.1"))
                        {
                            matched = true;
                            break;
                        }
                    }

                    if (
                        (reqIp && candidateHost && reqIp.includes(candidateHost)) ||
                        (hostHeader && candidateHost && hostHeader.includes(candidateHost)) ||
                        (xForwardedFor && candidateHost && xForwardedFor.includes(candidateHost)) ||
                        (referer && candidateHost && referer.includes(candidateHost)) ||
                        (originHeader && candidateHost && originHeader.includes(candidateHost))
                    )
                    {
                        matched = true;
                        break;
                    }
                }
                catch (e)
                {
                    console.log("Publish verify: error while checking candidateUrl", candidateUrl, e && e.message);
                }
            }

            if (!matched)
            {
                console.log("Publish verify: origin not matched", {
                    reqIp,
                    hostHeader,
                    xForwardedFor,
                    referer,
                    originHeader,
                    candidates,
                    headers: request.headers
                });
                response.status(httpStatusCodes.Forbidden).json({ message: texts.Forbidden });
                return;
            }

            next();
        }
        catch (error)
        {
            response.status(httpStatusCodes.Forbidden).json({ message: texts.Forbidden });
        }
    }

    application.post(
        routePaths.Publish,
        verifyRequestFromPortal,
        uploadMiddleware.fields([
            { name: "document", maxCount: 1 }
        ]),
        (request, response) =>
        {
            console.log("Publish route hit from", request.ip, "host:", request.get && request.get('host'));
            console.log("Publish route headers:", request.headers);
            try
            {
                console.log("Publish debug: request.body keys:", Object.keys(request.body || {}));
                if (request.files)
                {
                    console.log("Publish debug: request.files keys:", Object.keys(request.files));
                    for (const [key, files] of Object.entries(request.files))
                    {
                        for (const file of files)
                        {
                            console.log(`Publish debug: file field='${key}', originalname='${file.originalname}', size=${file.size}`);
                        }
                    }
                }
                else
                {
                    console.log("Publish debug: request.files is undefined or empty");
                }
            }
            catch (e)
            {
                console.log("Publish debug: error logging request body/files", e && e.message);
            }
            try
            {
                if (request.is && request.is("application/json") && request.body && (request.body.documentationHtml || request.body.documentationHTML))
                {
                    console.log("Publish route: JSON publish for service", request.body.serviceName || request.body.service);
                    const service = request.body.serviceName || request.body.service;

                    if (!service)
                    {
                        response.status(httpStatusCodes.BadRequest).json({ message: "JSON field 'serviceName' is required." });
                        return;
                    }

                    const 
                    html = request.body.documentationHtml || request.body.documentationHTML;

                    let publishResult;
                    try
                    {
                        publishResult = DocumentationStore.publishDocumentation(documentationConfig.dataRoot, {
                            service,
                            documentationHtmlBuffer: Buffer.from(String(html || ""), "utf8")
                        });
                        console.log("Publish debug: wrote documentation for service", service, "at", publishResult.documentationPath);
                    }
                    catch (err)
                    {
                        console.error("Publish debug: failed to write documentation for service", service, err && err.message);
                        response.status(httpStatusCodes.BadRequest).json({ message: err.message });
                        return;
                    }
                    response.status(httpStatusCodes.Created).json({ message: texts.DocumentationPublished, ...publishResult });
                    return;
                }

                const documentationFile = request.files?.document ? request.files.document[0] : null;

                if (!documentationFile)
                {
                    response.status(httpStatusCodes.BadRequest).json({ message: "'document' file is required." });
                    return;
                }
                const forcedService = 'NoteHive';
                let publishResult;
                try
                {
                    publishResult = DocumentationStore.publishDocumentation(documentationConfig.dataRoot, {
                        service: forcedService,
                        documentationHtmlBuffer: documentationFile.buffer
                    });
                    console.log("Publish debug: wrote documentation for service", forcedService, "at", publishResult.documentationPath);
                }
                catch (err)
                {
                    console.error("Publish debug: failed to write documentation for service", forcedService, err && err.message);
                    response.status(httpStatusCodes.BadRequest).json({ message: err.message });
                    return;
                }
                response.status(httpStatusCodes.Created).json({ message: texts.DocumentationPublished, ...publishResult });
            }
            catch (error)
            {
                response.status(httpStatusCodes.BadRequest).json({ message: error.message });
            }
        }
    );
}

module.exports = registerPublishRoutes;
