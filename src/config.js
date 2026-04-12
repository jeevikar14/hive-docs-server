const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");

const config = {
    port: Number(process.env.PORT || 4500),
    dataRoot: process.env.DOCS_DATA_ROOT
        ? path.resolve(process.env.DOCS_DATA_ROOT)
        : path.join(ROOT_DIR, "data")
};

module.exports = config;
