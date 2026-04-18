class HiveAuthenticationService
{
    constructor(options)
    {
        this.documentationConfig = options.documentationConfig;
        this.routePaths = options.routePaths;
        this.serverDefaults = options.serverDefaults;
        this.sdk = options.sdk;
        this.hivePaths = options.hivePaths;
    }

    getHivePortalBaseUrl(request)
    {
        if (this.documentationConfig.hive.remoteUrl)
        {
            return this.documentationConfig.hive.remoteUrl.replace(/\/$/, "");
        }

        const ConfigDefaults = require("../Constants/ConfigDefaults");
        const configuredLanIp = this.documentationConfig.hive.lanIp || process.env.HIVE_PORTAL_LAN_IP || ConfigDefaults.DefaultHiveLanIp;
        return `http://${configuredLanIp}:${this.serverDefaults.HivePortalPort}`;
    }

    getDocumentationServerBaseUrl(request)
    {
        if (this.documentationConfig.documentationBaseUrl)
        {
            return this.documentationConfig.documentationBaseUrl.replace(/\/$/, "");
        }

        const ConfigDefaults = require("../Constants/ConfigDefaults");
        const requestProtocol = request?.protocol || "http";
        const requestHost = request?.get ? request.get("host") : `${ConfigDefaults.DefaultHost}:${this.documentationConfig.port}`;
        return `${requestProtocol}://${requestHost}`;
    }

    buildHiveLoginUrl(request)
    {
        const redirectUrl = `${this.getDocumentationServerBaseUrl(request)}${request.originalUrl || "/"}`;
        return `${this.getHivePortalBaseUrl(request)}${this.hivePaths.PortalLoginPage}?redirectUrl=${encodeURIComponent(redirectUrl)}`;
    }

    isApiRequest(request)
    {
        const requestPath = String(request.path || "");
        const serviceVersionsPathPrefix = this.routePaths.ServiceVersions.replace(":service", "");

        return requestPath === this.routePaths.AuthStatus
            || requestPath === this.routePaths.Services
            || requestPath.startsWith(serviceVersionsPathPrefix)
            || requestPath === this.routePaths.Publish;
    }

    async isUserLoggedIn(request, response)
    {
        return this.sdk.isLoggedIn(request, response, false);
    }

    async hasPermission(request, response, permissionName)
    {
        request.body = request.body || {};
        request.body.permissionName = permissionName;

        return this.sdk.isLoggedInWithPermission(request, response, false);
    }

    async hasAnyPermission(request, response, permissionNames)
    {
        const validPermissionNames = Array.isArray(permissionNames)
            ? permissionNames.filter(Boolean)
            : [];

        for (const permissionName of validPermissionNames)
        {
            const isPermissionGranted = await this.hasPermission(request, response, permissionName);

            if (isPermissionGranted)
            {
                return true;
            }
        }

        return false;
    }
}

module.exports = HiveAuthenticationService;
