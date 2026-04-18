const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");
const cookieParser = require("cookie-parser");
const {
    initServer,
    loadConfiguration,
    handleHiveRequests,
    isLoggedIn,
    isLoggedInWithPermission,
    registerService
} = require("@hivedev/hivesdk/server");

const documentationConfig = require("./DocumentationConfig");
const AppInfo = require("./Constants/AppInfo");
const DocumentationFiles = require("./Constants/DocumentationFiles");
const HivePaths = require("./Constants/HivePaths");
const HttpStatusCodes = require("./Constants/HttpStatusCodes");
const HeaderNames = require("./Constants/HeaderNames");
const RegistrationStates = require("./Constants/RegistrationStates");
const RoutePaths = require("./Constants/RoutePaths");
const ServerDefaults = require("./Constants/ServerDefaults");
const Texts = require("./Constants/Texts");
const DocumentationStore = require("./Storage/DocumentationStore");
const HiveAuthenticationService = require("./Services/HiveAuthenticationService");
const createServerAccess = require("./ServerAccess");
const startServer = require("./Bootstrap/StartServer");
const registerSystemRoutes = require("./Routes/RegisterSystemRoutes");
const registerPermissionRoutes = require("./Routes/RegisterPermissionRoutes");
const registerDocumentationRoutes = require("./Routes/RegisterDocumentationRoutes");
const registerPublishRoutes = require("./Routes/RegisterPublishRoutes");

const application = express();
const uploadMiddleware = multer({ storage: multer.memoryStorage() });

const hiveRegistrationState = {
    state: RegistrationStates.NotStarted,
    lastSuccessAt: null,
    lastError: null,
    attempts: 0
};

const hiveAuthenticationService = new HiveAuthenticationService({
    documentationConfig,
    routePaths: RoutePaths,
    serverDefaults: ServerDefaults,
    sdk: {
        isLoggedIn,
        isLoggedInWithPermission
    },
    hivePaths: HivePaths
});


const serverAccess = createServerAccess({
    hiveAuthenticationService,
    httpStatusCodes: HttpStatusCodes,
    routePaths: RoutePaths,
    headerNames: HeaderNames,
    texts: Texts
});

const requireDocumentationViewPermission = serverAccess.requireAnyHivePermission([
    documentationConfig.hive.documentationViewPermission,
    documentationConfig.hive.documentationPublishPermission
]);

DocumentationStore.ensureDirectory(documentationConfig.dataRoot);


application.use(express.json({ limit: ServerDefaults.JsonBodyLimit }));
application.use(cookieParser());
application.use(serverAccess.hydrateHiveHeaders);
application.use(handleHiveRequests); // SDK middleware FIRST

application.get("/hive-client.js", (req, res) => {
    res.setHeader("Content-Type", "application/javascript");
    fs.createReadStream(path.resolve(__dirname, "../node_modules/@hivedev/hivesdk/hive-client.js")).pipe(res);
});

application.use(express.static(path.join(__dirname, "..", "public"), { index: "Index.html" }));

registerSystemRoutes(application, {
    routePaths: RoutePaths,
    documentationConfig,
    httpStatusCodes: HttpStatusCodes,
    hiveAuthenticationService,
    sdk: {
        isLoggedIn,
        isLoggedInWithPermission
    },
    appInfo: AppInfo,
    texts: Texts,
    serverDefaults: ServerDefaults,
    hiveRegistrationState,
    hivePaths: HivePaths
});

registerDocumentationRoutes(application, {
    fs,
    routePaths: RoutePaths,
    documentationConfig,
    httpStatusCodes: HttpStatusCodes,
    requireDocumentationViewPermission,
    texts: Texts
});

registerPublishRoutes(application, {
    routePaths: RoutePaths,
    documentationConfig,
    httpStatusCodes: HttpStatusCodes,
    uploadMiddleware,
    requireHivePermission: serverAccess.requireHivePermission,
    texts: Texts
});

application.use((request, response) => {
    response.status(HttpStatusCodes.NotFound).json({ message: Texts.RouteNotFound });
});

startServer({
    application,
    documentationConfig,
    initServer,
    loadConfiguration,
    registerService,
    serverDefaults: ServerDefaults,
    hiveRegistrationState
}).catch((error) =>
{
    console.error("Failed to start global docs server:", error.message);
    process.exit(1);
});