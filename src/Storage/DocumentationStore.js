const fs = require("fs");
const path = require("path");
const DocumentationFiles = require("../Constants/DocumentationFiles");
const RoutePaths = require("../Constants/RoutePaths");

const DocumentationMetadata = require("./DocumentationMetadata");
const DocumentationPaths = require("./DocumentationPaths");

class DocumentationStore
{
    static ensureDirectory(dirPath)
    {
        fs.mkdirSync(dirPath, { recursive: true });
    }

    // Publish documentation for a service (versioning removed)
    static publishDocumentation(dataRoot, input)
    {
        const { serviceSlug, serviceDir, documentationFile } = DocumentationPaths.buildPaths(
            dataRoot,
            input.service
        );

        DocumentationStore.ensureDirectory(serviceDir);

        if (input.documentationHtmlBuffer)
        {
            fs.writeFileSync(documentationFile, input.documentationHtmlBuffer);
        }

        const publishedAt = new Date().toISOString();

        const newMetadata = {
            service: serviceSlug,
            publishedAt
        };

        DocumentationMetadata.writeServiceMetadata(dataRoot, serviceSlug, newMetadata);

        return {
            service: serviceSlug,
            viewerPath: `${RoutePaths.DocumentationRoot}/${serviceSlug}`,
            documentationPath: fs.existsSync(documentationFile)
                ? `${RoutePaths.DocumentationRoot}/${serviceSlug}/${DocumentationFiles.Html}`
                : null,
            publishedAt
        };
    }

    static listDocumentationServices(dataRoot)
    {
        DocumentationStore.ensureDirectory(dataRoot);

        const services = [];
        const serviceEntries = fs.readdirSync(dataRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());

        for (const serviceEntry of serviceEntries)
        {
            // Only include if documentation.html exists
            const docFile = path.join(dataRoot, serviceEntry.name, "documentation.html");
            if (fs.existsSync(docFile))
            {
                const metadata = DocumentationMetadata.readServiceMetadata(dataRoot, serviceEntry.name);
                console.log(`[DEBUG] Service: ${serviceEntry.name}, Metadata:`, metadata);
                services.push({
                    service: serviceEntry.name,
                    latestVersion: null,
                    latestPublishedAt: metadata && metadata.publishedAt ? metadata.publishedAt : null,
                    publishedAt: metadata && metadata.publishedAt ? metadata.publishedAt : null,
                    versions: [],
                    versionTimestamps: {}
                });
            }
        }

        return services.sort((left, right) => left.service.localeCompare(right.service));
    }

    static listServiceVersions(dataRoot, service)
    {
        const serviceSlug = String(service || "").trim().toLowerCase().replace(/[^a-z0-9\-]/g, "-");
        const serviceDir = path.join(dataRoot, serviceSlug);

        if (!fs.existsSync(serviceDir))
        {
            return null;
        }

        const metadata = DocumentationMetadata.readServiceMetadata(dataRoot, serviceSlug);

        return {
            service: serviceSlug,
            latestVersion: null,
            versions: [],
            versionTimestamps: {}
        };
    }

    static getLatestDocumentationVersion(dataRoot, service)
    {
        const serviceSlug = String(service || "").trim().toLowerCase().replace(/[^a-z0-9\-]/g, "-");
        const serviceDir = path.join(dataRoot, serviceSlug);

        if (!fs.existsSync(serviceDir))
        {
            return null;
        }

        const metadata = DocumentationMetadata.readServiceMetadata(dataRoot, serviceSlug);

        return {
            service: serviceSlug,
            latest: null
        };
    }
}

module.exports = DocumentationStore;
