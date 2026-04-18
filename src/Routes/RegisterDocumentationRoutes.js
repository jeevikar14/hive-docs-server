const path = require("path");
const express = require("express");

const DocumentationFiles = require("../Constants/DocumentationFiles");
const { StorageFieldNames } = require("../Constants/StorageConstants");
const renderVersionsPage = require("../Views/VersionsPageRenderer");
const DocumentationStore = require("../Storage/DocumentationStore");


const { isLoggedIn, isLoggedInWithPermission } = require("@hivedev/hivesdk/server");

function registerDocumentationRoutes(application, options)
{
    const fs = options.fs;
    const routePaths = options.routePaths;
    const documentationConfig = options.documentationConfig;
    const httpStatusCodes = options.httpStatusCodes;
    const texts = options.texts;

    function redirectToDocumentationRoot(request, response)
    {
        // Redirect to the actual documentation file under the protected static root
        response.redirect(`${routePaths.DocumentationRoot}/${request.params.service}/${DocumentationFiles.Html}`);
    }


    // Helper middleware: wrap SDK isLoggedIn so Express `next` isn't treated as bSendResponse
    function ensureLoggedIn(request, response, next) {
        isLoggedIn(request, response, false)
            .then((ok) => {
                if (ok) return next();
                response.status(httpStatusCodes.Forbidden).json({ message: texts.Unauthorized });
            })
            .catch(() => {
                response.status(httpStatusCodes.Forbidden).json({ message: texts.Unauthorized });
            });
    }

    // Protect with Hive SDK: must be logged in and have OPEN_DOCUMENTATION permission
    application.get(routePaths.Services, ensureLoggedIn, async (request, response, next) => {
        request.body.permissionName = "OPEN_DOCUMENTATION";
        const permitted = await isLoggedInWithPermission(request, response, false);
        if (!permitted) {
            response.status(httpStatusCodes.Forbidden).json({ message: texts.Unauthorized });
            return;
        }
        const services = DocumentationStore.listDocumentationServices(documentationConfig.dataRoot);
        response.json({ services });
    });


    application.get(routePaths.ServiceVersions, ensureLoggedIn, async (request, response, next) => {
        request.body.permissionName = "OPEN_DOCUMENTATION";
        const permitted = await isLoggedInWithPermission(request, response, false);
        if (!permitted) {
            response.status(httpStatusCodes.Forbidden).json({ message: texts.Unauthorized });
            return;
        }
        try {
            const result = DocumentationStore.listServiceVersions(documentationConfig.dataRoot, request.params.service);
            if (!result) {
                response.status(httpStatusCodes.NotFound).json({ message: texts.ServiceNotFound });
                return;
            }
            const acceptHeader = request.get("Accept") || "";
            if (acceptHeader.includes("text/html")) {
                response.type("html").send(renderVersionsPage(result));
                return;
            }
            response.json(result);
        } catch (error) {
            response.status(httpStatusCodes.BadRequest).json({ message: error.message });
        }
    });


    application.get(routePaths.DocumentationService, ensureLoggedIn, async (request, response, next) => {
        console.log("DocumentationService request from", request.ip, "host:", request.get && request.get('host'));
        console.log("DocumentationService headers:", request.headers);
        request.body.permissionName = "OPEN_DOCUMENTATION";
        const permitted = await isLoggedInWithPermission(request, response, false);
        console.log("DocumentationService permission result:", permitted);
        if (!permitted) {
            console.log("DocumentationService: unauthorized for", request.ip);
            response.status(httpStatusCodes.Forbidden).json({ message: texts.Unauthorized });
            return;
        }
        try {
            redirectToDocumentationRoot(request, response);
        } catch (error) {
            response.status(httpStatusCodes.BadRequest).send(error.message);
        }
    });


    application.get(routePaths.DocumentationLatest, ensureLoggedIn, async (request, response, next) => {
        request.body.permissionName = "OPEN_DOCUMENTATION";
        const permitted = await isLoggedInWithPermission(request, response, false);
        if (!permitted) {
            response.status(httpStatusCodes.Forbidden).json({ message: texts.Unauthorized });
            return;
        }
        try {
            redirectToDocumentationRoot(request, response);
        } catch (error) {
            response.status(httpStatusCodes.BadRequest).send(error.message);
        }
    });


    application.get(routePaths.DocumentationVersion, ensureLoggedIn, async (request, response, next) => {
        request.body.permissionName = "OPEN_DOCUMENTATION";
        const permitted = await isLoggedInWithPermission(request, response, false);
        if (!permitted) {
            response.status(httpStatusCodes.Forbidden).json({ message: texts.Unauthorized });
            return;
        }
        try {
            // Version parameter is ignored. Serve the service-level documentation.html
            const serviceSlug = String(request.params.service || "").trim().toLowerCase().replace(/[^a-z0-9\-]/g, "-");
            const documentationFilePath = path.join(documentationConfig.dataRoot, serviceSlug, DocumentationFiles.Html);
            if (!path.isAbsolute(documentationFilePath)) {
                response.status(httpStatusCodes.BadRequest).send(texts.InvalidPath);
                return;
            }
            if (fs.existsSync(documentationFilePath)) {
                try {
                    const raw = fs.readFileSync(documentationFilePath, "utf8");
                    response.type("html").send(raw);
                    return;
                } catch (error) {
                    response.status(httpStatusCodes.BadRequest).send(error.message);
                    return;
                }
            }
            response.status(httpStatusCodes.NotFound).send(texts.DocumentationVersionNotFound);
        } catch (error) {
            response.status(httpStatusCodes.BadRequest).send(error.message);
        }
    });

    application.use(routePaths.DocumentationRoot, ensureLoggedIn, async (request, response, next) => {
        console.log("DocumentationRoot access attempt:", request.ip, request.path);
        console.log("DocumentationRoot headers:", request.headers);
        request.body.permissionName = "OPEN_DOCUMENTATION";
        const permitted = await isLoggedInWithPermission(request, response, false);
        console.log("DocumentationRoot permission result:", permitted);
        if (!permitted) {
            console.log("DocumentationRoot: unauthorized for", request.ip, request.path);
            response.status(httpStatusCodes.Forbidden).json({ message: texts.Unauthorized });
            return;
        }
        next();
    }, express.static(documentationConfig.dataRoot, { redirect: false }));
}

module.exports = registerDocumentationRoutes;
