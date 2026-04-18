  const Texts = Object.freeze({
    Unauthorized: "Unauthorized.",
    Forbidden: "Forbidden.",
    RouteNotFound: "Route not found.",
    AuthStatusError: "Unable to determine auth status.",
    PermissionNameRequired: "permissionName is required.",
    AlreadyHasPermission: "You already have this permission.",
    
    PermissionForwarded: "Permission request sent to Hive server. Access will be granted after Hive approval and role assignment.",
    PermissionRecorded: "Permission request recorded. Ask Hive admin to approve by assigning the required role in Hive.",
    DocumentationPublished: "Documentation published successfully.",
    ServiceNotFound: "Service not found.",
    NoLatestVersion: "No latest version available for this service.",
    InvalidPath: "Invalid path.",
    DocumentationVersionNotFound: "Documentation version not found."
});

module.exports = Texts;