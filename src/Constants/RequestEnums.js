const RequestStatuses = Object.freeze({
    Pending: "pending"
});

const RequestKinds = Object.freeze({
    Existing: "existing",
    Created: "created"
});

const HttpMethods = Object.freeze({
    Post: "POST"
});

const ContentTypes = Object.freeze({
    ApplicationJson: "application/json"
});

const RequestDefaults = Object.freeze({
    AnonymousRequester: "anonymous",
    EndpointListSeparator: ",",
    EndpointPathPrefix: "/"
});

module.exports = {
    RequestStatuses,
    RequestKinds,
    HttpMethods,
    ContentTypes,
    RequestDefaults
};
