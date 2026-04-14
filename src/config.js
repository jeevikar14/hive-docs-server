const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");

require("dotenv").config({ path: path.join(ROOT_DIR, ".env"), override: true });

const config = {
    port: Number(process.env.PORT || 4500),
    docsBaseUrl: process.env.DOCS_BASE_URL || "",
    dataRoot: process.env.DOCS_DATA_ROOT
        ? path.resolve(process.env.DOCS_DATA_ROOT)
        : path.join(ROOT_DIR, "data"),
    hive: {
        serviceName: process.env.HIVE_SERVICE_NAME || "GlobalDocumentationServer",
        remoteUrl: process.env.HIVE_REMOTE_URL || "http://127.0.0.1:49152",
        serverPassword: process.env.SERVER_PASSWORD || "",
        docsPublishPermission: process.env.HIVE_DOCS_PUBLISH_PERMISSION || "DOCS_PUBLISH",
        docsViewPermission: process.env.HIVE_DOCS_VIEW_PERMISSION || "DOCS_VIEW"
    }
};

module.exports = config;
