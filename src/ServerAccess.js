function createServerAccess(options)
{
    const hiveAuthenticationService = options.hiveAuthenticationService;
    const httpStatusCodes = options.httpStatusCodes;
    const routePaths = options.routePaths;
    const headerNames = options.headerNames;
    const texts = options.texts;

    function sendUnauthorizedResponse(request, response)
    {
        if (hiveAuthenticationService.isApiRequest(request))
        {
            response.status(httpStatusCodes.Unauthorized).json({
                message: texts.Unauthorized,
                loginPath: routePaths.LoginPage,
                loginUrl: hiveAuthenticationService.buildHiveLoginUrl(request)
            });
            return;
        }

        response.redirect(routePaths.LoginPage);
    }

    function sendForbiddenPermissionResponse(response, payload)
    {
        response.status(httpStatusCodes.Forbidden).json({
            message: texts.Forbidden,
            ...payload
        });
    }

    async function requireHiveLogin(request, response, next)
    {
        try
        {
            const isUserLoggedIn = await hiveAuthenticationService.isUserLoggedIn(request, response);

            if (!isUserLoggedIn)
            {
                sendUnauthorizedResponse(request, response);
                return;
            }

            next();
        }
        catch (error)
        {
            sendUnauthorizedResponse(request, response);
        }
    }

    function requireHivePermission(permissionName)
    {
        return async (request, response, next) =>
        {
            try
            {
                const isUserLoggedIn = await hiveAuthenticationService.isUserLoggedIn(request, response);

                if (!isUserLoggedIn)
                {
                    sendUnauthorizedResponse(request, response);
                    return;
                }

                const isPermissionGranted = await hiveAuthenticationService.hasPermission(request, response, permissionName);

                if (!isPermissionGranted)
                {
                    sendForbiddenPermissionResponse(response, {
                        requiredPermission: permissionName
                    });
                    return;
                }

                next();
            }
            catch (error)
            {
                sendForbiddenPermissionResponse(response, {
                    requiredPermission: permissionName
                });
            }
        };
    }

    function requireAnyHivePermission(permissionNames)
    {
        const validPermissionNames = Array.isArray(permissionNames)
            ? permissionNames.filter(Boolean)
            : [];

        return async (request, response, next) =>
        {
            try
            {
                const isUserLoggedIn = await hiveAuthenticationService.isUserLoggedIn(request, response);

                if (!isUserLoggedIn)
                {
                    sendUnauthorizedResponse(request, response);
                    return;
                }

                const hasAnyPermission = await hiveAuthenticationService.hasAnyPermission(request, response, validPermissionNames);

                if (!hasAnyPermission)
                {
                    sendForbiddenPermissionResponse(response, {
                        requiredPermissions: validPermissionNames
                    });
                    return;
                }

                next();
            }
            catch (error)
            {
                sendForbiddenPermissionResponse(response, {
                    requiredPermissions: validPermissionNames
                });
            }
        };
    }

    function hydrateHiveHeaders(request, response, next)
    {
        if (!request.headers[headerNames.DeviceId] && request.cookies?.hiveDeviceId)
        {
            request.headers[headerNames.DeviceId] = request.cookies.hiveDeviceId;
        }

        if (!request.headers[headerNames.SessionToken] && request.cookies?.sessionToken)
        {
            request.headers[headerNames.SessionToken] = request.cookies.sessionToken;
        }

        next();
    }

    return {
        requireHiveLogin,
        requireHivePermission,
        requireAnyHivePermission,
        hydrateHiveHeaders
    };
}

module.exports = createServerAccess;
