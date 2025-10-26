var express = require('express');
var mongoose = require('mongoose');
var User = require('../models/user');
var Task = require('../models/task');
var apiUtils = require('../utils/api');
var relationships = require('../utils/relationships');

var router = express.Router();
var ApiError = apiUtils.ApiError;
var parseQueryOptions = apiUtils.parseQueryOptions;
var sendResponse = apiUtils.sendResponse;
var handleControllerError = apiUtils.handleControllerError;

function parseSelectParam(query) {
    if (!query.select) {
        return undefined;
    }
    try {
        return JSON.parse(query.select);
    } catch (err) {
        throw new ApiError(400, 'Invalid JSON in query parameter "select"');
    }
}

function extractUserPayload(body) {
    var payload = {};
    payload.name = typeof body.name === 'string' ? body.name.trim() : '';
    payload.email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!payload.name) {
        throw new ApiError(400, 'User name is required');
    }
    if (!payload.email) {
        throw new ApiError(400, 'User email is required');
    }

    if (body.pendingTasks !== undefined) {
        if (!Array.isArray(body.pendingTasks)) {
            throw new ApiError(400, 'pendingTasks must be an array');
        }
        payload.pendingTasks = body.pendingTasks;
    }

    return payload;
}

async function ensureEmailUnique(email, excludeUserId) {
    var query = { email: email };
    if (excludeUserId) {
        query._id = { $ne: excludeUserId };
    }
    var existing = await User.findOne(query).lean();
    if (existing) {
        throw new ApiError(400, 'A user with that email already exists');
    }
}

router.get('/', async function (req, res) {
    try {
        var queryOptions = parseQueryOptions(req.query);
        var dbQuery = User.find(queryOptions.where);

        if (queryOptions.select) {
            dbQuery.select(queryOptions.select);
        }
        if (queryOptions.sort) {
            dbQuery.sort(queryOptions.sort);
        }
        if (queryOptions.skip) {
            dbQuery.skip(queryOptions.skip);
        }
        if (queryOptions.limit !== undefined) {
            dbQuery.limit(queryOptions.limit);
        }

        if (queryOptions.countOnly) {
            var count = await User.countDocuments(queryOptions.where);
            sendResponse(res, 200, 'User count retrieved', { count: count });
            return;
        }

        var users = await dbQuery.exec();
        sendResponse(res, 200, 'Users retrieved', users);
    } catch (err) {
        handleControllerError(res, err, 'Failed to fetch users');
    }
});

router.post('/', async function (req, res) {
    try {
        var payload = extractUserPayload(req.body);
        await ensureEmailUnique(payload.email);

        var user = new User({
            name: payload.name,
            email: payload.email
        });
        await user.save();

        if (payload.pendingTasks && payload.pendingTasks.length > 0) {
            await relationships.syncUserPendingTasks(user, payload.pendingTasks);
        }

        var freshUser = await User.findById(user._id);
        sendResponse(res, 201, 'User created', freshUser);
    } catch (err) {
        handleControllerError(res, err, 'Failed to create user');
    }
});

router.get('/:id', async function (req, res) {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            throw new ApiError(404, 'User not found');
        }
        var select = parseSelectParam(req.query);
        var dbQuery = User.findById(req.params.id);
        if (select) {
            dbQuery.select(select);
        }
        var user = await dbQuery.exec();
        if (!user) {
            throw new ApiError(404, 'User not found');
        }
        sendResponse(res, 200, 'User retrieved', user);
    } catch (err) {
        handleControllerError(res, err, 'Failed to fetch user');
    }
});

router.put('/:id', async function (req, res) {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            throw new ApiError(404, 'User not found');
        }
        var user = await User.findById(req.params.id);
        if (!user) {
            throw new ApiError(404, 'User not found');
        }

        var payload = extractUserPayload(req.body);
        await ensureEmailUnique(payload.email, user._id);

        user.name = payload.name;
        user.email = payload.email;

        if (payload.pendingTasks !== undefined) {
            await relationships.syncUserPendingTasks(user, payload.pendingTasks);
        } else {
            await user.save();
            await Task.updateMany(
                { assignedUser: user._id },
                { $set: { assignedUserName: user.name } }
            );
        }

        var updated = await User.findById(user._id);
        sendResponse(res, 200, 'User updated', updated);
    } catch (err) {
        handleControllerError(res, err, 'Failed to update user');
    }
});

router.delete('/:id', async function (req, res) {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            throw new ApiError(404, 'User not found');
        }
        var user = await User.findById(req.params.id);
        if (!user) {
            throw new ApiError(404, 'User not found');
        }

        await relationships.unassignTasksForUser(user._id);
        await user.deleteOne();

        sendResponse(res, 200, 'User deleted', user);
    } catch (err) {
        handleControllerError(res, err, 'Failed to delete user');
    }
});

module.exports = router;
