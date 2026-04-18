const path = require("path");
const DocumentationFiles = require("../Constants/DocumentationFiles");
const { StorageFieldNames } = require("../Constants/StorageConstants");

class DocumentationPaths
{
    static buildPaths(dataRoot, service)
    {
        const serviceSlug = String(service || "").trim().toLowerCase().replace(/[^a-z0-9\-]/g, "-");
        const serviceDir = path.join(dataRoot, serviceSlug);

        return {
            serviceSlug,
            serviceDir,
            documentationFile: path.join(serviceDir, DocumentationFiles.Html)
        };
    }
}

module.exports = DocumentationPaths;
