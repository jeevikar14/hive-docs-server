const ServerDefaults = Object.freeze({
    DocumentationServerPort: 49167,
    HivePortalPort: 49152,
    JsonBodyLimit: "2mb",
    
    LoginPopupWidth: 520,
    LoginPopupHeight: 620,
    LoginStatusMaxChecks: 60,
    LoginStatusCheckIntervalMs: 1200,
    SwaggerUiCdnCssUrl: null,
    SwaggerUiCdnBundleUrl: null
});

module.exports = ServerDefaults;
