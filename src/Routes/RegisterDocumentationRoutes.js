const path = require("path");
const express = require("express");

const DocumentationFiles = require("../Constants/DocumentationFiles");
const { StorageFieldNames } = require("../Constants/StorageConstants");
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
        response.redirect(`${routePaths.DocumentationRoot}/${request.params.service}/${DocumentationFiles.Html}`);
    }


    function ensureLoggedIn(request, response, next)
    {
        isLoggedIn(request, response, false)
            .then((ok) =>
            {
                if (ok) return next();
                response.status(httpStatusCodes.Forbidden).json({ message: texts.Unauthorized });
            })
            .catch(() =>
            {
                response.status(httpStatusCodes.Forbidden).json({ message: texts.Unauthorized });
            });
    }

    application.get(routePaths.Services, ensureLoggedIn, async (request, response, next) =>
    {
        request.body.permissionName = "OPEN_DOCUMENTATION";
        const permitted = await isLoggedInWithPermission(request, response, false);
        if (!permitted)
        {
            response.status(httpStatusCodes.Forbidden).json({ message: texts.Unauthorized });
            return;
        }
        const services = DocumentationStore.listDocumentationServices(documentationConfig.dataRoot);
        response.json({ services });
    });




    application.get(routePaths.DocumentationService, ensureLoggedIn, async (request, response, next) =>
    {
        console.log("DocumentationService request from", request.ip, "host:", request.get && request.get('host'));
        console.log("DocumentationService headers:", request.headers);
        request.body.permissionName = "OPEN_DOCUMENTATION";
        const permitted = await isLoggedInWithPermission(request, response, false);
        console.log("DocumentationService permission result:", permitted);
        if (!permitted)
        {
            console.log("DocumentationService: unauthorized for", request.ip);
            response.status(httpStatusCodes.Forbidden).json({ message: texts.Unauthorized });
            return;
        }
        try
        {
            redirectToDocumentationRoot(request, response);
        }
        catch (error)
        {
            response.status(httpStatusCodes.BadRequest).send(error.message);
        }
    });


    application.use(routePaths.DocumentationRoot, ensureLoggedIn, async (request, response, next) =>
    {
        console.log("DocumentationRoot access attempt:", request.ip, request.path);
        console.log("DocumentationRoot headers:", request.headers);
        request.body.permissionName = "OPEN_DOCUMENTATION";
        const permitted = await isLoggedInWithPermission(request, response, false);
        console.log("DocumentationRoot permission result:", permitted);
        if (!permitted)
        {
            console.log("DocumentationRoot: unauthorized for", request.ip, request.path);
            response.status(httpStatusCodes.Forbidden).json({ message: texts.Unauthorized });
            return;
        }
        next();
    }, express.static(documentationConfig.dataRoot, { redirect: false }));
}

module.exports = registerDocumentationRoutes;
