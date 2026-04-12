const fs = require("fs");
const path = require("path");

const VERSION_PATTERN = /^v\d+\.\d+\.\d+$/;
const METADATA_FILE_NAME = "metadata.json";

function ensureDirectory(dirPath)
{
    fs.mkdirSync(dirPath, { recursive: true });
}

function normalizeSlug(value, fieldName)
{
    const normalized = String(value || "").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");

    if (!normalized) {
        throw new Error(`${fieldName} is required.`);
    }

    return normalized;
}

function normalizeVersion(version)
{
    const value = String(version || "").trim();

    if (!value) {
        throw new Error("version is required.");
    }

    const withPrefix = value.startsWith("v") ? value : `v${value}`;

    if (!VERSION_PATTERN.test(withPrefix)) {
        throw new Error("version must follow semver format like v1.0.0");
    }

    return withPrefix;
}

function parseVersion(version)
{
    const numeric = String(version).replace(/^v/, "").split(".").map((segment) => Number(segment));
    return {
        major: numeric[0] || 0,
        minor: numeric[1] || 0,
        patch: numeric[2] || 0
    };
}

function compareVersions(left, right)
{
    const a = parseVersion(left);
    const b = parseVersion(right);

    if (a.major !== b.major) {
        return a.major - b.major;
    }

    if (a.minor !== b.minor) {
        return a.minor - b.minor;
    }

    return a.patch - b.patch;
}

function sortVersions(versions)
{
    return [...versions].sort(compareVersions);
}

function metadataFilePath(dataRoot, serviceSlug)
{
    return path.join(dataRoot, serviceSlug, METADATA_FILE_NAME);
}

function readServiceMetadata(dataRoot, serviceSlug)
{
    const filePath = metadataFilePath(dataRoot, serviceSlug);
    const serviceDir = path.join(dataRoot, serviceSlug);

    function buildFromFolders()
    {
        if (!fs.existsSync(serviceDir))
        {
            return {
                service: serviceSlug,
                latest: null,
                versions: [],
                publishedAt: {}
            };
        }

        const versions = fs.readdirSync(serviceDir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .map((version) => {
                try {
                    return normalizeVersion(version);
                }
                catch (error)
                {
                    return null;
                }
            })
            .filter(Boolean);

        const sorted = sortVersions(Array.from(new Set(versions)));

        return {
            service: serviceSlug,
            latest: sorted[sorted.length - 1] || null,
            versions: sorted,
            publishedAt: {}
        };
    }

    if (!fs.existsSync(filePath))
    {
        return buildFromFolders();
    }

    try
    {
        const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
        const versions = Array.isArray(parsed.versions) ? parsed.versions : [];
        const normalizedVersions = versions
            .map((version) => {
                try {
                    return normalizeVersion(version);
                }
                catch (error)
                {
                    return null;
                }
            })
            .filter(Boolean);

        const deduped = Array.from(new Set(normalizedVersions));
        const sorted = sortVersions(deduped);

        return {
            service: serviceSlug,
            latest: parsed.latest && sorted.includes(parsed.latest)
                ? parsed.latest
                : (sorted[sorted.length - 1] || null),
            versions: sorted,
            publishedAt: parsed.publishedAt && typeof parsed.publishedAt === "object"
                ? parsed.publishedAt
                : {}
        };
    }
    catch (error)
    {
        return buildFromFolders();
    }
}

function writeServiceMetadata(dataRoot, serviceSlug, metadata)
{
    const filePath = metadataFilePath(dataRoot, serviceSlug);
    fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2));
}

function buildPaths(dataRoot, service, version)
{
    const serviceSlug = normalizeSlug(service, "service");
    const versionSlug = normalizeVersion(version);
    const versionDir = path.join(dataRoot, serviceSlug, versionSlug);

    return {
        serviceSlug,
        versionSlug,
        versionDir,
        documentationFile: path.join(versionDir, "documentation.html"),
        specFile: path.join(versionDir, "openapi-spec.json")
    };
}

function publishDocs(dataRoot, input)
{
    const { serviceSlug, versionSlug, versionDir, documentationFile, specFile } = buildPaths(
        dataRoot,
        input.service,
        input.version
    );

    if (!input.openApiSpecBuffer)
    {
        throw new Error("openApiSpec file is required.");
    }

    ensureDirectory(versionDir);

    fs.writeFileSync(specFile, input.openApiSpecBuffer);

    if (input.documentationHtmlBuffer)
    {
        fs.writeFileSync(documentationFile, input.documentationHtmlBuffer);
    }

    const metadata = readServiceMetadata(dataRoot, serviceSlug);
    const publishedAt = new Date().toISOString();

    if (!metadata.versions.includes(versionSlug))
    {
        metadata.versions.push(versionSlug);
    }

    metadata.versions = sortVersions(metadata.versions);
    metadata.latest = metadata.versions[metadata.versions.length - 1] || versionSlug;
    metadata.publishedAt[versionSlug] = publishedAt;

    writeServiceMetadata(dataRoot, serviceSlug, metadata);

    return {
        service: serviceSlug,
        version: versionSlug,
        viewerPath: `/docs/${serviceSlug}/${versionSlug}`,
        documentationPath: fs.existsSync(documentationFile)
            ? `/docs/${serviceSlug}/${versionSlug}/documentation.html`
            : null,
        specPath: `/docs/${serviceSlug}/${versionSlug}/openapi-spec.json`,
        publishedAt
    };
}

function listServices(dataRoot)
{
    ensureDirectory(dataRoot);

    const services = [];
    const serviceEntries = fs.readdirSync(dataRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());

    for (const serviceEntry of serviceEntries)
    {
        const metadata = readServiceMetadata(dataRoot, serviceEntry.name);

        services.push({
            service: serviceEntry.name,
            latestVersion: metadata.latest,
            latestPublishedAt: metadata.latest ? (metadata.publishedAt[metadata.latest] || null) : null,
            versions: metadata.versions,
            versionTimestamps: metadata.publishedAt
        });
    }

    return services.sort((a, b) => a.service.localeCompare(b.service));
}

function listServiceVersions(dataRoot, service)
{
    const serviceSlug = normalizeSlug(service, "service");
    const serviceDir = path.join(dataRoot, serviceSlug);

    if (!fs.existsSync(serviceDir))
    {
        return null;
    }

    const metadata = readServiceMetadata(dataRoot, serviceSlug);

    return {
        service: serviceSlug,
        latestVersion: metadata.latest,
        versions: metadata.versions,
        versionTimestamps: metadata.publishedAt
    };
}

function getLatestVersion(dataRoot, service)
{
    const serviceSlug = normalizeSlug(service, "service");
    const serviceDir = path.join(dataRoot, serviceSlug);

    if (!fs.existsSync(serviceDir))
    {
        return null;
    }

    const metadata = readServiceMetadata(dataRoot, serviceSlug);

    if (!metadata.latest)
    {
        return null;
    }

    return {
        service: serviceSlug,
        latestVersion: metadata.latest
    };
}

module.exports = {
    ensureDirectory,
    normalizeSlug,
    normalizeVersion,
    publishDocs,
    listServices,
    listServiceVersions,
    getLatestVersion
};
