function registerSystemRoutes(application, options)
{
    const routePaths = options.routePaths;
    const documentationConfig = options.documentationConfig;
    const httpStatusCodes = options.httpStatusCodes;
    const hiveAuthenticationService = options.hiveAuthenticationService;
    const serverDefaults = options.serverDefaults;
    const hiveRegistrationState = options.hiveRegistrationState;
    const appInfo = options.appInfo;
    const texts = options.texts;
    const hivePaths = options.hivePaths;

    application.get(routePaths.Health, (request, response) =>
    {
        response.json({
            status: appInfo.HealthStatusOk,
            service: appInfo.ServiceName,
            timestamp: new Date().toISOString(),
            hiveRegistration: hiveRegistrationState
        });
    });

    

    application.get(routePaths.AuthStatus, async (request, response) =>
    {
        try
        {
            const isUserLoggedIn = await hiveAuthenticationService.isUserLoggedIn(request, response);

            if (!isUserLoggedIn)
            {
                response.json({
                    loggedIn: false,
                    canViewDocumentation: false,
                    loginPath: routePaths.LoginPage,
                    loginUrl: hiveAuthenticationService.buildHiveLoginUrl(request)
                });
                return;
            }

            const hasDocumentationViewPermission = await hiveAuthenticationService.hasPermission(
                request,
                response,
                documentationConfig.hive.documentationViewPermission
            );
            const hasDocumentationPublishPermission = await hiveAuthenticationService.hasPermission(
                request,
                response,
                documentationConfig.hive.documentationPublishPermission
            );

            response.json({
                loggedIn: true,
                hasDocumentationViewPermission,
                hasDocumentationPublishPermission,
                canViewDocumentation: Boolean(hasDocumentationViewPermission || hasDocumentationPublishPermission)
            });
        }
        catch (error)
        {
            response.status(httpStatusCodes.InternalServerError).json({ message: texts.AuthStatusError });
        }
    });
}

module.exports = registerSystemRoutes;
