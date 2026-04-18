function registerPermissionRoutes(application, options)
{
    const routePaths = options.routePaths;
    const httpStatusCodes = options.httpStatusCodes;
    const texts = options.texts;

    application.get(routePaths.Permissions || '/permissions', (request, response) =>
    {
        response.json({ message: 'Permissions route available' });
    });
}

module.exports = registerPermissionRoutes;
