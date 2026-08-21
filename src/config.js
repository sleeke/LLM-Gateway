"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
exports.getConfigPath = getConfigPath;
var yaml = require("js-yaml");
var fs = require("fs");
var path = require("path");
var logger_1 = require("../utils/logger");
function loadConfig(configPath) {
    var fullPath = path.isAbsolute(configPath) ? configPath : path.join(process.cwd(), configPath);
    if (!fs.existsSync(fullPath)) {
        throw new Error("Config file not found: ".concat(fullPath));
    }
    var fileContent = fs.readFileSync(fullPath, 'utf-8');
    var rawConfig = yaml.load(fileContent);
    if (!rawConfig || typeof rawConfig !== 'object') {
        throw new Error('Config file is empty or invalid');
    }
    var server = rawConfig.server;
    var clients = rawConfig.clients;
    var providers = rawConfig.providers;
    var modelAliases = rawConfig.modelAliases;
    var sessions = rawConfig.sessions;
    if (!server) {
        throw new Error('Missing required config section: server');
    }
    if (!clients || !Array.isArray(clients) || clients.length === 0) {
        throw new Error('Missing required config section: clients (must be a non-empty array)');
    }
    if (!providers || typeof providers !== 'object') {
        throw new Error('Missing required config section: providers');
    }
    var resolvedConfig = {
        server: {
            host: resolveEnv(server.host, '127.0.0.1'),
            llmPort: Number(server.llmPort) || 8080,
            adminPort: Number(server.adminPort) || 3001,
            uiPort: Number(server.uiPort) || 3000,
            adminApiKey: server.adminApiKey !== undefined ? resolveEnv(server.adminApiKey) : undefined,
        },
        clients: clients.map(function (client, index) { return ({
            id: client.id,
            apiKey: resolveEnv(client.apiKey, "missing-client-key-".concat(index)),
            provider: client.provider,
        }); }),
        providers: Object.entries(providers).reduce(function (acc, _a) {
            var name = _a[0], provider = _a[1];
            acc[name] = {
                type: provider.type || 'openai',
                apiKey: resolveEnv(provider.apiKey, ''),
                baseURL: resolveEnv(provider.baseURL, ''),
            };
            return acc;
        }, {}),
        modelAliases: modelAliases || {},
        sessions: {
            file: (sessions === null || sessions === void 0 ? void 0 : sessions.file) || 'sessions.json',
        },
    };
    for (var _i = 0, _a = Object.entries(resolvedConfig.providers); _i < _a.length; _i++) {
        var _b = _a[_i], name_1 = _b[0], provider = _b[1];
        var p = provider;
        if (!p.baseURL) {
            throw new Error("Provider '".concat(name_1, "' is missing baseURL"));
        }
    }
    logger_1.logger.info('Config loaded', {
        clients: resolvedConfig.clients.length,
        providers: Object.keys(resolvedConfig.providers),
    });
    return resolvedConfig;
}
function resolveEnv(value, defaultValue) {
    if (!value) {
        if (defaultValue !== undefined) {
            return defaultValue;
        }
        throw new Error('Empty value provided to resolveEnv');
    }
    var envVarMatch = value.match(/^\$\{([^}]+)\}$/);
    if (envVarMatch) {
        var envVarName = envVarMatch[1];
        var envValue = process.env[envVarName];
        if (envValue === undefined || envValue === '') {
            throw new Error("Environment variable '".concat(envVarName, "' is not set or empty"));
        }
        return envValue;
    }
    return value;
}
function getConfigPath() {
    return path.join(process.cwd(), 'config', 'config.yaml');
}
