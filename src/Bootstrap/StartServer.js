async function registerServiceUsingHiveSdk(registerService, hiveRegistrationState)
{
    hiveRegistrationState.state = "registering";
    hiveRegistrationState.attempts += 1;
    hiveRegistrationState.lastError = null;

    // Force advertise DOCS_BASE_URL as localUrl if set
    if (typeof registerService === 'function') {
        const documentationConfig = require("../DocumentationConfig");
        const localUrl = documentationConfig.documentationBaseUrl;
        if (localUrl) {
            await registerService({ localUrl });
        } else {
            await registerService();
        }
    } else {
        await registerService();
    }

    hiveRegistrationState.state = "registered";
    hiveRegistrationState.lastSuccessAt = new Date().toISOString();
}

async function startServer(options)
{
    const application = options.application;
    const documentationConfig = options.documentationConfig;
    const initServer = options.initServer;
    const loadConfiguration = options.loadConfiguration;
    const registerService = options.registerService;
    const serverDefaults = options.serverDefaults;
    const hiveRegistrationState = options.hiveRegistrationState;

    process.env.SERVER_PASSWORD = documentationConfig.hive.serverPassword;
    process.env.WORD = documentationConfig.hive.serverPassword;

    await initServer({
        serviceName: documentationConfig.hive.serviceName,
        servicePort: documentationConfig.port,
        remoteUrl: documentationConfig.hive.remoteUrl,
        serverPassword: documentationConfig.hive.serverPassword
    });

    await loadConfiguration();

    const ConfigDefaults = require("../Constants/ConfigDefaults");

    await new Promise((resolve) =>
    {
        // Prefer the explicitly requested bind host. For local development
        // default to 0.0.0.0 (all interfaces) rather than loopback.
        const requestedBind = process.env.DOCS_BIND_HOST;
        const fallbackBind = '0.0.0.0';

        function startListening(bindHost)
        {
            const server = application.listen(documentationConfig.port, bindHost, () =>
            {
                const baseUrl = documentationConfig.documentationBaseUrl || `http://${ConfigDefaults.DefaultHost}:${documentationConfig.port}`;
                console.log(`Global docs server running at ${baseUrl}`);
                console.log(`Documentation root: ${documentationConfig.dataRoot}`);
                console.log(`Hive service: ${documentationConfig.hive.serviceName}`);
                console.log(`Bound to host: ${bindHost}`);
                server.removeAllListeners('error');
                resolve();
            });

            server.on('error', (err) =>
            {
                if (err && err.code === 'EADDRNOTAVAIL' && bindHost !== fallbackBind)
                {
                    console.error(`Bind to ${bindHost} failed: ${err.message}. Falling back to ${fallbackBind}.`);
                    startListening(fallbackBind);
                    return;
                }

                console.error('Server listen error:', err && err.message);
                // resolve to avoid hanging if server cannot start
                resolve();
            });
        }

        startListening(requestedBind || fallbackBind);
    });

    try
    {
        await registerServiceUsingHiveSdk(registerService, hiveRegistrationState);
    }
    // After registering via the SDK, attempt a safe override so the portal
    // stores `local` as loopback (127.0.0.1) for this service. This avoids
    // modifying SDK code while ensuring homepage links resolve to localhost.
    catch (error)
    {
        hiveRegistrationState.state = "failed";
        hiveRegistrationState.lastError = error.message;
        console.error("Hive registration failed. Docs server will keep running:", error.message);

        setInterval(async () =>
        {
            if (hiveRegistrationState.state === "registered")
            {
                return;
            }

            try
            {
                console.log("Retrying Hive registration...");
                await registerServiceUsingHiveSdk(registerService, hiveRegistrationState);
            }
            catch (retryError)
            {
                hiveRegistrationState.state = "failed";
                hiveRegistrationState.lastError = retryError.message;
                console.error("Hive registration retry failed:", retryError.message);
            }
        }, 30000);
    }

    // Use the SDK's `registerService` behavior — do not override portal registration here.
}

module.exports = startServer;
