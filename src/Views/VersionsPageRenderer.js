const RoutePaths = require("../Constants/RoutePaths");
const ViewDefaults = require("../Constants/ViewDefaults");

function renderVersionsPage(result)
{
    const serviceName = result.service || ViewDefaults.UnknownServiceName;
    const publishedAt = result.publishedAt || null;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${serviceName} - Documentation</title>
    <style>
        body {
            font-family: "Segoe UI", Tahoma, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f6f8fb;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th,
        td {
            border-bottom: 1px solid #e5e7eb;
            padding: 12px;
            text-align: left;
        }
        th {
            background: #f3f4f6;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>${serviceName}</h1>
        <p>Documentation for this service is available below.</p>
        ${publishedAt ? `<p><strong>Published At:</strong> ${new Date(publishedAt).toLocaleString()}</p>` : ""}
        <p><a href="${RoutePaths.DocumentationRoot}/${serviceName}/${"documentation.html"}">Open documentation</a></p>
    </div>
</body>
</html>`;
}

module.exports = renderVersionsPage;
