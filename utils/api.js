function ApiError(status, message, data) {
    Error.captureStackTrace(this, ApiError);
    this.name = 'ApiError';
    this.status = status || 500;
    this.message = message || 'Unexpected error';
    if (data !== undefined) {
        this.data = data;
    }
}

ApiError.prototype = Object.create(Error.prototype);
ApiError.prototype.constructor = ApiError;

function parseJSON(input, field) {
    if (input === undefined) {
        return undefined;
    }
    try {
        return JSON.parse(input);
    } catch (err) {
        throw new ApiError(400, 'Invalid JSON in query parameter "' + field + '"');
    }
}

function toNonNegativeInteger(value, field) {
    if (value === undefined) {
        return undefined;
    }
    var parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || Math.floor(parsed) !== parsed) {
        throw new ApiError(400, 'Query parameter "' + field + '" must be a non-negative integer');
    }
    return parsed;
}

function parseQueryOptions(query, defaults) {
    defaults = defaults || {};
    var where = parseJSON(query.where, 'where') || {};
    var sort = parseJSON(query.sort, 'sort');
    var select = parseJSON(query.select, 'select');
    var skip = toNonNegativeInteger(query.skip, 'skip') || 0;
    var limit = toNonNegativeInteger(query.limit, 'limit');
    var countOnly = typeof query.count === 'string' && query.count.toLowerCase() === 'true';

    if (limit === undefined && defaults.defaultLimit !== undefined) {
        limit = defaults.defaultLimit;
    }

    if (countOnly) {
        limit = undefined;
        select = undefined;
        sort = undefined;
    }

    return {
        where: where,
        sort: sort,
        select: select,
        skip: skip,
        limit: limit,
        countOnly: countOnly
    };
}

function sendResponse(res, status, message, data) {
    res.status(status).json({
        message: message,
        data: data
    });
}

function handleControllerError(res, err, fallbackMessage) {
    if (err instanceof ApiError) {
        sendResponse(res, err.status, err.message, err.data || null);
        return;
    }
    console.error(fallbackMessage, err);
    sendResponse(res, 500, fallbackMessage, null);
}

module.exports = {
    ApiError: ApiError,
    parseQueryOptions: parseQueryOptions,
    sendResponse: sendResponse,
    handleControllerError: handleControllerError
};
