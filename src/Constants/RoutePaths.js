const RoutePaths = Object.freeze({
    Health: "/Health",
    
    AuthStatus: "/AuthStatus",
    Logout: "/Logout",
    LoginPage: "/Login.html",
    
    Services: "/Services",
    ServiceVersions: "/ServiceVersions/:service",
    DocumentationService: "/Docs/:service",
    DocumentationLatest: "/Docs/:service/latest",
    DocumentationVersion: "/Docs/:service/:version",
    DocumentationRoot: "/Docs",
    Publish: "/Publish"
});

module.exports = RoutePaths;
