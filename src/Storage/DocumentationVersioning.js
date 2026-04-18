const { StorageFieldNames, StorageTexts } = require("../Constants/StorageConstants");

class DocumentationVersioning
{
    static VersionPattern = /^v\d+\.\d+\.\d+$/;
    static VersionPrefix = "v";

    static normalizeSlug(value, fieldName)
    {
        const normalized = String(value || "").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");

        if (!normalized)
        {
            throw new Error(`${fieldName || StorageFieldNames.Service} is required.`);
        }

        return normalized;
    }

    static normalizeVersion(version)
    {
        const value = String(version || "").trim();

        if (!value)
        {
            throw new Error(StorageTexts.VersionRequired);
        }

        const withPrefix = value.startsWith(DocumentationVersioning.VersionPrefix)
            ? value
            : `${DocumentationVersioning.VersionPrefix}${value}`;

        if (!DocumentationVersioning.VersionPattern.test(withPrefix))
        {
            throw new Error(StorageTexts.VersionSemverInvalid);
        }

        return withPrefix;
    }

    static parseVersion(version)
    {
        const numeric = String(version)
            .replace(/^v/, "")
            .split(".")
            .map((segment) => Number(segment));

        return {
            major: numeric[0] || 0,
            minor: numeric[1] || 0,
            patch: numeric[2] || 0
        };
    }

    static compareVersions(left, right)
    {
        const leftVersion = DocumentationVersioning.parseVersion(left);
        const rightVersion = DocumentationVersioning.parseVersion(right);

        if (leftVersion.major !== rightVersion.major)
        {
            return leftVersion.major - rightVersion.major;
        }

        if (leftVersion.minor !== rightVersion.minor)
        {
            return leftVersion.minor - rightVersion.minor;
        }

        return leftVersion.patch - rightVersion.patch;
    }

    static sortVersions(versions)
    {
        return [...versions].sort(DocumentationVersioning.compareVersions);
    }
}

module.exports = DocumentationVersioning;
