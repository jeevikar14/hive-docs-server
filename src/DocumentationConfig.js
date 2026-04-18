const path = require("path");

const ServerDefaults = require("./Constants/ServerDefaults");
const PermissionNames = require("./Constants/PermissionNames");
const ConfigDefaults = require("./Constants/ConfigDefaults");

const RootDirectory = path.resolve(__dirname, "..");

require("dotenv").config({ path: path.join(RootDirectory, ConfigDefaults.EnvFileName), override: true });

const documentationConfig = {
    port: Number(process.env.PORT || ServerDefaults.DocumentationServerPort),
    documentationBaseUrl: process.env.DOCS_BASE_URL || ConfigDefaults.DefaultDocsBaseUrl,
    dataRoot: process.env.DOCS_DATA_ROOT
        ? path.resolve(process.env.DOCS_DATA_ROOT)
        : path.join(RootDirectory, ConfigDefaults.DefaultDocsDirName),
    hive: {
        serviceName: process.env.HIVE_SERVICE_NAME || ConfigDefaults.DefaultServiceName,
        remoteUrl: process.env.HIVE_REMOTE_URL || `http://${ConfigDefaults.DefaultHiveLanIp}:${ServerDefaults.HivePortalPort}`,
        lanIp: process.env.HIVE_PORTAL_LAN_IP || ConfigDefaults.DefaultHiveLanIp,
        serverPassword: process.env.SERVER_PASSWORD || "",
        documentationPublishPermission: process.env.HIVE_DOCS_PUBLISH_PERMISSION || PermissionNames.OpenDocumentation,
        documentationViewPermission: process.env.HIVE_DOCS_VIEW_PERMISSION || PermissionNames.OpenDocumentation,
        portalServiceName: process.env.HIVE_PORTAL_SERVICE_NAME || ConfigDefaults.DefaultPortalServiceName
    }
};

module.exports = documentationConfig;
