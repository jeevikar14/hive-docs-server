const fs = require("fs");
const path = require("path");
const DocumentationFiles = require("../Constants/DocumentationFiles");
const { StorageFieldNames } = require("../Constants/StorageConstants");

class DocumentationMetadata
{
    static metadataFilePath(dataRoot, serviceSlug)
    {
        return path.join(dataRoot, serviceSlug, DocumentationFiles.Metadata);
    }

    static buildMetadataFromFolders(dataRoot, serviceSlug)
    {
        const serviceDir = path.join(dataRoot, serviceSlug);

        if (!fs.existsSync(serviceDir))
        {
            return {
                service: serviceSlug,
                publishedAt: null
            };
        }

        return {
            service: serviceSlug,
            publishedAt: null
        };
    }

    static readServiceMetadata(dataRoot, serviceSlug)
    {
        const filePath = DocumentationMetadata.metadataFilePath(dataRoot, serviceSlug);

        if (!fs.existsSync(filePath))
        {
            return DocumentationMetadata.buildMetadataFromFolders(dataRoot, serviceSlug);
        }

        try
        {
            const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));

            return {
                service: serviceSlug,
                publishedAt: parsed.publishedAt || null
            };
        }
        catch (error)
        {
            return DocumentationMetadata.buildMetadataFromFolders(dataRoot, serviceSlug);
        }
    }

    static writeServiceMetadata(dataRoot, serviceSlug, metadata)
    {
        const filePath = DocumentationMetadata.metadataFilePath(dataRoot, serviceSlug);
        fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2));
    }
}

module.exports = DocumentationMetadata;
